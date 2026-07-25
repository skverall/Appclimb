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
	"net/url"
	"strconv"
	"strings"
	"time"

	"appclimb.app/backend/internal/auth"
	"appclimb.app/backend/internal/billing"
	"appclimb.app/backend/internal/config"
	"appclimb.app/backend/internal/connectors"
	"appclimb.app/backend/internal/database"
	"appclimb.app/backend/internal/diagnoser"
	"appclimb.app/backend/internal/entitlement"
	"appclimb.app/backend/internal/mailer"
	"appclimb.app/backend/internal/secure"
	"appclimb.app/backend/internal/syncer"
	"appclimb.app/backend/internal/webanalytics"
	"github.com/google/uuid"
)

const (
	maxJSONBody        = 1 << 20
	maxAnalyticsBody   = 32 << 10
	checkoutBindingTTL = 30 * time.Minute
)

type billingEventRecorder func(
	context.Context,
	string,
	string,
	time.Time,
	json.RawMessage,
	*database.BillingSubscriptionUpdate,
) (database.BillingEventResult, error)

type checkoutBindingCreator func(
	context.Context,
	string,
	string,
	[]byte,
	time.Time,
) error

type Server struct {
	Logger                 *slog.Logger
	DB                     *database.DB
	Config                 config.Config
	Connectors             *connectors.Client
	Tokens                 auth.TokenIssuer
	WebTokens              webanalytics.TokenIssuer
	Now                    func() time.Time
	EntitlementLookup      func(context.Context, string) (entitlement.State, error)
	BillingEventRecorder   billingEventRecorder
	CheckoutBindingCreator checkoutBindingCreator
	PasswordResetSender    func(context.Context, string, string) error
	limiter                *ipRateLimiter
	collectorLimiter       *ipRateLimiter
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
	server := &Server{
		Logger:     logger,
		DB:         db,
		Config:     cfg,
		Connectors: connectors.NewClient().WithConfig(cfg.AppleBaseURL, cfg.AppleReportLagDays),
		Tokens: auth.TokenIssuer{
			Key:       cfg.JWTSigningKey,
			AccessTTL: cfg.AccessTokenTTL,
			Issuer:    "appclimb-api",
		},
		WebTokens:              webanalytics.TokenIssuer{Key: cfg.JWTSigningKey},
		Now:                    time.Now,
		EntitlementLookup:      db.WorkspaceEntitlement,
		BillingEventRecorder:   db.RecordBillingEvent,
		CheckoutBindingCreator: db.CreateCheckoutBinding,
		limiter:                newIPRateLimiter(12, time.Minute),
		collectorLimiter:       newIPRateLimiter(180, time.Minute),
	}
	if cfg.MailConfigured() {
		sender := mailer.SMTP{
			Host:     cfg.SMTPHost,
			Port:     cfg.SMTPPort,
			Username: cfg.SMTPUsername,
			Password: cfg.SMTPPassword,
			From:     cfg.MailFrom,
		}
		server.PasswordResetSender = sender.SendPasswordReset
	}
	return server
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("POST /v1/auth/signup", s.rateLimited(s.signup))
	mux.HandleFunc("POST /v1/auth/login", s.rateLimited(s.login))
	mux.HandleFunc("POST /v1/auth/refresh", s.rateLimited(s.refresh))
	mux.HandleFunc("POST /v1/auth/logout", s.logout)
	mux.HandleFunc("POST /v1/auth/password/forgot", s.rateLimited(s.forgotPassword))
	mux.HandleFunc("POST /v1/auth/password/reset", s.rateLimited(s.resetPassword))
	mux.HandleFunc("GET /v1/me", s.requireAuth(s.me))
	mux.HandleFunc("PATCH /v1/me", s.requireAuth(s.updateProfile))
	mux.HandleFunc("DELETE /v1/account", s.requireAuth(s.deleteAccount))
	mux.HandleFunc(
		"POST /v1/account/password",
		s.requireAuth(s.rateLimitedByWorkspace(s.changePassword)),
	)
	mux.HandleFunc("GET /v1/workspace", s.requireAuth(s.workspace))
	mux.HandleFunc("GET /v1/growth-map", s.requireAuth(s.growthMap))
	mux.HandleFunc(
		"GET /v1/web-analytics",
		s.requireAuth(s.requireEntitlement(s.webAnalytics)),
	)
	mux.HandleFunc(
		"POST /v1/web-analytics/property",
		s.requireAuth(s.requireEntitlement(s.createWebProperty)),
	)
	mux.HandleFunc(
		"POST /v1/web-analytics/collect",
		s.rateLimitedCollector(s.collectWebEvent),
	)
	mux.HandleFunc(
		"POST /v1/web-analytics/crawler",
		s.rateLimitedCollector(s.collectWebCrawlerEvent),
	)
	mux.HandleFunc("GET /v1/sources", s.requireAuth(s.listSources))
	mux.HandleFunc("POST /v1/sources/{provider}/verify", s.requireAuth(s.requireEntitlement(s.verifySource)))
	mux.HandleFunc("PUT /v1/sources/{provider}", s.requireAuth(s.requireEntitlement(s.connectSource)))
	mux.HandleFunc("DELETE /v1/sources/{provider}", s.requireAuth(s.deleteSource))
	mux.HandleFunc("POST /v1/sources/{provider}/sync", s.requireAuth(s.requireEntitlement(s.queueSync)))
	mux.HandleFunc(
		"POST /v1/billing/checkout-binding",
		s.requireAuth(s.rateLimitedByWorkspace(s.createCheckoutBinding)),
	)
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

func (s *Server) forgotPassword(w http.ResponseWriter, r *http.Request) {
	startedAt := time.Now()
	defer func() {
		if remaining := 450*time.Millisecond - time.Since(startedAt); remaining > 0 {
			time.Sleep(remaining)
		}
	}()
	var input struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	if len(input.Email) > 320 {
		writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true})
		return
	}
	rawToken, tokenHash, err := auth.NewPasswordResetToken()
	if err != nil {
		s.logError(r, "password recovery token failed", err)
		writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true})
		return
	}
	email, found, err := s.DB.CreatePasswordReset(
		r.Context(),
		input.Email,
		tokenHash,
		s.Now().UTC().Add(30*time.Minute),
	)
	if err != nil {
		s.logError(r, "password recovery lookup failed", err)
		writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true})
		return
	}
	if found {
		if s.PasswordResetSender == nil {
			s.Logger.Warn("password recovery mail unavailable", "error_code", "mail_not_configured")
		} else {
			resetURL := s.Config.PublicAppURL +
				"/reset-password?token=" +
				url.QueryEscape(rawToken)
			sendContext, cancel := context.WithTimeout(r.Context(), 12*time.Second)
			defer cancel()
			if err := s.PasswordResetSender(sendContext, email, resetURL); err != nil {
				s.logError(r, "password recovery mail failed", err)
			}
		}
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": true})
}

