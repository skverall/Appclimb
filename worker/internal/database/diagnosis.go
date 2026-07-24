package database

import (
	"context"
	"errors"
	"time"

	"appclimb.app/backend/internal/diagnoser"
	"appclimb.app/backend/internal/syncer"
	"github.com/jackc/pgx/v5"
)

// DiagnosisRun mirrors the diagnosis_runs row lifecycle. A run is per-app and
// coordinates the deterministic generator that turns synced metric_points into
// evidence, insights and action proposals.
type DiagnosisRun struct {
	ID          string
	WorkspaceID string
	AppID       string
	Attempt     int
	MaxAttempts int
}

// QueueDueDiagnoses enqueues a diagnosis run for every app whose previous run is
// due again and has no run in flight. Mirrors QueueDueSyncs, but bound to apps
// rather than source connections (a diagnosis is per-app, not per connection).
func (db *DB) QueueDueDiagnoses(ctx context.Context, now time.Time, interval time.Duration) (int64, error) {
	if interval <= 0 {
		interval = 6 * time.Hour
	}
	rows, err := db.Pool.Query(ctx, "select id::text from workspaces order by id")
	if err != nil {
		return 0, err
	}
	workspaceIDs := []string{}
	for rows.Next() {
		var workspaceID string
		if err := rows.Scan(&workspaceID); err != nil {
			rows.Close()
			return 0, err
		}
		workspaceIDs = append(workspaceIDs, workspaceID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()

	var total int64
	for _, workspaceID := range workspaceIDs {
		err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
			result, err := tx.Exec(
				ctx,
				`insert into diagnosis_runs(workspace_id, app_id, run_after)
				 select a.workspace_id, a.id, $2
				 from apps a
				 where a.workspace_id=$1
				   and not exists(
				     select 1 from diagnosis_runs dr
				     where dr.app_id=a.id
				       and dr.status in ('queued','running','retrying')
				   )
				   and not exists(
				     select 1 from diagnosis_runs dr
				     where dr.app_id=a.id
				       and dr.status='succeeded'
				       and dr.updated_at > now() - $3::interval
				   )`,
				workspaceID,
				now.UTC(),
				interval.String(),
			)
			if err != nil {
				return err
			}
			total += result.RowsAffected()
			return nil
		})
		if err != nil {
			return total, err
		}
	}
	return total, nil
}

// ClaimDiagnosisRun atomically claims the oldest due run using
// FOR UPDATE SKIP LOCKED, mirroring ClaimSyncJob. Returns ErrNotFound when no
// run is ready across any workspace.
func (db *DB) ClaimDiagnosisRun(ctx context.Context) (DiagnosisRun, error) {
	rows, err := db.Pool.Query(ctx, "select id::text from workspaces order by id")
	if err != nil {
		return DiagnosisRun{}, err
	}
	workspaceIDs := []string{}
	for rows.Next() {
		var workspaceID string
		if err := rows.Scan(&workspaceID); err != nil {
			rows.Close()
			return DiagnosisRun{}, err
		}
		workspaceIDs = append(workspaceIDs, workspaceID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return DiagnosisRun{}, err
	}
	rows.Close()

	for _, workspaceID := range workspaceIDs {
		var run DiagnosisRun
		err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
			return tx.QueryRow(
				ctx,
				`with candidate as (
				   select id
				   from diagnosis_runs
				   where workspace_id=$1
				     and status in ('queued','retrying')
				     and run_after <= now()
				   order by created_at
				   for update skip locked
				   limit 1
				 )
				 update diagnosis_runs dr set
				   status='running',
				   attempt=dr.attempt+1,
				   locked_at=now(),
				   updated_at=now()
				 from candidate c
				 where dr.id=c.id
				 returning
				   dr.id::text,
				   dr.workspace_id::text,
				   dr.app_id::text,
				   dr.attempt,
				   dr.max_attempts`,
				workspaceID,
			).Scan(
				&run.ID,
				&run.WorkspaceID,
				&run.AppID,
				&run.Attempt,
				&run.MaxAttempts,
			)
		})
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return DiagnosisRun{}, err
		}
		return run, nil
	}
	return DiagnosisRun{}, ErrNotFound
}

