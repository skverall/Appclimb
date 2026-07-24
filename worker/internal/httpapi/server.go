package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"appclimb.app/backend/internal/auth"
	"appclimb.app/backend/internal/billing"
	"appclimb.app/backend/internal/config"
	"appclimb.app/backend/internal/connectors"
	"appclimb.app/backend/internal/database"
	"appclimb.app/backend/internal/diagnoser"
	"appclimb.app/backend/internal/secure"
	"appclimb.app/backend/internal/syncer"
	"github.com/google/uuid"
)

const maxJSONBody = 1 << 20

type Server struct {
	Logger     *slog.Logger
	DB         *database.DB
	Config     config.Config
	Connectors *connectors.Client
	Tokens     auth.TokenIssuer
	Now        func() time.Time
	limiter    *ipRateLimiter
}

type authContext struct {
	UserID      string
	WorkspaceID string
	Role        string
}

type contextKey string

const authContextKey contextKey = "auth"

func New(
	logger *slog.Logger,
	db *database.DB,
	cfg config.Config,
) *Server {
	return &Server{
		Logger:     logger,
		DB:         db,
		Config:     cfg,
		Connectors: connectors.NewClient().WithConfig(cfg.AppleBaseURL, cfg.AppleReportLagDays),
		Tokens: auth.TokenIssuer{
			Key:       cfg.JWTSigningKey,
			AccessTTL: cfg.AccessTokenTTL,
			Issuer:    "appclimb-api",
		},
		Now:     time.Now,
		limiter: newIPRateLimiter(12, time.Minute),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("POST /v1/auth/signup", s.rateLimited(s.signup))
	mux.HandleFunc("POST /v1/auth/login", s.rateLimited(s.login))
	mux.HandleFunc("POST /v1/auth/refresh", s.rateLimited(s.refresh))
	mux.HandleFunc("POST /v1/auth/logout", s.logout)
	mux.HandleFunc("GET /v1/me", s.requireAuth(s.me))
	mux.HandleFunc("DELETE /v1/account", s.requireAuth(s.deleteAccount))
	mux.HandleFunc("GET /v1/workspace", s.requireAuth(s.workspace))
	mux.HandleFunc("GET /v1/growth-map", s.requireAuth(s.growthMap))
	mux.HandleFunc("GET /v1/sources", s.requireAuth(s.listSources))
	mux.HandleFunc("POST /v1/sources/{provider}/verify", s.requireAuth(s.verifySource))
	mux.HandleFunc("PUT /v1/sources/{provider}", s.requireAuth(s.connectSource))
	mux.HandleFunc("DELETE /v1/sources/{provider}", s.requireAuth(s.deleteSource))
	mux.HandleFunc("POST /v1/sources/{provider}/sync", s.requireAuth(s.queueSync))
	mux.HandleFunc("POST /v1/billing/webhook", s.paddleWebhook)
	mux.HandleFunc("POST /v1/internal/sync/run", s.internalSync)
	mux.HandleFunc("OPTIONS /{path...}", s.options)
	return s.middleware(mux)
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "appclimb-api",
		"version": s.Config.Version,
		"now":     s.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.DB.Ping(ctx); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database_not_ready")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":               "ready",
		"database":             "ready",
		"externalMutations":    false,
		"syncIntervalHours":    s.Config.SyncInterval.Hours(),
		"historyRetentionDays": s.Config.HistoryDays,
	})
}

