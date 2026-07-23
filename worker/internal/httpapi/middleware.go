package httpapi

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const requestIDKey contextKey = "request_id"

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

type rateBucket struct {
	start time.Time
	count int
}

type ipRateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]rateBucket
	limit    int
	interval time.Duration
}

func newIPRateLimiter(limit int, interval time.Duration) *ipRateLimiter {
	return &ipRateLimiter{
		buckets:  make(map[string]rateBucket),
		limit:    limit,
		interval: interval,
	}
}

func (l *ipRateLimiter) allow(ip string, now time.Time) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	bucket := l.buckets[ip]
	if bucket.start.IsZero() || now.Sub(bucket.start) >= l.interval {
		l.buckets[ip] = rateBucket{start: now, count: 1}
		return true
	}
	if bucket.count >= l.limit {
		return false
	}
	bucket.count++
	l.buckets[ip] = bucket
	if len(l.buckets) > 10_000 {
		for key, item := range l.buckets {
			if now.Sub(item.start) >= l.interval {
				delete(l.buckets, key)
			}
		}
	}
	return true
}

func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		requestIDValue := r.Header.Get("X-Request-ID")
		if _, err := uuid.Parse(requestIDValue); err != nil {
			requestIDValue = uuid.NewString()
		}
		ctx := context.WithValue(r.Context(), requestIDKey, requestIDValue)
		r = r.WithContext(ctx)
		w.Header().Set("X-Request-ID", requestIDValue)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Cache-Control", "no-store")
		s.applyCORS(w, r)
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if recovered := recover(); recovered != nil {
				s.Logger.Error(
					"request panic recovered",
					"request_id", requestIDValue,
					"method", r.Method,
					"path", r.URL.Path,
					"error_code", "panic",
				)
				if !headerWritten(recorder) {
					writeError(recorder, http.StatusInternalServerError, "internal_error")
				}
			}
			s.Logger.Info(
				"request completed",
				"request_id", requestIDValue,
				"method", r.Method,
				"path", r.URL.Path,
				"status", recorder.status,
				"duration_ms", time.Since(started).Milliseconds(),
			)
		}()
		next.ServeHTTP(recorder, r)
	})
}

func headerWritten(recorder *statusRecorder) bool {
	return recorder.status != http.StatusOK
}

func (s *Server) applyCORS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return
	}
	for _, allowed := range s.Config.AllowedOrigins {
		if origin == allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set(
				"Access-Control-Allow-Headers",
				"Authorization, Content-Type, X-Request-ID",
			)
			w.Header().Set(
				"Access-Control-Allow-Methods",
				"GET, POST, PUT, DELETE, OPTIONS",
			)
			w.Header().Set("Access-Control-Max-Age", "600")
			return
		}
	}
}

func (s *Server) options(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	for _, allowed := range s.Config.AllowedOrigins {
		if origin == allowed {
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	writeError(w, http.StatusForbidden, "origin_not_allowed")
}

func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "authentication_required")
			return
		}
		claims, err := s.Tokens.ParseAccessToken(strings.TrimPrefix(header, "Bearer "))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid_access_token")
			return
		}
		current := authContext{
			UserID:      claims.Subject,
			WorkspaceID: claims.WorkspaceID,
			Role:        claims.Role,
		}
		ctx := context.WithValue(r.Context(), authContextKey, current)
		next(w, r.WithContext(ctx))
	}
}

func (s *Server) rateLimited(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.limiter.allow(clientIP(r), s.Now()) {
			w.Header().Set("Retry-After", "60")
			writeError(w, http.StatusTooManyRequests, "rate_limited")
			return
		}
		next(w, r)
	}
}

func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		first := strings.TrimSpace(strings.Split(forwarded, ",")[0])
		if net.ParseIP(first) != nil {
			return first
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func requestID(ctx context.Context) string {
	value, _ := ctx.Value(requestIDKey).(string)
	return value
}

var _ = slog.LevelInfo
