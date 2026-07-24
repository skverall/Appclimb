package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"appclimb.app/backend/internal/config"
	"appclimb.app/backend/internal/connectors"
	"appclimb.app/backend/internal/database"
	"appclimb.app/backend/internal/diagnoser"
	"appclimb.app/backend/internal/secure"
	"appclimb.app/backend/internal/syncer"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "-healthcheck" {
		healthcheck()
		return
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
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

	runner := &runner{
		logger:     logger,
		db:         db,
		connectors: connectors.NewClient(),
		cfg:        cfg,
	}
	var lastSuccess atomic.Int64
	lastSuccess.Store(time.Now().UTC().Unix())
	healthServer := &http.Server{
		Addr:              ":8081",
		ReadHeaderTimeout: 3 * time.Second,
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/healthz" {
				http.NotFound(w, r)
				return
			}
			if time.Since(time.Unix(lastSuccess.Load(), 0)) > 2*cfg.SyncInterval {
				http.Error(w, `{"status":"stale"}`, http.StatusServiceUnavailable)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"ok","service":"appclimb-worker"}`))
		}),
	}
	go func() {
		if err := healthServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("worker health server failed", "error_code", "health_server_failed")
			stop()
		}
	}()

	run := func() {
		runCtx, cancel := context.WithTimeout(ctx, 45*time.Minute)
		defer cancel()
		if err := runner.cycle(runCtx); err != nil {
			logger.Error("sync cycle failed", "error_code", "sync_cycle_failed")
			return
		}
		lastSuccess.Store(time.Now().UTC().Unix())
	}
	run()
	ticker := time.NewTicker(cfg.SyncInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			run()
		case <-ctx.Done():
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = healthServer.Shutdown(shutdownCtx)
			cancel()
			logger.Info("worker stopped")
			return
		}
	}
}

type runner struct {
	logger     *slog.Logger
	db         *database.DB
	connectors *connectors.Client
	cfg        config.Config
}

func (r *runner) cycle(ctx context.Context) error {
	queued, err := r.db.QueueDueSyncs(ctx, time.Now().UTC(), r.cfg.HistoryDays)
	if err != nil {
		return err
	}
	r.logger.Info("sync jobs scheduled", "queued", queued)
	for processed := 0; processed < 100; processed++ {
		job, err := r.db.ClaimSyncJob(ctx)
		if errors.Is(err, database.ErrNotFound) {
			break
		}
		if err != nil {
			return err
		}
		r.process(ctx, job)
	}
	if err := r.diagnose(ctx); err != nil {
		// Diagnosis is non-fatal: a failure must not poison the cycle's
		// healthz stamp the way a sync failure would.
		r.logger.Error("diagnosis phase failed", "error_code", "diagnosis_phase_failed")
	}
	deleted, err := r.db.DeleteExpiredMetrics(ctx, time.Now().UTC(), r.cfg.HistoryDays)
	if err != nil {
		return err
	}
	if deleted > 0 {
		r.logger.Info("expired metric points deleted", "count", deleted)
	}
	return nil
}

func (r *runner) process(ctx context.Context, job database.SyncJob) {
	var envelope secure.Envelope
	if err := json.Unmarshal(job.CredentialEnvelope, &envelope); err != nil {
		r.fail(ctx, job, "credential_envelope_invalid", false)
		return
	}
	credentials, err := secure.Open(envelope, r.cfg.EnvelopeMasterKey)
	if err != nil {
		r.fail(ctx, job, "credential_decryption_failed", false)
		return
	}
	aggregates, err := r.connectors.ReadAggregates(
		ctx,
		job.Provider,
		credentials,
		job.WindowFrom,
		job.WindowTo,
	)
	if err != nil {
		var providerErr connectors.ProviderError
		if errors.As(err, &providerErr) {
			r.fail(ctx, job, providerErr.Code, providerErr.Retryable)
		} else {
			r.fail(ctx, job, "provider_import_failed", true)
		}
		return
	}
	points := make([]syncer.MetricPoint, 0, len(aggregates))
	for _, aggregate := range aggregates {
		points = append(points, syncer.MetricPoint{
			AppID:           job.AppID,
			Provider:        syncer.Provider(job.Provider),
			MetricKey:       aggregate.MetricKey,
			OccurredAt:      aggregate.OccurredAt.UTC(),
			Value:           aggregate.Value,
			Unit:            aggregate.Unit,
			Dimensions:      aggregate.Dimensions,
			SourceUpdatedAt: aggregate.SourceUpdatedAt.UTC(),
			Completeness:    aggregate.Completeness,
		})
	}
	if err := r.db.UpsertMetricPoints(ctx, job, points); err != nil {
		r.fail(ctx, job, "metric_reconciliation_failed", true)
		return
	}
	if err := r.db.CompleteSyncJob(
		ctx,
		job,
		len(points),
		syncer.NextSync(time.Now().UTC(), time.Now().UTC(), r.cfg.SyncInterval),
	); err != nil {
		r.logger.Error(
			"sync completion failed",
			"provider", job.Provider,
			"job_id", job.ID,
			"error_code", "sync_completion_failed",
		)
		return
	}
	r.logger.Info(
		"sync job completed",
		"provider", job.Provider,
		"job_id", job.ID,
		"points", len(points),
	)
}

// diagnose runs the deterministic generator for every app due for a fresh
// diagnosis. It mirrors the sync claim loop: queue due runs, claim each with
// FOR UPDATE SKIP LOCKED, generate, and persist. When the underlying metrics
// are unchanged since the last successful run it skips recomputation.
func (r *runner) diagnose(ctx context.Context) error {
	queued, err := r.db.QueueDueDiagnoses(ctx, time.Now().UTC(), r.cfg.DiagnosisInterval)
	if err != nil {
		return err
	}
	if queued > 0 {
		r.logger.Info("diagnosis runs scheduled", "queued", queued)
	}
	for processed := 0; processed < 50; processed++ {
		run, err := r.db.ClaimDiagnosisRun(ctx)
		if errors.Is(err, database.ErrNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		r.diagnoseRun(ctx, run)
	}
	return nil
}

func (r *runner) diagnoseRun(ctx context.Context, run database.DiagnosisRun) {
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -diagnoser.DiagnosisWindowDays)
	metrics, err := r.db.MetricsForApp(ctx, run.WorkspaceID, run.AppID, from)
	if err != nil {
		r.logger.Error(
			"diagnosis metric read failed",
			"app_id", run.AppID,
			"run_id", run.ID,
			"error_code", "diagnosis_metric_read_failed",
		)
		_ = r.db.FailDiagnosisRun(ctx, run, "diagnosis_metric_read_failed", true)
		return
	}
	// Idempotency: skip when the input hash is unchanged since the last
	// successful run. Cuts repeated work when several connections sync the
	// same app within one interval.
	if prev, err := r.db.LastSucceededInputHash(ctx, run.WorkspaceID, run.AppID); err == nil && prev != "" {
		preview := database.DiagnoseMetrics(metrics, now)
		if preview.InputHash == prev {
			_ = r.db.MarkDiagnosisSkipped(ctx, run, preview.Version, preview.InputHash)
			r.logger.Info(
				"diagnosis skipped, inputs unchanged",
				"app_id", run.AppID,
				"run_id", run.ID,
			)
			return
		}
	}
	diag := database.DiagnoseMetrics(metrics, now)
	if err := r.db.RecordDiagnosis(ctx, run, diag); err != nil {
		r.logger.Error(
			"diagnosis persist failed",
			"app_id", run.AppID,
			"run_id", run.ID,
			"error_code", "diagnosis_persist_failed",
		)
		_ = r.db.FailDiagnosisRun(ctx, run, "diagnosis_persist_failed", true)
		return
	}
	r.logger.Info(
		"diagnosis completed",
		"app_id", run.AppID,
		"run_id", run.ID,
		"insights", len(diag.Insights),
		"evidence", len(diag.Evidence),
	)
}

func (r *runner) fail(
	ctx context.Context,
	job database.SyncJob,
	code string,
	retryable bool,
) {
	runAfter := time.Now().UTC().Add(syncer.RetryDelay(job.Attempt))
	if err := r.db.FailSyncJob(ctx, job, code, retryable, runAfter); err != nil {
		r.logger.Error(
			"sync failure persistence failed",
			"provider", job.Provider,
			"job_id", job.ID,
			"error_code", "sync_failure_persistence_failed",
		)
		return
	}
	r.logger.Warn(
		"sync job failed",
		"provider", job.Provider,
		"job_id", job.ID,
		"error_code", code,
		"retryable", retryable,
	)
}

func healthcheck() {
	client := http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://127.0.0.1:8081/healthz")
	if err != nil {
		os.Exit(1)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		os.Exit(1)
	}
}
