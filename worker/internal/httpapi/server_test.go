package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"appclimb.app/backend/internal/config"
	"appclimb.app/backend/internal/database"
	"appclimb.app/backend/internal/entitlement"
)

func TestHandlerRoutesDoNotConflict(t *testing.T) {
	server := &Server{
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
		limiter: newIPRateLimiter(1, 1),
	}
	if handler := server.Handler(); handler == nil {
		t.Fatal("handler was not created")
	}
}

func TestAnalyticsHelpersMinimizeAndValidateCollectedData(t *testing.T) {
	if country := analyticsCountry(" uz "); country != "UZ" {
		t.Fatalf("expected normalized country, got %q", country)
	}
	if country := analyticsCountry("USA"); country != "" {
		t.Fatalf("invalid country must be discarded, got %q", country)
	}
	path, ok := analyticsPath("/pricing?email=private@example.com#plan")
	if !ok || path != "/pricing" {
		t.Fatalf("query and fragment must not be stored, got %q ok=%v", path, ok)
	}
	if _, ok := analyticsPath("https://example.com/private"); ok {
		t.Fatal("absolute URLs must not be accepted as analytics paths")
	}
	if got := analyticsText("абвг", 3); got != "абв" {
		t.Fatalf("analytics text must truncate on rune boundaries, got %q", got)
	}
}

func TestWorkspaceRateLimitDoesNotCoupleDifferentCustomers(t *testing.T) {
	now := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	server := &Server{
		Now:     func() time.Time { return now },
		limiter: newIPRateLimiter(1, time.Minute),
	}
	handler := server.rateLimitedByWorkspace(
		func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		},
	)
	call := func(workspaceID string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(
			http.MethodPost,
			"/v1/billing/checkout-binding",
			nil,
		)
		request.RemoteAddr = "127.0.0.1:1234"
		request = request.WithContext(context.WithValue(
			request.Context(),
			authContextKey,
			authContext{WorkspaceID: workspaceID},
		))
		response := httptest.NewRecorder()
		handler(response, request)
		return response
	}

	if response := call("workspace-1"); response.Code != http.StatusNoContent {
		t.Fatalf("first workspace request should pass, got %d", response.Code)
	}
	if response := call("workspace-1"); response.Code != http.StatusTooManyRequests {
		t.Fatalf("repeated workspace request should be limited, got %d", response.Code)
	}
	if response := call("workspace-2"); response.Code != http.StatusNoContent {
		t.Fatalf("another workspace sharing the proxy should pass, got %d", response.Code)
	}
}

func TestRequireEntitlementUsesStablePaymentRequiredResponse(t *testing.T) {
	now := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	server := &Server{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now:    func() time.Time { return now },
		EntitlementLookup: func(
			_ context.Context,
			workspaceID string,
		) (entitlement.State, error) {
			if workspaceID != "workspace-1" {
				t.Fatalf("unexpected workspace lookup: %s", workspaceID)
			}
			return entitlement.State{
				Status:      "trialing",
				TrialEndsAt: now,
			}, nil
		},
	}
	called := false
	handler := server.requireEntitlement(func(http.ResponseWriter, *http.Request) {
		called = true
	})
	request := httptest.NewRequest(http.MethodPost, "/v1/sources/posthog/sync", nil)
	request = request.WithContext(context.WithValue(
		request.Context(),
		authContextKey,
		authContext{WorkspaceID: "workspace-1"},
	))
	response := httptest.NewRecorder()
	handler(response, request)
	if called {
		t.Fatal("expired workspace must not reach paid handler")
	}
	if response.Code != http.StatusPaymentRequired {
		t.Fatalf("want 402, got %d", response.Code)
	}
	var payload map[string]string
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["error"] != "entitlement_required" {
		t.Fatalf("want entitlement_required, got %q", payload["error"])
	}
}

func TestRequireEntitlementAllowsCurrentPaidPeriod(t *testing.T) {
	now := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	endsAt := now.Add(time.Hour)
	server := &Server{
		Now: func() time.Time { return now },
		EntitlementLookup: func(
			context.Context,
			string,
		) (entitlement.State, error) {
			return entitlement.State{
				Status:            "active",
				EntitlementEndsAt: &endsAt,
			}, nil
		},
	}
	called := false
	handler := server.requireEntitlement(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	})
	request := httptest.NewRequest(http.MethodPost, "/paid", nil)
	request = request.WithContext(context.WithValue(
		request.Context(),
		authContextKey,
		authContext{WorkspaceID: "workspace-1"},
	))
	response := httptest.NewRecorder()
	handler(response, request)
	if !called || response.Code != http.StatusNoContent {
		t.Fatalf("current paid workspace should pass, called=%v status=%d", called, response.Code)
	}
}