// MetricsForApp reads the metric_points feeding a diagnosis for one app over a
// trailing window. Mirrors the metric read inside GrowthInputs.
func (db *DB) MetricsForApp(ctx context.Context, workspaceID, appID string, from time.Time) ([]Metric, error) {
	metrics := []Metric{}
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		rows, err := tx.Query(
			ctx,
			`select
			   provider::text,
			   metric_key,
			   occurred_at,
			   value::float8,
			   unit,
			   freshness_hours::float8,
			   completeness::float8
			 from metric_points
			 where workspace_id=$1 and app_id=$2 and occurred_at >= $3
			 order by occurred_at`,
			workspaceID,
			appID,
			from,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
			for rows.Next() {
				var m Metric
				if err := rows.Scan(
					&m.Provider,
					&m.Key,
					&m.OccurredAt,
					&m.Value,
					&m.Unit,
					&m.Freshness,
					&m.Completeness,
				); err != nil {
					return err
				}
				metrics = append(metrics, m)
			}
			return rows.Err()
		})
	return metrics, err
}

// DiagnoseMetrics converts database.Metric rows to diagnoser.Metric and runs
// the deterministic generator. Kept here to own the type boundary.
func DiagnoseMetrics(metrics []Metric, now time.Time) diagnoser.Diagnosis {
	converted := make([]diagnoser.Metric, len(metrics))
	for i, m := range metrics {
		converted[i] = diagnoser.Metric{
			Provider:     m.Provider,
			Key:          m.Key,
			OccurredAt:   m.OccurredAt,
			Value:        m.Value,
			Unit:         m.Unit,
			Freshness:    m.Freshness,
			Completeness: m.Completeness,
		}
	}
	return diagnoser.Generate(diagnoser.Input{Metrics: converted, Now: now})
}

// RecordDiagnosis persists a generated diagnosis, replacing any previous output
// for the app in a single transaction. Insertion follows the dependency order
// evidence → insights → action_proposals so the loose/FK links resolve. The run
// is marked succeeded and an audit event is written.
func (db *DB) RecordDiagnosis(ctx context.Context, run DiagnosisRun, diag diagnoser.Diagnosis) error {
	return db.WithWorkspace(ctx, run.WorkspaceID, func(tx pgx.Tx) error {
		// Replace the previous diagnosis. action_proposals cascade on insight
		// delete, but explicit deletes keep the intent obvious and order-safe.
		if _, err := tx.Exec(ctx, "delete from action_proposals where app_id=$1", run.AppID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "delete from insights where app_id=$1", run.AppID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, "delete from evidence where app_id=$1", run.AppID); err != nil {
			return err
		}

		evidenceIDs := make([]string, len(diag.Evidence))
		for i, ev := range diag.Evidence {
			var id string
			if err := tx.QueryRow(
				ctx,
				`insert into evidence(
				   workspace_id, app_id, provider, title, finding, metric_keys,
				   window_from, window_to, confidence, before_value, after_value,
				   calculation_version
				 ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
				 returning id::text`,
				run.WorkspaceID,
				run.AppID,
				ev.Provider,
				ev.Title,
				ev.Finding,
				ev.MetricKeys,
				ev.WindowFrom,
				ev.WindowTo,
				ev.Confidence,
				ev.Before,
				ev.After,
				diag.Version,
			).Scan(&id); err != nil {
				return err
			}
			evidenceIDs[i] = id
		}

		insightIDs := make([]string, len(diag.Insights))
		for i, ins := range diag.Insights {
			linkedEvidence := make([]string, 0, len(ins.EvidenceIdx))
			for _, idx := range ins.EvidenceIdx {
				if idx >= 0 && idx < len(evidenceIDs) {
					linkedEvidence = append(linkedEvidence, evidenceIDs[idx])
				}
			}
			var id string
			if err := tx.QueryRow(
				ctx,
				`insert into insights(
				   workspace_id, app_id, title, summary, kind, stage_id,
				   evidence_ids, confidence, impact, effort, rank, diagnosis_version
				 ) values($1,$2,$3,$4,$5,$6,$7::uuid[],$8,$9,$10,$11,$12)
				 returning id::text`,
				run.WorkspaceID,
				run.AppID,
				ins.Title,
				ins.Summary,
				ins.Kind,
				ins.StageID,
				linkedEvidence,
				ins.Confidence,
				ins.Impact,
				ins.Effort,
				ins.Rank,
				diag.Version,
			).Scan(&id); err != nil {
				return err
			}
			insightIDs[i] = id
		}

		for _, action := range diag.Actions {
			if action.InsightIdx < 0 || action.InsightIdx >= len(insightIDs) {
				continue
			}
			if _, err := tx.Exec(
				ctx,
				`insert into action_proposals(
				   workspace_id, app_id, insight_id, title, rationale,
				   experiment_template
				 ) values($1,$2,$3,$4,$5,$6)`,
				run.WorkspaceID,
				run.AppID,
				insightIDs[action.InsightIdx],
				action.Title,
				action.Rationale,
				action.ExperimentTemplate,
			); err != nil {
				return err
			}
		}

		if _, err := tx.Exec(
			ctx,
			`update diagnosis_runs set
			   status='succeeded',
			   diagnosis_version=$2,
			   input_hash=$3,
			   insight_count=$4,
			   evidence_count=$5,
			   locked_at=null,
			   last_error_code=null,
			   updated_at=now()
			 where id=$1`,
			run.ID,
			diag.Version,
			diag.InputHash,
			len(diag.Insights),
			len(diag.Evidence),
		); err != nil {
			return err
		}

		_, err := tx.Exec(
			ctx,
			`insert into audit_events(
			   workspace_id, action, target_type, target_id, metadata
			 ) values($1,'diagnosis.completed','app',$2,$3)`,
			run.WorkspaceID,
			run.AppID,
			map[string]any{
				"runId":         run.ID,
				"version":       diag.Version,
				"insightCount":  len(diag.Insights),
				"evidenceCount": len(diag.Evidence),
			},
		)
		return err
	})
}

