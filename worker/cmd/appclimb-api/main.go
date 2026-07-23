package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"appclimb.app/backend/internal/config"
	"appclimb.app/backend/internal/database"
	"appclimb.app/backend/internal/httpapi"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "-healthcheck" {
		healthcheck()
		return
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if len(os.Args) > 1 && os.Args[1] == "-migrate-only" {
		migrate(logger)
		return
	}
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration rejected", "error_code", "invalid_configuration")
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(
		context.Background(),
		syscall.SIGINT,
		syscall.SIGTERM,
	)
	defer stop()
	db, err := database.Open(ctx, cfg.DatabaseURL, logger)
	if err != nil {
		logger.Error("database unavailable", "error_code", "database_open_failed")
		os.Exit(1)
	}
	defer db.Close()

	api := httpapi.New(logger, db, cfg)
	server := &http.Server{
		Addr:              cfg.HTTPAddress,
		Handler:           api.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}
	go func() {
		logger.Info(
			"api listening",
			"address", cfg.HTTPAddress,
			"version", cfg.Version,
			"external_mutations_allowed", false,
		)
		if err := server.ListenAndServe(); err != nil && !isServerClosed(err) {
			logger.Error("api stopped unexpectedly", "error_code", "http_server_failed")
			stop()
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
	logger.Info("api stopped")
}

func migrate(logger *slog.Logger) {
	databaseURL := os.Getenv("DATABASE_ADMIN_URL")
	runtimePassword := os.Getenv("RUNTIME_DATABASE_PASSWORD")
	if databaseURL == "" || runtimePassword == "" {
		logger.Error("migration configuration rejected", "error_code", "invalid_migration_configuration")
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	db, err := database.Open(ctx, databaseURL, logger)
	if err != nil {
		logger.Error("migration database unavailable", "error_code", "migration_database_open_failed")
		os.Exit(1)
	}
	defer db.Close()
	if err := db.Migrate(ctx); err != nil {
		logger.Error("database migration failed", "error_code", "migration_failed")
		os.Exit(1)
	}
	if err := db.SetRuntimeRolePassword(ctx, runtimePassword); err != nil {
		logger.Error("runtime role bootstrap failed", "error_code", "runtime_role_bootstrap_failed")
		os.Exit(1)
	}
	logger.Info("database migration completed")
}

func isServerClosed(err error) bool {
	return err == http.ErrServerClosed
}

func healthcheck() {
	client := http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://127.0.0.1:8080/healthz")
	if err != nil {
		os.Exit(1)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		os.Exit(1)
	}
}