func TestCreateCheckoutBindingIsAuthenticatedPriceBoundAndHashOnly(
	t *testing.T,
) {
	now := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	server := &Server{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now:    func() time.Time { return now },
		Config: config.Config{
			PaddleWebhookSecret:   "secret",
			PaddleProductID:       "pro_appclimb",
			PaddleProductIdentity: "appclimb-pro",
			PaddleAllowedPriceIDs: []string{"pri_yearly"},
		},
	}
	var storedWorkspace, storedPrice string
	var storedHash []byte
	var storedExpiry time.Time
	server.CheckoutBindingCreator = func(
		_ context.Context,
		workspaceID, priceID string,
		tokenHash []byte,
		expiresAt time.Time,
	) error {
		storedWorkspace = workspaceID
		storedPrice = priceID
		storedHash = append([]byte(nil), tokenHash...)
		storedExpiry = expiresAt
		return nil
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/billing/checkout-binding",
		strings.NewReader(`{"priceId":"pri_yearly"}`),
	)
	request = request.WithContext(context.WithValue(
		request.Context(),
		authContextKey,
		authContext{
			WorkspaceID: "workspace-1",
			Role:        "owner",
		},
	))
	response := httptest.NewRecorder()
	server.createCheckoutBinding(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("want 201, got %d: %s", response.Code, response.Body.String())
	}
	var payload struct {
		Data struct {
			CheckoutBinding string    `json:"checkoutBinding"`
			PriceID         string    `json:"priceId"`
			ExpiresAt       time.Time `json:"expiresAt"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(payload.Data.CheckoutBinding, "acb_") ||
		storedWorkspace != "workspace-1" ||
		storedPrice != "pri_yearly" ||
		len(storedHash) != sha256.Size ||
		!storedExpiry.Equal(now.Add(checkoutBindingTTL)) ||
		!payload.Data.ExpiresAt.Equal(storedExpiry) {
		t.Fatalf(
			"unexpected binding response/store: payload=%+v workspace=%q price=%q hash=%d expiry=%s",
			payload,
			storedWorkspace,
			storedPrice,
			len(storedHash),
			storedExpiry,
		)
	}
	if strings.Contains(string(storedHash), payload.Data.CheckoutBinding) {
		t.Fatal("raw checkout binding must not be persisted")
	}
}

func TestCreateCheckoutBindingReportsPendingAndExistingSubscriptionConflicts(
	t *testing.T,
) {
	tests := []struct {
		name      string
		storeErr  error
		errorCode string
	}{
		{
			name:      "pending checkout",
			storeErr:  database.ErrCheckoutPending,
			errorCode: "checkout_already_pending",
		},
		{
			name:      "existing subscription",
			storeErr:  database.ErrSubscriptionExists,
			errorCode: "billing_subscription_exists",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := &Server{
				Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
				Now:    time.Now,
				Config: config.Config{
					PaddleWebhookSecret:   "secret",
					PaddleProductID:       "pro_appclimb",
					PaddleProductIdentity: "appclimb-pro",
					PaddleAllowedPriceIDs: []string{"pri_yearly"},
				},
				CheckoutBindingCreator: func(
					context.Context,
					string,
					string,
					[]byte,
					time.Time,
				) error {
					return test.storeErr
				},
			}
			request := httptest.NewRequest(
				http.MethodPost,
				"/v1/billing/checkout-binding",
				strings.NewReader(`{"priceId":"pri_yearly"}`),
			)
			request = request.WithContext(context.WithValue(
				request.Context(),
				authContextKey,
				authContext{WorkspaceID: "workspace-1", Role: "owner"},
			))
			response := httptest.NewRecorder()

			server.createCheckoutBinding(response, request)

			if response.Code != http.StatusConflict {
				t.Fatalf("want 409, got %d: %s", response.Code, response.Body.String())
			}
			if !strings.Contains(
				response.Body.String(),
				`"error":"`+test.errorCode+`"`,
			) {
				t.Fatalf("want %s, got %s", test.errorCode, response.Body.String())
			}
		})
	}
}

func TestPaddleWebhookValidatesProductBeforeRecordingEntitlement(t *testing.T) {
	now := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	secret := "pdl_webhook_secret"
	server := &Server{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now:    func() time.Time { return now },
		Config: config.Config{
			PaddleWebhookSecret:   secret,
			PaddleProductID:       "pro_appclimb",
			PaddleProductIdentity: "appclimb-pro",
			PaddleAllowedPriceIDs: []string{"pri_monthly"},
		},
	}
	var recordedUpdate *database.BillingSubscriptionUpdate
	var recordedPayload json.RawMessage
	server.BillingEventRecorder = func(
		_ context.Context,
		_, _ string,
		_ time.Time,
		payload json.RawMessage,
		update *database.BillingSubscriptionUpdate,
	) (database.BillingEventResult, error) {
		recordedPayload = append(json.RawMessage(nil), payload...)
		recordedUpdate = update
		return database.BillingEventResult{
			Inserted:               true,
			Reason:                 "unbound",
			ReconciliationRequired: true,
		}, nil
	}
	body := []byte(`{
		"event_id":"evt_1",
		"event_type":"subscription.updated",
		"occurred_at":"2026-07-25T12:00:00Z",
		"data":{
			"id":"sub_1",
			"customer_id":"ctm_1",
			"transaction_id":"txn_1",
			"status":"active",
			"custom_data":{
				"product":"appclimb-pro",
				"workspace_id":"workspace-client",
				"checkout_binding":"acb_sensitive_token"
			},
			"items":[{"price":{"id":"pri_monthly","product_id":"pro_appclimb"}}],
			"current_billing_period":{"ends_at":"2026-08-25T12:00:00Z"}
		}
	}`)
	response := callPaddleWebhook(t, server, body, secret, now)
	if response.Code != http.StatusOK {
		t.Fatalf("want 200, got %d: %s", response.Code, response.Body.String())
	}
	if recordedUpdate == nil ||
		recordedUpdate.SubscriptionID != "sub_1" ||
		recordedUpdate.CustomWorkspaceID != "workspace-client" ||
		recordedUpdate.CheckoutBinding != "acb_sensitive_token" {
		t.Fatalf("expected validated subscription update, got %+v", recordedUpdate)
	}
	if strings.Contains(string(recordedPayload), "acb_sensitive_token") ||
		strings.Contains(string(recordedPayload), "checkout_binding") {
		t.Fatalf("stored billing payload retained one-time token: %s", recordedPayload)
	}
	if !strings.Contains(response.Body.String(), `"ignored":"unbound"`) {
		t.Fatalf("unbound event must be recorded but not applied: %s", response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"reconciliationRequired":true`) {
		t.Fatalf("unbound payment must expose reconciliation state: %s", response.Body.String())
	}

	recordedUpdate = &database.BillingSubscriptionUpdate{}
	wrongPrice := []byte(strings.ReplaceAll(
		string(body),
		"pri_monthly",
		"pri_other",
	))
	response = callPaddleWebhook(t, server, wrongPrice, secret, now)
	if response.Code != http.StatusOK {
		t.Fatalf("irrelevant signed product should be acknowledged, got %d", response.Code)
	}
	if recordedUpdate != nil {
		t.Fatalf("disallowed price must not produce entitlement update: %+v", recordedUpdate)
	}
	if !strings.Contains(response.Body.String(), `"ignored":"product_not_allowed"`) {
		t.Fatalf("want product_not_allowed response, got %s", response.Body.String())
	}
}

func TestGrowthSnapshotLinksEvidenceToOwnedStage(t *testing.T) {
	now := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	snapshot := growthSnapshot(
		now,
		database.Workspace{
			Name:              "Workspace",
			DefaultAppID:      "app-1",
			DefaultAppName:    "App",
			DefaultStorefront: "US",
		},
		[]database.Metric{
			{
				Provider:     "posthog",
				Key:          "activated_users",
				OccurredAt:   now.Add(-time.Hour),
				Value:        12,
				Unit:         "count",
				Completeness: 1,
			},
		},
		nil,
		[]database.InsightRecord{
			{
				ID:          "insight-1",
				StageID:     "activate",
				EvidenceIDs: []string{"evidence-from-insight"},
			},
		},
		[]database.EvidenceRecord{
			{
				ID:         "evidence-from-metric",
				MetricKeys: []string{"activated_users"},
			},
		},
		nil,
		nil,
	)
	stages, ok := snapshot["stages"].([]map[string]any)
	if !ok {
		t.Fatalf("unexpected stages payload: %#v", snapshot["stages"])
	}
	for _, stage := range stages {
		evidenceIDs, ok := stage["evidenceIds"].([]string)
		if !ok {
			t.Fatalf("stage evidence IDs must always be an array: %#v", stage)
		}
		if stage["id"] != "activate" {
			if len(evidenceIDs) != 0 {
				t.Fatalf("unrelated stage received evidence: %#v", stage)
			}
			continue
		}
		if len(evidenceIDs) != 2 ||
			evidenceIDs[0] != "evidence-from-insight" ||
			evidenceIDs[1] != "evidence-from-metric" {
			t.Fatalf("activation evidence lineage missing: %#v", evidenceIDs)
		}
	}
}

func callPaddleWebhook(
	t *testing.T,
	server *Server,
	body []byte,
	secret string,
	now time.Time,
) *httptest.ResponseRecorder {
	t.Helper()
	timestamp := strconv.FormatInt(now.Unix(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp + ":"))
	_, _ = mac.Write(body)
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/billing/webhook",
		strings.NewReader(string(body)),
	)
	request.Header.Set(
		"Paddle-Signature",
		"ts="+timestamp+";h1="+hex.EncodeToString(mac.Sum(nil)),
	)
	response := httptest.NewRecorder()
	server.paddleWebhook(response, request)
	return response
}