// MarkDiagnosisSkipped completes a run as succeeded without recomputing, used
// when the input hash is unchanged since the last successful run.
func (db *DB) MarkDiagnosisSkipped(ctx context.Context, run DiagnosisRun, version, inputHash string) error {
	return db.WithWorkspace(ctx, run.WorkspaceID, func(tx pgx.Tx) error {
		_, err := tx.Exec(
			ctx,
			`update diagnosis_runs set
			   status='succeeded',
			   diagnosis_version=coalesce($2, diagnosis_version),
			   input_hash=coalesce($3, input_hash),
			   locked_at=null,
			   last_error_code=null,
			   updated_at=now()
			 where id=$1`,
			run.ID,
			version,
			inputHash,
		)
		return err
	})
}

// LastSucceededInputHash returns the input_hash of the most recent succeeded
// diagnosis run for an app, or "" when none exists. Used to skip recomputation.
func (db *DB) LastSucceededInputHash(ctx context.Context, workspaceID, appID string) (string, error) {
	var hash *string
	err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
		return tx.QueryRow(
			ctx,
			`select input_hash from diagnosis_runs
			 where app_id=$2 and workspace_id=$1 and status='succeeded'
			 order by updated_at desc limit 1`,
			workspaceID,
			appID,
		).Scan(&hash)
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if hash == nil {
		return "", nil
	}
	return *hash, nil
}

// FailDiagnosisRun records a failed diagnosis run, scheduling a retry with
// backoff when attempts remain, mirroring FailSyncJob.
func (db *DB) FailDiagnosisRun(
	ctx context.Context,
	run DiagnosisRun,
	errorCode string,
	retryable bool,
) error {
	status := "failed"
	if retryable && run.Attempt < run.MaxAttempts {
		status = "retrying"
	}
	runAfter := time.Now().UTC().Add(syncer.RetryDelay(run.Attempt))
	return db.WithWorkspace(ctx, run.WorkspaceID, func(tx pgx.Tx) error {
		_, err := tx.Exec(
			ctx,
			`update diagnosis_runs set
			   status=$3,
			   run_after=$4,
			   locked_at=null,
			   last_error_code=$5,
			   updated_at=now()
			 where id=$1 and workspace_id=$2`,
			run.ID,
			run.WorkspaceID,
			status,
			runAfter,
			errorCode,
		)
		return err
	})
}