func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email         string `json:"email"`
		Password      string `json:"password"`
		WorkspaceName string `json:"workspaceName"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	if !validEmail(input.Email) ||
		len(input.Password) < 8 ||
		len(input.Password) > 128 ||
		len(input.WorkspaceName) > 120 {
		writeError(w, http.StatusBadRequest, "invalid_signup_payload")
		return
	}
	passwordHash, err := auth.HashPassword(input.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_signup_payload")
		return
	}
	identity, err := s.DB.CreateIdentity(
		r.Context(),
		input.Email,
		passwordHash,
		input.WorkspaceName,
	)
	if errors.Is(err, database.ErrConflict) {
		writeError(w, http.StatusConflict, "account_already_exists")
		return
	}
	if err != nil {
		s.logError(r, "signup failed", err)
		writeError(w, http.StatusInternalServerError, "signup_failed")
		return
	}
	tokens, err := s.issueTokens(r.Context(), identity, "")
	if err != nil {
		s.logError(r, "token issue failed", err)
		writeError(w, http.StatusInternalServerError, "token_issue_failed")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"data": map[string]any{
			"identity": identity,
			"tokens":   tokens,
		},
	})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	if !validEmail(input.Email) || len(input.Password) < 8 || len(input.Password) > 128 {
		writeError(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	identity, passwordHash, err := s.DB.Authenticate(r.Context(), input.Email)
	if err != nil {
		dummyHash, _ := auth.HashPassword("invalid-password-placeholder")
		_ = auth.CheckPassword(dummyHash, input.Password)
		writeError(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	if !auth.CheckPassword(passwordHash, input.Password) {
		writeError(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	tokens, err := s.issueTokens(r.Context(), identity, "")
	if err != nil {
		s.logError(r, "token issue failed", err)
		writeError(w, http.StatusInternalServerError, "token_issue_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"identity": identity,
			"tokens":   tokens,
		},
	})
}

func (s *Server) refresh(w http.ResponseWriter, r *http.Request) {
	var input struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	if len(input.RefreshToken) < 48 || len(input.RefreshToken) > 256 {
		writeError(w, http.StatusUnauthorized, "invalid_refresh_token")
		return
	}
	newRaw, newHash, err := auth.NewRefreshToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "token_issue_failed")
		return
	}
	now := s.Now().UTC()
	identity, err := s.DB.RotateRefreshSession(
		r.Context(),
		auth.HashRefreshToken(input.RefreshToken),
		newHash,
		now.Add(s.Config.RefreshTokenTTL),
	)
	if errors.Is(err, database.ErrRefreshInvalid) {
		writeError(w, http.StatusUnauthorized, "invalid_refresh_token")
		return
	}
	if err != nil {
		s.logError(r, "refresh rotation failed", err)
		writeError(w, http.StatusInternalServerError, "refresh_failed")
		return
	}
	accessToken, err := s.Tokens.AccessToken(
		identity.UserID,
		identity.WorkspaceID,
		identity.Role,
		now,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "token_issue_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": map[string]any{
			"identity": identity,
			"tokens": map[string]any{
				"accessToken":           accessToken,
				"refreshToken":          newRaw,
				"accessTokenExpiresAt":  now.Add(s.Config.AccessTokenTTL),
				"refreshTokenExpiresAt": now.Add(s.Config.RefreshTokenTTL),
			},
		},
	})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	var input struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	if input.RefreshToken != "" {
		if err := s.DB.RevokeRefreshSession(
			r.Context(),
			auth.HashRefreshToken(input.RefreshToken),
		); err != nil {
			s.logError(r, "logout revocation failed", err)
			writeError(w, http.StatusInternalServerError, "logout_failed")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	identity, err := s.DB.Identity(
		r.Context(),
		current.UserID,
		current.WorkspaceID,
	)
	if errors.Is(err, database.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "session_not_found")
		return
	}
	if err != nil {
		s.logError(r, "identity lookup failed", err)
		writeError(w, http.StatusInternalServerError, "identity_lookup_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": identity})
}

func (s *Server) workspace(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	workspace, err := s.DB.Workspace(
		r.Context(),
		current.UserID,
		current.WorkspaceID,
	)
	if errors.Is(err, database.ErrNotFound) {
		writeError(w, http.StatusNotFound, "workspace_not_found")
		return
	}
	if err != nil {
		s.logError(r, "workspace lookup failed", err)
		writeError(w, http.StatusInternalServerError, "workspace_lookup_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": workspace})
}

func (s *Server) deleteAccount(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	if current.Role != "owner" {
		writeError(w, http.StatusForbidden, "owner_required")
		return
	}
	if err := s.DB.DeleteAccount(
		r.Context(),
		current.UserID,
		current.WorkspaceID,
	); err != nil {
		s.logError(r, "account deletion failed", err)
		writeError(w, http.StatusInternalServerError, "account_deletion_failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listSources(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	sources, err := s.DB.ListSources(r.Context(), current.WorkspaceID)
	if err != nil {
		s.logError(r, "source list failed", err)
		writeError(w, http.StatusInternalServerError, "source_list_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data":              expandSources(sources),
		"externalMutations": false,
	})
}

func (s *Server) verifySource(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	if !connectors.Supported(provider) {
		writeError(w, http.StatusNotFound, "unsupported_provider")
		return
	}
	credentials, ok := credentialsFromRequest(w, r)
	if !ok {
		return
	}
	verification, err := s.Connectors.Verify(r.Context(), provider, credentials)
	if err != nil {
		s.writeConnectorError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": verification})
}

func (s *Server) connectSource(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	if current.Role != "owner" && current.Role != "admin" {
		writeError(w, http.StatusForbidden, "admin_required")
		return
	}
	provider := r.PathValue("provider")
	if !connectors.Supported(provider) {
		writeError(w, http.StatusNotFound, "unsupported_provider")
		return
	}
	credentials, ok := credentialsFromRequest(w, r)
	if !ok {
		return
	}
	verification, err := s.Connectors.Verify(r.Context(), provider, credentials)
	if err != nil {
		s.writeConnectorError(w, err)
		return
	}
	envelope, err := secure.Seal(credentials, s.Config.EnvelopeMasterKey)
	if err != nil {
		s.logError(r, "credential encryption failed", err)
		writeError(w, http.StatusInternalServerError, "credential_encryption_failed")
		return
	}
	encodedEnvelope, err := json.Marshal(envelope)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "credential_encryption_failed")
		return
	}
	source, err := s.DB.UpsertSource(
		r.Context(),
		current.WorkspaceID,
		provider,
		verification.AccountLabel,
		encodedEnvelope,
		verification.CheckedAt,
	)
	if err != nil {
		s.logError(r, "source persistence failed", err)
		writeError(w, http.StatusInternalServerError, "source_persistence_failed")
		return
	}
	_ = s.DB.Audit(
		r.Context(),
		current.WorkspaceID,
		current.UserID,
		"source.connected",
		"source",
		provider,
		map[string]any{"provider": provider},
	)
	writeJSON(w, http.StatusCreated, map[string]any{
		"data":              source,
		"externalMutations": false,
	})
}

func (s *Server) deleteSource(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	if current.Role != "owner" && current.Role != "admin" {
		writeError(w, http.StatusForbidden, "admin_required")
		return
	}
	provider := r.PathValue("provider")
	if !connectors.Supported(provider) {
		writeError(w, http.StatusNotFound, "unsupported_provider")
		return
	}
	err := s.DB.DeleteSource(r.Context(), current.WorkspaceID, provider)
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		s.logError(r, "source deletion failed", err)
		writeError(w, http.StatusInternalServerError, "source_deletion_failed")
		return
	}
	_ = s.DB.Audit(
		r.Context(),
		current.WorkspaceID,
		current.UserID,
		"source.revoked",
		"source",
		provider,
		map[string]any{"provider": provider},
	)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) queueSync(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	provider := r.PathValue("provider")
	if !connectors.Supported(provider) {
		writeError(w, http.StatusNotFound, "unsupported_provider")
		return
	}
	from, to := syncer.UTCWindow(s.Now(), s.Config.HistoryDays)
	jobID, err := s.DB.QueueSourceSync(
		r.Context(),
		current.WorkspaceID,
		provider,
		from,
		to,
	)
	if errors.Is(err, database.ErrNotFound) {
		writeError(w, http.StatusNotFound, "source_not_connected")
		return
	}
	if err != nil {
		s.logError(r, "sync queue failed", err)
		writeError(w, http.StatusInternalServerError, "sync_queue_failed")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"data": map[string]any{
			"jobId":    jobID,
			"provider": provider,
			"status":   "queued",
		},
	})
}

func (s *Server) growthMap(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	from := s.Now().UTC().AddDate(0, 0, -30)
	workspace, metrics, events, insights, evidence, actions, err := s.DB.GrowthInputs(
		r.Context(),
		current.WorkspaceID,
		from,
	)
	if err != nil {
		s.logError(r, "growth map query failed", err)
		writeError(w, http.StatusInternalServerError, "growth_map_failed")
		return
	}
	sources, err := s.DB.ListSources(r.Context(), current.WorkspaceID)
	if err != nil {
		s.logError(r, "growth map sources failed", err)
		writeError(w, http.StatusInternalServerError, "growth_map_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": growthSnapshot(
			s.Now().UTC(),
			workspace,
			metrics,
			events,
			insights,
			evidence,
			actions,
			sources,
		),
		"meta": map[string]any{
			"mode":                     map[bool]string{true: "empty", false: "live"}[len(metrics) == 0],
			"externalMutationsAllowed": false,
			"windowDays":               30,
		},
	})
}

func (s *Server) paddleWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxJSONBody))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_webhook_body")
		return
	}
	if err := billing.VerifyPaddleSignature(
		body,
		r.Header.Get("Paddle-Signature"),
		s.Config.PaddleWebhookSecret,
		s.Now().UTC(),
		5*time.Minute,
	); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_webhook_signature")
		return
	}
	var event struct {
		EventID   string          `json:"event_id"`
		EventType string          `json:"event_type"`
		Occurred  string          `json:"occurred_at"`
		Data      json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &event); err != nil ||
		event.EventID == "" ||
		event.EventType == "" {
		writeError(w, http.StatusBadRequest, "malformed_webhook_event")
		return
	}
	var data struct {
		ID         string `json:"id"`
		Status     string `json:"status"`
		CustomData struct {
			WorkspaceID string `json:"workspace_id"`
		} `json:"custom_data"`
		CurrentBillingPeriod struct {
			EndsAt string `json:"ends_at"`
		} `json:"current_billing_period"`
	}
	_ = json.Unmarshal(event.Data, &data)
	occurredAt, err := time.Parse(time.RFC3339Nano, event.Occurred)
	if err != nil {
		occurredAt = s.Now().UTC()
	}
	var entitlementEndsAt *time.Time
	if parsed, err := time.Parse(
		time.RFC3339Nano,
		data.CurrentBillingPeriod.EndsAt,
	); err == nil {
		entitlementEndsAt = &parsed
	}
	inserted, err := s.DB.RecordBillingEvent(
		r.Context(),
		event.EventID,
		event.EventType,
		occurredAt,
		body,
		data.CustomData.WorkspaceID,
		data.ID,
		data.Status,
		entitlementEndsAt,
	)
	if err != nil {
		s.logError(r, "billing event persistence failed", err)
		writeError(w, http.StatusInternalServerError, "billing_event_failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"received":  true,
		"duplicate": !inserted,
	})
}

func (s *Server) internalSync(w http.ResponseWriter, r *http.Request) {
	provided := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if subtle.ConstantTimeCompare(
		[]byte(provided),
		[]byte(s.Config.InternalToken),
	) != 1 {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	count, err := s.DB.QueueDueSyncs(
		r.Context(),
		s.Now().UTC(),
		s.Config.HistoryDays,
	)
	if err != nil {
		s.logError(r, "due sync scheduling failed", err)
		writeError(w, http.StatusInternalServerError, "sync_schedule_failed")
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"accepted": true,
		"queued":   count,
	})
}

func (s *Server) issueTokens(
	ctx context.Context,
	identity database.Identity,
	familyID string,
) (map[string]any, error) {
	now := s.Now().UTC()
	accessToken, err := s.Tokens.AccessToken(
		identity.UserID,
		identity.WorkspaceID,
		identity.Role,
		now,
	)
	if err != nil {
		return nil, err
	}
	refreshToken, refreshHash, err := auth.NewRefreshToken()
	if err != nil {
		return nil, err
	}
	if familyID == "" {
		familyID = uuid.NewString()
	}
	if err := s.DB.CreateRefreshSession(
		ctx,
		identity,
		familyID,
		refreshHash,
		now.Add(s.Config.RefreshTokenTTL),
	); err != nil {
		return nil, err
	}
	return map[string]any{
		"accessToken":           accessToken,
		"refreshToken":          refreshToken,
		"accessTokenExpiresAt":  now.Add(s.Config.AccessTokenTTL),
		"refreshTokenExpiresAt": now.Add(s.Config.RefreshTokenTTL),
	}, nil
}

func (s *Server) writeConnectorError(w http.ResponseWriter, err error) {
	var providerErr connectors.ProviderError
	if errors.As(err, &providerErr) {
		status := http.StatusBadGateway
		if providerErr.Status == 400 ||
			providerErr.Status == 401 ||
			providerErr.Status == 403 {
			status = http.StatusBadRequest
		}
		writeJSON(w, status, map[string]any{
			"error":     providerErr.Code,
			"retryable": providerErr.Retryable,
		})
		return
	}
	writeError(w, http.StatusBadGateway, "connector_verification_failed")
}

func credentialsFromRequest(
	w http.ResponseWriter,
	r *http.Request,
) (map[string]any, bool) {
	var input struct {
		Credentials map[string]any `json:"credentials"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return nil, false
	}
	if len(input.Credentials) == 0 || len(input.Credentials) > 20 {
		writeError(w, http.StatusBadRequest, "invalid_credentials_payload")
		return nil, false
	}
	return input.Credentials, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBody)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid_json")
		return errors.New("request body contains multiple JSON values")
	}
	return nil
}

