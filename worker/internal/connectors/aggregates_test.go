package connectors

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestChartRowSupportsMillisecondTimestamps(t *testing.T) {
	row := []any{json.Number("1784808000000"), json.Number("42.5")}
	occurredAt, value, ok := chartRow(row)
	if !ok {
		t.Fatal("chart row was not parsed")
	}
	if occurredAt.Year() != 2026 || value != 42.5 {
		t.Fatalf("unexpected chart row: %s %f", occurredAt, value)
	}
}

func TestExternalProviderURLRejectsPrivateHosts(t *testing.T) {
	for _, raw := range []string{
		"http://example.com",
		"https://localhost/api",
		"https://127.0.0.1/api",
		"https://10.0.0.4/api",
	} {
		parsed, err := url.Parse(raw)
		if err != nil {
			t.Fatal(err)
		}
		if err := validateExternalHTTPS(parsed); err == nil {
			t.Fatalf("expected %s to be rejected", raw)
		}
	}
	parsed, _ := url.Parse("https://us.posthog.com")
	if err := validateExternalHTTPS(parsed); err != nil {
		t.Fatalf("public HTTPS URL should be accepted: %v", err)
	}
}

func TestCompletenessUsesProviderLag(t *testing.T) {
	to := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	if got := completeness(to, to.AddDate(0, 0, -3), 2); got != 1 {
		t.Fatalf("expected complete point, got %f", got)
	}
	if got := completeness(to, to.AddDate(0, 0, -1), 2); got >= 1 {
		t.Fatalf("expected provisional point, got %f", got)
	}
}

func TestReadSuperwallMarksOverviewAsNonAdditiveRangeSnapshot(t *testing.T) {
	now := time.Date(2026, 7, 24, 12, 0, 0, 0, time.UTC)
	requestedFrom := ""
	client := &Client{
		HTTP: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			requestedFrom = request.URL.Query().Get("from")
			body := `{"statistics":[` +
				`{"key":"paywall_views","name":"Paywall Views","value":{"type":"NUMBER","value":100}},` +
				`{"key":"paywall_conversion","name":"Paywall Conversion","value":{"type":"NUMBER","value":25}}` +
				`]}`
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(body)),
				Request:    request,
			}, nil
		})},
		Now: func() time.Time { return now },
	}
	from := time.Date(2026, 4, 25, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 7, 24, 0, 0, 0, 0, time.UTC)
	snapshotFrom := to.AddDate(0, 0, -superwallSnapshotDays)
	rows, err := client.readSuperwall(
		context.Background(),
		map[string]any{"apiKey": "key", "projectId": "project", "applicationId": "app"},
		from,
		to,
	)
	if err != nil {
		t.Fatalf("readSuperwall: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("want 2 range snapshots, got %d", len(rows))
	}
	if requestedFrom != snapshotFrom.Format(time.RFC3339) {
		t.Fatalf("overview must align to the 30-day diagnosis window, got from=%q", requestedFrom)
	}
	for _, row := range rows {
		if row.Dimensions["aggregation"] != "range_snapshot" {
			t.Fatalf("metric %s missing range_snapshot marker: %+v", row.MetricKey, row.Dimensions)
		}
		if row.Dimensions["window_from"] != snapshotFrom.Format(time.RFC3339Nano) ||
			row.Dimensions["window_to"] != to.Format(time.RFC3339Nano) {
			t.Fatalf("metric %s lost range boundaries: %+v", row.MetricKey, row.Dimensions)
		}
		switch row.MetricKey {
		case "paywall_views":
			if row.Unit != rangeCountUnit || row.Value != 100 {
				t.Fatalf("paywall views: want range_count 100, got %s %v", row.Unit, row.Value)
			}
		case "paywall_conversion":
			if row.Unit != rangeRatioUnit || row.Value != 0.25 {
				t.Fatalf("conversion: want range_ratio 0.25, got %s %v", row.Unit, row.Value)
			}
		}
	}
}

func TestReadPostHogCountsDistinctPeopleForConfiguredEvents(t *testing.T) {
	now := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	var query string
	client := &Client{
		HTTP: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			if request.URL.String() != "https://us.posthog.com/api/projects/project-1/query/" {
				t.Fatalf("unexpected endpoint: %s", request.URL)
			}
			if request.Header.Get("Authorization") != "Bearer phx_key" {
				t.Fatalf("missing PostHog bearer token")
			}
			var payload struct {
				Query struct {
					Query string `json:"query"`
				} `json:"query"`
			}
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				t.Fatal(err)
			}
			query = payload.Query.Query
			body := `{"results":[` +
				`["2026-07-24T00:00:00Z","first_value_reached",12],` +
				`["2026-07-24T00:00:00Z","mobile_session",30]` +
				`]}`
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       io.NopCloser(strings.NewReader(body)),
				Request:    request,
			}, nil
		})},
		Now: func() time.Time { return now },
	}
	rows, err := client.readPostHog(
		context.Background(),
		map[string]any{
			"personalApiKey":  "phx_key",
			"projectId":       "project-1",
			"host":            "https://us.posthog.com",
			"activationEvent": "first_value_reached",
			"sessionEvent":    "mobile_session",
		},
		time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC),
		time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC),
	)
	if err != nil {
		t.Fatalf("readPostHog: %v", err)
	}
	if !strings.Contains(query, "count(distinct person_id)") ||
		!strings.Contains(query, "'first_value_reached'") ||
		!strings.Contains(query, "'mobile_session'") {
		t.Fatalf("query must count distinct people for configured events: %s", query)
	}
	if len(rows) != 2 ||
		rows[0].MetricKey != "activated_users" ||
		rows[0].Value != 12 ||
		rows[1].MetricKey != "active_users" ||
		rows[1].Value != 30 {
		t.Fatalf("unexpected PostHog aggregates: %+v", rows)
	}
}

func TestAppleMissingAppIDReturnsValidationErrorWithoutPanic(t *testing.T) {
	client := &Client{Now: time.Now}
	credentials := map[string]any{
		"issuerId":   "issuer",
		"keyId":      "key",
		"privateKey": "not-reached",
	}
	_, err := client.readApple(
		context.Background(),
		credentials,
		time.Now().AddDate(0, 0, -1),
		time.Now(),
	)
	var providerErr ProviderError
	if !errors.As(err, &providerErr) {
		t.Fatalf("want ProviderError, got %v", err)
	}
	if providerErr.Code != "apple_app_id_required" || providerErr.Status != http.StatusBadRequest {
		t.Fatalf("want apple_app_id_required/400, got %+v", providerErr)
	}

	_, err = client.Verify(context.Background(), "app-store-connect", credentials)
	if !errors.As(err, &providerErr) || providerErr.Code != "apple_app_id_required" {
		t.Fatalf("verification must reject missing appId before network/token work, got %v", err)
	}
}

func TestPublicIP(t *testing.T) {
	if publicIP(net.ParseIP("192.168.1.2")) {
		t.Fatal("private IP must be rejected")
	}
	if !publicIP(net.ParseIP("8.8.8.8")) {
		t.Fatal("public IP should be accepted")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}
