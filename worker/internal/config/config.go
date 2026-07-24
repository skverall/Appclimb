package config

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddress         string
	DatabaseURL         string
	JWTSigningKey       []byte
	EnvelopeMasterKey   string
	InternalToken       string
	PaddleWebhookSecret string
	AllowedOrigins      []string
	AccessTokenTTL      time.Duration
	RefreshTokenTTL     time.Duration
	SyncInterval        time.Duration
	DiagnosisInterval   time.Duration
	HistoryDays         int
	AppleBaseURL        string
	AppleReportLagDays  int
	Version             string
}

func Load() (Config, error) {
	accessTTL, err := duration("ACCESS_TOKEN_TTL", 15*time.Minute)
	if err != nil {
		return Config{}, err
	}
	refreshTTL, err := duration("REFRESH_TOKEN_TTL", 30*24*time.Hour)
	if err != nil {
		return Config{}, err
	}
	syncInterval, err := duration("SYNC_INTERVAL", 6*time.Hour)
	if err != nil {
		return Config{}, err
	}
	diagnosisInterval, err := duration("DIAGNOSIS_INTERVAL", syncInterval)
	if err != nil {
		return Config{}, err
	}
	historyDays, err := integer("HISTORY_DAYS", 90)
	if err != nil {
		return Config{}, err
	}
	if historyDays < 1 || historyDays > 90 {
		return Config{}, errors.New("HISTORY_DAYS must be between 1 and 90")
	}
	appleLagDays, err := integer("APPLE_REPORT_LAG_DAYS", 2)
	if err != nil {
		return Config{}, err
	}
	if appleLagDays < 0 || appleLagDays > 14 {
		return Config{}, errors.New("APPLE_REPORT_LAG_DAYS must be between 0 and 14")
	}

	encodedJWTKey := strings.TrimSpace(os.Getenv("JWT_SIGNING_KEY_B64"))
	jwtKey, err := base64.StdEncoding.DecodeString(encodedJWTKey)
	if err != nil || len(jwtKey) < 32 {
		return Config{}, errors.New("JWT_SIGNING_KEY_B64 must contain at least 32 random bytes")
	}
	masterKey := strings.TrimSpace(os.Getenv("ENVELOPE_MASTER_KEY"))
	decodedMasterKey, err := base64.StdEncoding.DecodeString(masterKey)
	if err != nil || len(decodedMasterKey) != 32 {
		return Config{}, errors.New("ENVELOPE_MASTER_KEY must contain exactly 32 random bytes")
	}

	cfg := Config{
		HTTPAddress:         env("HTTP_ADDRESS", ":8080"),
		DatabaseURL:         strings.TrimSpace(os.Getenv("DATABASE_URL")),
		JWTSigningKey:       jwtKey,
		EnvelopeMasterKey:   masterKey,
		InternalToken:       strings.TrimSpace(os.Getenv("INTERNAL_TOKEN")),
		PaddleWebhookSecret: strings.TrimSpace(os.Getenv("PADDLE_WEBHOOK_SECRET")),
		AllowedOrigins:      splitCSV(env("ALLOWED_ORIGINS", "https://appclimb.app")),
		AccessTokenTTL:      accessTTL,
		RefreshTokenTTL:     refreshTTL,
		SyncInterval:        syncInterval,
		DiagnosisInterval:   diagnosisInterval,
		HistoryDays:         historyDays,
		AppleBaseURL:        env("APPLE_BASE_URL", "https://api.appstoreconnect.apple.com"),
		AppleReportLagDays:  appleLagDays,
		Version:             env("APP_VERSION", "dev"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if len(cfg.InternalToken) < 32 {
		return Config{}, errors.New("INTERNAL_TOKEN must be at least 32 characters")
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func duration(key string, fallback time.Duration) (time.Duration, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := time.ParseDuration(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive duration", key)
	}
	return parsed, nil
}

func integer(key string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", key)
	}
	return parsed, nil
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