func validEmail(value string) bool {
	value = strings.TrimSpace(value)
	if len(value) < 3 || len(value) > 320 {
		return false
	}
	address, err := mail.ParseAddress(value)
	return err == nil && strings.EqualFold(address.Address, value)
}

func currentAuth(r *http.Request) authContext {
	current, _ := r.Context().Value(authContextKey).(authContext)
	return current
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, map[string]string{"error": code})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func (s *Server) logError(r *http.Request, message string, err error) {
	s.Logger.Error(
		message,
		"request_id", requestID(r.Context()),
		"method", r.Method,
		"path", r.URL.Path,
		"error_code", errorCode(err),
	)
}

func errorCode(err error) string {
	if err == nil {
		return ""
	}
	var providerErr connectors.ProviderError
	if errors.As(err, &providerErr) {
		return providerErr.Code
	}
	return fmt.Sprintf("%T", err)
}

func expandSources(connected []database.Source) []map[string]any {
	labels := map[string]string{
		"app-store-connect": "App Store Connect",
		"revenuecat":        "RevenueCat",
		"posthog":           "PostHog",
		"superwall":         "Superwall",
		"appclimb-rank":     "Keyword Monitor",
	}
	capabilities := map[string][]string{
		"app-store-connect": {"Store engagement", "Commerce", "Usage", "Performance"},
		"revenuecat":        {"Revenue", "Trials", "Paid conversion", "Renewals", "Churn"},
		"posthog":           {"Activation", "Funnels", "Feature usage", "Retention"},
		"superwall":         {"Paywall views", "Experiments", "Paywall conversion"},
		"appclimb-rank":     {"Private beta", "100 keywords", "3 storefronts"},
	}
	byProvider := map[string]database.Source{}
	for _, source := range connected {
		byProvider[source.Provider] = source
	}
	order := []string{
		"app-store-connect",
		"revenuecat",
		"posthog",
		"superwall",
		"appclimb-rank",
	}
	result := make([]map[string]any, 0, len(order))
	for _, provider := range order {
		source, ok := byProvider[provider]
		status := "not-connected"
		var lastSyncAt any
		var nextSyncAt any
		accountLabel := ""
		lastErrorCode := ""
		if ok {
			status = source.Status
			lastSyncAt = source.LastSyncedAt
			nextSyncAt = source.NextSyncAt
			accountLabel = source.AccountLabel
			lastErrorCode = source.LastErrorCode
		}
		result = append(result, map[string]any{
			"provider":      provider,
			"label":         labels[provider],
			"status":        status,
			"accountLabel":  accountLabel,
			"lastSyncAt":    lastSyncAt,
			"nextSyncAt":    nextSyncAt,
			"lastErrorCode": lastErrorCode,
			"capabilities":  capabilities[provider],
			"readOnly":      true,
		})
	}
	return result
}