func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	input.Token = strings.TrimSpace(input.Token)
	if len(input.Token) < 40 ||
		len(input.Token) > 128 ||
		len(input.NewPassword) < 8 ||
		len(input.NewPassword) > 128 {
		writeError(w, http.StatusBadRequest, "invalid_or_expired_reset")
		return
	}
	passwordHash, err := auth.HashPassword(input.NewPassword)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_password")
		return
	}
	err = s.DB.ConsumePasswordReset(
		r.Context(),
		auth.HashPasswordResetToken(input.Token),
		passwordHash,
		s.Now().UTC(),
	)
	if errors.Is(err, database.ErrPasswordResetInvalid) {
		writeError(w, http.StatusBadRequest, "invalid_or_expired_reset")
		return
	}
	if err != nil {
		s.logError(r, "password reset failed", err)
		writeError(w, http.StatusInternalServerError, "password_reset_failed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	var input struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	if len(input.CurrentPassword) < 8 ||
		len(input.CurrentPassword) > 128 ||
		len(input.NewPassword) < 8 ||
		len(input.NewPassword) > 128 ||
		input.CurrentPassword == input.NewPassword {
		writeError(w, http.StatusBadRequest, "invalid_password_change")
		return
	}
	currentHash, err := s.DB.PasswordHash(
		r.Context(),
		current.UserID,
		current.WorkspaceID,
	)
	if errors.Is(err, database.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "session_not_found")
		return
	}
	if err != nil {
		s.logError(r, "password lookup failed", err)
		writeError(w, http.StatusInternalServerError, "password_change_failed")
		return
	}
	if !auth.CheckPassword(currentHash, input.CurrentPassword) {
		writeError(w, http.StatusUnauthorized, "current_password_invalid")
		return
	}
	nextHash, err := auth.HashPassword(input.NewPassword)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_password")
		return
	}
	if err := s.DB.ChangePassword(
		r.Context(),
		current.UserID,
		current.WorkspaceID,
		nextHash,
	); err != nil {
		s.logError(r, "password change failed", err)
		writeError(w, http.StatusInternalServerError, "password_change_failed")
		return
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

func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	var input struct {
		AvatarKey string `json:"avatarKey"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	allowed := map[string]bool{
		"ridge": true, "river": true, "summit": true, "forest": true,
		"dawn": true, "glacier": true, "night": true, "horizon": true,
	}
	input.AvatarKey = strings.TrimSpace(input.AvatarKey)
	if !allowed[input.AvatarKey] {
		writeError(w, http.StatusBadRequest, "invalid_avatar")
		return
	}
	identity, err := s.DB.UpdateAvatar(
		r.Context(),
		current.UserID,
		current.WorkspaceID,
		input.AvatarKey,
	)
	if errors.Is(err, database.ErrNotFound) {
		writeError(w, http.StatusUnauthorized, "session_not_found")
		return
	}
	if err != nil {
		s.logError(r, "profile update failed", err)
		writeError(w, http.StatusInternalServerError, "profile_update_failed")
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
		s.Now().UTC(),
		from,
		to,
	)
	if errors.Is(err, database.ErrEntitlementRequired) {
		writeError(w, http.StatusPaymentRequired, "entitlement_required")
		return
	}
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
	now := s.Now().UTC()
	state, err := s.lookupEntitlement(r.Context(), current.WorkspaceID)
	if errors.Is(err, database.ErrNotFound) {
		writeError(w, http.StatusNotFound, "workspace_not_found")
		return
	}
	if err != nil {
		s.logError(r, "growth map entitlement lookup failed", err)
		writeError(w, http.StatusInternalServerError, "entitlement_lookup_failed")
		return
	}
	if !state.Allowed(now) {
		workspace, err := s.DB.Workspace(
			r.Context(),
			current.UserID,
			current.WorkspaceID,
		)
		if err != nil {
			s.logError(r, "growth map shell workspace failed", err)
			writeError(w, http.StatusInternalServerError, "growth_map_failed")
			return
		}
		sources, err := s.DB.ListSources(r.Context(), current.WorkspaceID)
		if err != nil {
			s.logError(r, "growth map shell sources failed", err)
			writeError(w, http.StatusInternalServerError, "growth_map_failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"data": growthSnapshot(
				now,
				workspace,
				nil,
				nil,
				nil,
				nil,
				nil,
				sources,
			),
			"meta": map[string]any{
				"mode":                     "empty",
				"entitled":                 false,
				"entitlementError":         "entitlement_required",
				"externalMutationsAllowed": false,
				"windowDays":               30,
			},
		})
		return
	}
	from := now.AddDate(0, 0, -30)
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
			now,
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
			"entitled":                 true,
			"externalMutationsAllowed": false,
			"windowDays":               30,
		},
	})
}

func (s *Server) webAnalytics(w http.ResponseWriter, r *http.Request) {
	current := currentAuth(r)
	windowDays := 7
	if rawDays := r.URL.Query().Get("days"); rawDays != "" {
		parsed, err := strconv.Atoi(rawDays)
		if err != nil || (parsed != 7 && parsed != 30 && parsed != 90) {
			writeError(w, http.StatusBadRequest, "invalid_analytics_window")
			return
		}
		windowDays = parsed
	}
	snapshot, err := s.DB.WebAnalytics(
		r.Context(),
		current.WorkspaceID,
		s.Now().UTC(),
		windowDays,
	)
	if err != nil {
		s.logError(r, "web analytics query failed", err)
		writeError(w, http.StatusInternalServerError, "web_analytics_failed")
		return
	}
	if snapshot.Property != nil {
		token, err := s.WebTokens.Issue(webanalytics.TokenClaims{
			WorkspaceID: current.WorkspaceID,
			PropertyID:  snapshot.Property.ID,
			Version:     snapshot.Property.TokenVersion,
		})
		if err != nil {
			s.logError(r, "web analytics token issue failed", err)
			writeError(
				w,
				http.StatusInternalServerError,
				"web_analytics_token_failed",
			)
			return
		}
		snapshot.Property.TrackingToken = token
	}
	mode := "empty"
	if snapshot.Property != nil &&
		(snapshot.Totals.Pageviews > 0 || snapshot.Crawlers.Requests > 0) {
		mode = "live"
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"data": snapshot,
		"meta": map[string]any{
			"mode":                     mode,
			"windowDays":               windowDays,
			"externalMutationsAllowed": false,
			"privacy": map[string]any{
				"storesIPAddress": false,
				"defaultStorage":  "session",
			},
		},
	})
}

func (s *Server) createWebProperty(
	w http.ResponseWriter,
	r *http.Request,
) {
	current := currentAuth(r)
	if current.Role != "owner" && current.Role != "admin" {
		writeError(w, http.StatusForbidden, "admin_required")
		return
	}
	var input struct {
		Name   string `json:"name"`
		Domain string `json:"domain"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Domain = webanalytics.NormalizeHostname(input.Domain)
	if len(input.Name) < 1 ||
		len(input.Name) > 120 ||
		!validAnalyticsDomain(input.Domain) {
		writeError(w, http.StatusBadRequest, "invalid_web_property")
		return
	}
	property, err := s.DB.CreateWebProperty(
		r.Context(),
		current.WorkspaceID,
		input.Name,
		input.Domain,
	)
	if errors.Is(err, database.ErrConflict) {
		writeError(w, http.StatusConflict, "web_property_exists")
		return
	}
	if err != nil {
		s.logError(r, "web property creation failed", err)
		writeError(w, http.StatusInternalServerError, "web_property_failed")
		return
	}
	token, err := s.WebTokens.Issue(webanalytics.TokenClaims{
		WorkspaceID: current.WorkspaceID,
		PropertyID:  property.ID,
		Version:     property.TokenVersion,
	})
	if err != nil {
		s.logError(r, "web analytics token issue failed", err)
		writeError(
			w,
			http.StatusInternalServerError,
			"web_analytics_token_failed",
		)
		return
	}
	property.TrackingToken = token
	_ = s.DB.Audit(
		r.Context(),
		current.WorkspaceID,
		current.UserID,
		"web_property.created",
		"web_property",
		property.ID,
		map[string]any{"domain": property.Domain},
	)
	writeJSON(w, http.StatusCreated, map[string]any{
		"data": property,
		"meta": map[string]any{
			"storesIPAddress": false,
			"defaultStorage":  "session",
		},
	})
}

func (s *Server) collectWebEvent(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Token       string `json:"token"`
		EventID     string `json:"eventId"`
		Kind        string `json:"kind"`
		VisitorID   string `json:"visitorId"`
		SessionID   string `json:"sessionId"`
		OccurredAt  string `json:"occurredAt"`
		Hostname    string `json:"hostname"`
		Path        string `json:"path"`
		Referrer    string `json:"referrer"`
		UTMSource   string `json:"utmSource"`
		UTMMedium   string `json:"utmMedium"`
		UTMCampaign string `json:"utmCampaign"`
		UTMTerm     string `json:"utmTerm"`
		UTMContent  string `json:"utmContent"`
		DurationMS  *int   `json:"durationMs"`
		Goal        string `json:"goal"`
	}
	if err := decodeAnalyticsJSON(w, r, &input); err != nil {
		return
	}
	claims, err := s.WebTokens.Parse(input.Token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_tracking_token")
		return
	}
	if _, err := uuid.Parse(input.EventID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_analytics_event")
		return
	}
	if _, err := uuid.Parse(input.VisitorID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_analytics_event")
		return
	}
	if _, err := uuid.Parse(input.SessionID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_analytics_event")
		return
	}
	if input.Kind != "page_view" &&
		input.Kind != "engagement" &&
		input.Kind != "conversion" {
		writeError(w, http.StatusBadRequest, "invalid_analytics_event")
		return
	}
	occurredAt := analyticsOccurredAt(input.OccurredAt, s.Now().UTC())
	path, ok := analyticsPath(input.Path)
	if !ok ||
		!validAnalyticsDomain(webanalytics.NormalizeHostname(input.Hostname)) {
		writeError(w, http.StatusBadRequest, "invalid_analytics_event")
		return
	}
	if input.DurationMS != nil &&
		(*input.DurationMS < 0 || *input.DurationMS > 86_400_000) {
		writeError(w, http.StatusBadRequest, "invalid_analytics_event")
		return
	}
	utmSource := analyticsText(input.UTMSource, 120)
	utmMedium := analyticsText(input.UTMMedium, 120)
	source := webanalytics.ClassifyAcquisition(
		input.Referrer,
		utmSource,
		utmMedium,
	)
	source.Source = analyticsText(source.Source, 120)
	device := webanalytics.ParseClientDevice(r.Header.Get("User-Agent"))
	country := analyticsCountry(r.Header.Get("X-AppClimb-Country"))
	_, err = s.DB.RecordWebEvent(
		r.Context(),
		claims,
		database.WebEventInput{
			EventID:        input.EventID,
			Kind:           input.Kind,
			VisitorID:      input.VisitorID,
			SessionID:      input.SessionID,
			OccurredAt:     occurredAt,
			Hostname:       input.Hostname,
			Path:           path,
			ReferrerHost:   source.ReferrerHost,
			Source:         source.Source,
			Channel:        source.Channel,
			UTMSource:      utmSource,
			UTMMedium:      utmMedium,
			UTMCampaign:    analyticsText(input.UTMCampaign, 160),
			UTMTerm:        analyticsText(input.UTMTerm, 160),
			UTMContent:     analyticsText(input.UTMContent, 160),
			CountryCode:    country,
			Browser:        device.Browser,
			OS:             device.OS,
			Device:         device.Device,
			DurationMS:     input.DurationMS,
			ConversionGoal: analyticsText(input.Goal, 120),
		},
	)
	if errors.Is(err, database.ErrNotFound) ||
		errors.Is(err, database.ErrPropertyDomainMismatch) {
		writeError(w, http.StatusUnauthorized, "invalid_tracking_token")
		return
	}
	if err != nil {
		s.logError(r, "web analytics collection failed", err)
		writeError(w, http.StatusInternalServerError, "collection_failed")
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

func (s *Server) collectWebCrawlerEvent(
	w http.ResponseWriter,
	r *http.Request,
) {
	var input struct {
		Token      string `json:"token"`
		EventID    string `json:"eventId"`
		OccurredAt string `json:"occurredAt"`
		Hostname   string `json:"hostname"`
		Path       string `json:"path"`
	}
	if err := decodeAnalyticsJSON(w, r, &input); err != nil {
		return
	}
	claims, err := s.WebTokens.Parse(input.Token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_tracking_token")
		return
	}
	if _, err := uuid.Parse(input.EventID); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_crawler_event")
		return
	}
	path, ok := analyticsPath(input.Path)
	if !ok ||
		!validAnalyticsDomain(webanalytics.NormalizeHostname(input.Hostname)) {
		writeError(w, http.StatusBadRequest, "invalid_crawler_event")
		return
	}
	userAgent := r.Header.Get("X-AppClimb-Original-User-Agent")
	if userAgent == "" {
		userAgent = r.Header.Get("User-Agent")
	}
	crawler, ok := webanalytics.ClassifyCrawler(userAgent)
	if !ok {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	_, err = s.DB.RecordWebCrawlerEvent(
		r.Context(),
		claims,
		database.WebCrawlerEventInput{
			EventID:    input.EventID,
			OccurredAt: analyticsOccurredAt(input.OccurredAt, s.Now().UTC()),
			Hostname:   input.Hostname,
			Path:       path,
			Provider:   crawler.Provider,
			Agent:      crawler.Agent,
			Category:   crawler.Category,
			CountryCode: analyticsCountry(
				r.Header.Get("X-AppClimb-Country"),
			),
		},
	)
	if errors.Is(err, database.ErrNotFound) ||
		errors.Is(err, database.ErrPropertyDomainMismatch) {
		writeError(w, http.StatusUnauthorized, "invalid_tracking_token")
		return
	}
	if err != nil {
		s.logError(r, "crawler analytics collection failed", err)
		writeError(w, http.StatusInternalServerError, "collection_failed")
		return
	}
	w.WriteHeader(http.StatusAccepted)
}

func decodeAnalyticsJSON(
	w http.ResponseWriter,
	r *http.Request,
	target any,
) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxAnalyticsBody)
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

func analyticsOccurredAt(raw string, now time.Time) time.Time {
	parsed, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil ||
		parsed.Before(now.Add(-24*time.Hour)) ||
		parsed.After(now.Add(5*time.Minute)) {
		return now
	}
	return parsed.UTC()
}

func analyticsPath(raw string) (string, bool) {
	if raw == "" {
		raw = "/"
	}
	if !strings.HasPrefix(raw, "/") || len(raw) > 2048 {
		return "", false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.IsAbs() {
		return "", false
	}
	path := parsed.EscapedPath()
	if path == "" {
		path = "/"
	}
	if len(path) > 2048 {
		return "", false
	}
	return path, true
}

func analyticsText(value string, limit int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) > limit {
		value = string(runes[:limit])
	}
	return value
}

func analyticsCountry(value string) string {
	value = strings.ToUpper(strings.TrimSpace(value))
	if len(value) != 2 {
		return ""
	}
	for _, character := range value {
		if character < 'A' || character > 'Z' {
			return ""
		}
	}
	return value
}

func validAnalyticsDomain(domain string) bool {
	if domain == "localhost" {
		return true
	}
	if len(domain) < 3 ||
		len(domain) > 253 ||
		strings.ContainsAny(domain, " /:@?#") ||
		!strings.Contains(domain, ".") {
		return false
	}
	parsed, err := url.Parse("https://" + domain)
	return err == nil &&
		parsed.Hostname() == domain &&
		parsed.Port() == ""
}

func (s *Server) createCheckoutBinding(
	w http.ResponseWriter,
	r *http.Request,
) {
	if !s.Config.PaddleConfigured() {
		writeError(w, http.StatusServiceUnavailable, "billing_not_configured")
		return
	}
	current := currentAuth(r)
	if current.Role != "owner" && current.Role != "admin" {
		writeError(w, http.StatusForbidden, "admin_required")
		return
	}
	var input struct {
		PriceID string `json:"priceId"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		return
	}
	input.PriceID = strings.TrimSpace(input.PriceID)
	if !s.Config.PaddlePriceAllowed(input.PriceID) {
		writeError(w, http.StatusBadRequest, "billing_price_not_allowed")
		return
	}
	rawToken, tokenHash, err := billing.NewCheckoutBindingToken()
	if err != nil {
		s.logError(r, "checkout binding generation failed", err)
		writeError(
			w,
			http.StatusInternalServerError,
			"checkout_binding_failed",
		)
		return
	}
	expiresAt := s.Now().UTC().Add(checkoutBindingTTL)
	if s.CheckoutBindingCreator == nil {
		writeError(
			w,
			http.StatusServiceUnavailable,
			"billing_not_configured",
		)
		return
	}
	if err := s.CheckoutBindingCreator(
		r.Context(),
		current.WorkspaceID,
		input.PriceID,
		tokenHash,
		expiresAt,
	); err != nil {
		if errors.Is(err, database.ErrCheckoutPending) {
			writeError(w, http.StatusConflict, "checkout_already_pending")
			return
		}
		if errors.Is(err, database.ErrSubscriptionExists) {
			writeError(w, http.StatusConflict, "billing_subscription_exists")
			return
		}
		s.logError(r, "checkout binding persistence failed", err)
		writeError(
			w,
			http.StatusInternalServerError,
			"checkout_binding_failed",
		)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"data": map[string]any{
			"checkoutBinding": rawToken,
			"priceId":         input.PriceID,
			"expiresAt":       expiresAt,
		},
	})
}

func (s *Server) paddleWebhook(w http.ResponseWriter, r *http.Request) {
	if !s.Config.PaddleConfigured() {
		writeError(w, http.StatusServiceUnavailable, "billing_not_configured")
		return
	}
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
		event.EventType == "" ||
		event.Occurred == "" {
		writeError(w, http.StatusBadRequest, "malformed_webhook_event")
		return
	}
	occurredAt, err := time.Parse(time.RFC3339Nano, event.Occurred)
	if err != nil {
		writeError(w, http.StatusBadRequest, "malformed_webhook_event")
		return
	}
	var update *database.BillingSubscriptionUpdate
	ignoredReason := ""
	if strings.HasPrefix(event.EventType, "subscription.") {
		allowedPrices := make(map[string]bool, len(s.Config.PaddleAllowedPriceIDs))
		for _, priceID := range s.Config.PaddleAllowedPriceIDs {
			allowedPrices[priceID] = true
		}
		parsed, parseErr := billing.ParseSubscriptionUpdate(
			event.Data,
			billing.ProductPolicy{
				ProductID:       s.Config.PaddleProductID,
				ProductIdentity: s.Config.PaddleProductIdentity,
				AllowedPriceIDs: allowedPrices,
			},
		)
		if errors.Is(parseErr, billing.ErrProductNotAllowed) {
			ignoredReason = "product_not_allowed"
		} else if parseErr != nil {
			writeError(w, http.StatusBadRequest, "malformed_webhook_event")
			return
		} else {
			update = &database.BillingSubscriptionUpdate{
				SubscriptionID:    parsed.SubscriptionID,
				CustomerID:        parsed.CustomerID,
				TransactionID:     parsed.TransactionID,
				CustomWorkspaceID: parsed.CustomWorkspaceID,
				CheckoutBinding:   parsed.CheckoutBinding,
				Status:            parsed.Status,
				ProductID:         parsed.ProductID,
				PriceID:           parsed.PriceID,
				EntitlementEndsAt: parsed.EntitlementEndsAt,
			}
		}
	}
	storedPayload, err := redactCheckoutBinding(body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "malformed_webhook_event")
		return
	}
	result, err := s.recordBillingEvent(
		r.Context(),
		event.EventID,
		event.EventType,
		occurredAt.UTC(),
		storedPayload,
		update,
	)
	if err != nil {
		s.logError(r, "billing event persistence failed", err)
		writeError(w, http.StatusInternalServerError, "billing_event_failed")
		return
	}
	if ignoredReason == "" && result.Reason != "applied" && result.Reason != "duplicate" {
		ignoredReason = result.Reason
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"received":               true,
		"duplicate":              !result.Inserted,
		"applied":                result.Applied,
		"reconciliationRequired": result.ReconciliationRequired,
		"ignored":                ignoredReason,
	})
}

func redactCheckoutBinding(body []byte) (json.RawMessage, error) {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	if data, ok := payload["data"].(map[string]any); ok {
		if customData, ok := data["custom_data"].(map[string]any); ok {
			delete(customData, "checkout_binding")
		}
	}
	return json.Marshal(payload)
}

func (s *Server) recordBillingEvent(
	ctx context.Context,
	eventID, eventType string,
	occurredAt time.Time,
	payload json.RawMessage,
	update *database.BillingSubscriptionUpdate,
) (database.BillingEventResult, error) {
	if s.BillingEventRecorder != nil {
		return s.BillingEventRecorder(
			ctx,
			eventID,
			eventType,
			occurredAt,
			payload,
			update,
		)
	}
	return s.DB.RecordBillingEvent(
		ctx,
		eventID,
		eventType,
		occurredAt,
		payload,
		update,
	)
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
		"app-store-connect": {"App Store impressions", "Product page views", "Downloads"},
		"revenuecat":        {"Revenue", "New trials", "New paid", "Trial conversion", "Retention rate", "Churn rate"},
		"posthog":           {"Activation event users", "Session event users"},
		"superwall":         {"Paywall views", "Paywall conversion", "Trial starts"},
		"appclimb-rank":     {"Roadmap", "100 keywords planned", "3 storefronts planned"},
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
		var lastMetricAt any
		accountLabel := ""
		lastErrorCode := ""
		var syncStatus any
		syncAttempt := 0
		syncMaxAttempts := 0
		metricCount := 0
		if ok {
			status = source.Status
			lastSyncAt = source.LastSyncedAt
			nextSyncAt = source.NextSyncAt
			lastMetricAt = source.LastMetricAt
			accountLabel = source.AccountLabel
			lastErrorCode = source.LastErrorCode
			if source.SyncStatus != "" {
				syncStatus = source.SyncStatus
			}
			syncAttempt = source.SyncAttempt
			syncMaxAttempts = source.SyncMaxAttempts
			metricCount = source.MetricCount
		}
		result = append(result, map[string]any{
			"provider":        provider,
			"label":           labels[provider],
			"status":          status,
			"accountLabel":    accountLabel,
			"lastSyncAt":      lastSyncAt,
			"nextSyncAt":      nextSyncAt,
			"lastErrorCode":   lastErrorCode,
			"syncStatus":      syncStatus,
			"syncAttempt":     syncAttempt,
			"syncMaxAttempts": syncMaxAttempts,
			"metricCount":     metricCount,
			"lastMetricAt":    lastMetricAt,
			"capabilities":    capabilities[provider],
			"readOnly":        true,
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
	confidence := diagnoser.ComputeConfidence(stageMetrics, now)

	stageEvidenceIDs := make(map[string][]string, len(stages))
	stageEvidenceSeen := make(map[string]map[string]bool, len(stages))
	addStageEvidence := func(stageID, evidenceID string) {
		if stageID == "" || evidenceID == "" {
			return
		}
		if stageEvidenceSeen[stageID] == nil {
			stageEvidenceSeen[stageID] = map[string]bool{}
		}
		if stageEvidenceSeen[stageID][evidenceID] {
			return
		}
		stageEvidenceSeen[stageID][evidenceID] = true
		stageEvidenceIDs[stageID] = append(
			stageEvidenceIDs[stageID],
			evidenceID,
		)
	}
	for _, insight := range insights {
		for _, evidenceID := range insight.EvidenceIDs {
			addStageEvidence(insight.StageID, evidenceID)
		}
	}
	for _, item := range evidence {
		for _, stage := range stages {
			for _, metricKey := range item.MetricKeys {
				if metricKey == stage.MetricKey {
					addStageEvidence(string(stage.ID), item.ID)
				}
			}
		}
	}

	stagePayload := make([]map[string]any, 0, len(stages))
	for _, result := range classified {
		var conversion any
		if result.ConversionRate != nil {
			conversion = *result.ConversionRate
		}
		evidenceIDs := stageEvidenceIDs[string(result.Definition.ID)]
		if evidenceIDs == nil {
			evidenceIDs = []string{}
		}
		stageRow := map[string]any{
			"id":             string(result.Definition.ID),
			"label":          result.Definition.Label,
			"value":          result.Value,
			"formattedValue": compactNumber(result.Value),
			"conversionRate": conversion,
			"health":         result.Health,
			"source":         result.Definition.Source,
			"evidenceIds":    evidenceIDs,
			"flowWidth":      result.FlowWidth,
		}
		if result.Definition.Benchmark > 0 {
			stageRow["benchmark"] = result.Definition.Benchmark
		}
		stagePayload = append(stagePayload, stageRow)
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