func growthSnapshot(
	now time.Time,
	workspace database.Workspace,
	metrics []database.Metric,
	events []database.ReplayEvent,
	insights []database.InsightRecord,
	evidence []database.EvidenceRecord,
	actions []database.ActionProposalRecord,
	sources []database.Source,
) map[string]any {
	// Stage classification and confidence come from the single canonical source
	// (diagnoser), so the live API and the worker generator can never drift.
	stages := diagnoser.Stages()
	stageMetrics := make([]diagnoser.Metric, len(metrics))
	for i, m := range metrics {
		stageMetrics[i] = diagnoser.Metric{
			Provider:     m.Provider,
			Key:          m.Key,
			OccurredAt:   m.OccurredAt,
			Value:        m.Value,
			Unit:         m.Unit,
			Freshness:    m.Freshness,
			Completeness: m.Completeness,
		}
	}
	sums := diagnoser.AggregateByMetric(stageMetrics)
	classified := diagnoser.ClassifyStages(sums)
	confidence := diagnoser.ComputeConfidence(stageMetrics)

	stagePayload := make([]map[string]any, 0, len(stages))
	for _, result := range classified {
		var conversion any
		if result.ConversionRate != nil {
			conversion = *result.ConversionRate
		}
		stagePayload = append(stagePayload, map[string]any{
			"id":             string(result.Definition.ID),
			"label":          result.Definition.Label,
			"value":          result.Value,
			"formattedValue": compactNumber(result.Value),
			"conversionRate": conversion,
			"health":         result.Health,
			"source":         result.Definition.Source,
			"evidenceIds":    []string{},
			"flowWidth":      result.FlowWidth,
			"benchmark":      result.Definition.Benchmark,
		})
	}
	eventPayload := make([]map[string]any, 0, len(events))
	for _, event := range events {
		color := map[string]string{
			"release":     "blue",
			"metadata":    "teal",
			"screenshots": "teal",
			"price":       "coral",
			"paywall":     "violet",
		}[event.Type]
		eventPayload = append(eventPayload, map[string]any{
			"id":         event.ID,
			"occurredAt": event.OccurredAt,
			"label":      event.Label,
			"detail":     event.Detail,
			"type":       event.Type,
			"color":      color,
		})
	}
	evidencePayload := make([]map[string]any, 0, len(evidence))
	for _, item := range evidence {
		evidencePayload = append(evidencePayload, map[string]any{
			"id":         item.ID,
			"title":      item.Title,
			"finding":    item.Finding,
			"source":     item.Provider,
			"metricKeys": item.MetricKeys,
			"window": map[string]any{
				"from": item.WindowFrom,
				"to":   item.WindowTo,
			},
			"confidence": item.Confidence,
			"before":     item.Before,
			"after":      item.After,
		})
	}
	actionPayload := make([]map[string]any, 0, len(actions))
	for _, action := range actions {
		actionPayload = append(actionPayload, map[string]any{
			"id":                      action.ID,
			"insightId":               action.InsightID,
			"title":                   action.Title,
			"rationale":               action.Rationale,
			"experimentTemplate":      action.ExperimentTemplate,
			"status":                  action.Status,
			"externalMutationAllowed": action.ExternalMutationAllowed,
		})
	}
	return map[string]any{
		"generatedAt":   now,
		"workspaceName": workspace.Name,
		"app": map[string]any{
			"id":         workspace.DefaultAppID,
			"name":       workspace.DefaultAppName,
			"platform":   "iOS",
			"storefront": workspace.DefaultStorefront,
			"period":     "Last 30 days",
		},
		"confidence": map[string]any{
			"score": confidence.Score,
			"level": confidence.Level,
			"note":  strconv.Itoa(len(sources)) + " sources connected",
		},
		"stages":           stagePayload,
		"events":           eventPayload,
		"evidence":         evidencePayload,
		"insights":         insights,
		"actionProposals":  actionPayload,
		"experiments":      []any{},
		"sources":          expandSources(sources),
		"retention":        []any{},
		"customerClusters": []any{},
	}
}

func compactNumber(value float64) string {
	switch {
	case value >= 1_000_000:
		return fmt.Sprintf("%.2fM", value/1_000_000)
	case value >= 1_000:
		return fmt.Sprintf("%.1fK", value/1_000)
	default:
		return strconv.FormatFloat(value, 'f', 0, 64)
	}
}
