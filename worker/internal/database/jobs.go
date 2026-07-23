package database

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"appclimb.app/backend/internal/syncer"
	"github.com/jackc/pgx/v5"
)

type SyncJob struct {
	ID                 string
	WorkspaceID        string
	ConnectionID       string
	AppID              string
	Provider           string
	CredentialEnvelope json.RawMessage
	WindowFrom         time.Time
	WindowTo           time.Time
	Attempt            int
	MaxAttempts        int
}

func (db *DB) QueueDueSyncs(
	ctx context.Context,
	now time.Time,
	historyDays int,
) (int64, error) {
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

	from, to := syncer.UTCWindow(now, historyDays)
	var total int64
	for _, workspaceID := range workspaceIDs {
		err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
			result, err := tx.Exec(
				ctx,
				`insert into sync_jobs(
				   workspace_id,
				   connection_id,
				   provider,
				   window_from,
				   window_to
				 )
				 select
				   sc.workspace_id,
				   sc.id,
				   sc.provider,
				   $2,
				   $3
				 from source_connections sc
				 where sc.workspace_id=$1
				   and sc.status='connected'
				   and coalesce(sc.next_sync_at,now()) <= now()
				   and not exists(
				     select 1 from sync_jobs sj
				     where sj.connection_id=sc.id
				       and sj.status in ('queued','running','retrying')
				   )`,
				workspaceID,
				from,
				to,
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

func (db *DB) ClaimSyncJob(ctx context.Context) (SyncJob, error) {
	rows, err := db.Pool.Query(ctx, "select id::text from workspaces order by id")
	if err != nil {
		return SyncJob{}, err
	}
	workspaceIDs := []string{}
	for rows.Next() {
		var workspaceID string
		if err := rows.Scan(&workspaceID); err != nil {
			rows.Close()
			return SyncJob{}, err
		}
		workspaceIDs = append(workspaceIDs, workspaceID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return SyncJob{}, err
	}
	rows.Close()

	for _, workspaceID := range workspaceIDs {
		var job SyncJob
		err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
			return tx.QueryRow(
				ctx,
				`with candidate as (
				   select id
				   from sync_jobs
				   where workspace_id=$1
				     and status in ('queued','retrying')
				     and run_after <= now()
				   order by created_at
				   for update skip locked
				   limit 1
				 )
				 update sync_jobs sj set
				   status='running',
				   attempt=sj.attempt+1,
				   locked_at=now(),
				   updated_at=now()
				 from candidate c, source_connections sc
				 where sj.id=c.id and sc.id=sj.connection_id
				 returning
				   sj.id::text,
				   sj.workspace_id::text,
				   sj.connection_id::text,
				   sc.app_id::text,
				   sj.provider::text,
				   sc.credential_envelope,
				   sj.window_from,
				   sj.window_to,
				   sj.attempt,
				   sj.max_attempts`,
				workspaceID,
			).Scan(
				&job.ID,
				&job.WorkspaceID,
				&job.ConnectionID,
				&job.AppID,
				&job.Provider,
				&job.CredentialEnvelope,
				&job.WindowFrom,
				&job.WindowTo,
				&job.Attempt,
				&job.MaxAttempts,
			)
		})
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return SyncJob{}, err
		}
		return job, nil
	}
	return SyncJob{}, ErrNotFound
}

func (db *DB) CompleteSyncJob(
	ctx context.Context,
	job SyncJob,
	pointCount int,
	nextSync time.Time,
) error {
	return db.WithWorkspace(ctx, job.WorkspaceID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(
			ctx,
			`update sync_jobs set
			   status='succeeded',
			   locked_at=null,
			   last_error_code=null,
			   updated_at=now()
			 where id=$1 and workspace_id=$2`,
			job.ID,
			job.WorkspaceID,
		); err != nil {
			return err
		}
		if _, err := tx.Exec(
			ctx,
			`update source_connections set
			   status='connected',
			   last_synced_at=now(),
			   next_sync_at=$3,
			   last_error_code=null,
			   updated_at=now()
			 where id=$1 and workspace_id=$2`,
			job.ConnectionID,
			job.WorkspaceID,
			nextSync,
		); err != nil {
			return err
		}
		_, err := tx.Exec(
			ctx,
			`insert into audit_events(
			   workspace_id,action,target_type,target_id,metadata
			 ) values($1,'source.synced','source',$2,$3)`,
			job.WorkspaceID,
			job.Provider,
			map[string]any{
				"jobId":      job.ID,
				"pointCount": pointCount,
			},
		)
		return err
	})
}

func (db *DB) FailSyncJob(
	ctx context.Context,
	job SyncJob,
	errorCode string,
	retryable bool,
	runAfter time.Time,
) error {
	status := "failed"
	if retryable && job.Attempt < job.MaxAttempts {
		status = "retrying"
	}
	return db.WithWorkspace(ctx, job.WorkspaceID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(
			ctx,
			`update sync_jobs set
			   status=$3,
			   run_after=$4,
			   locked_at=null,
			   last_error_code=$5,
			   updated_at=now()
			 where id=$1 and workspace_id=$2`,
			job.ID,
			job.WorkspaceID,
			status,
			runAfter,
			errorCode,
		); err != nil {
			return err
		}
		connectionStatus := "connected"
		if status == "failed" {
			connectionStatus = "needs-attention"
		}
		_, err := tx.Exec(
			ctx,
			`update source_connections set
			   status=$3,
			   last_error_code=$4,
			   next_sync_at=$5,
			   updated_at=now()
			 where id=$1 and workspace_id=$2`,
			job.ConnectionID,
			job.WorkspaceID,
			connectionStatus,
			errorCode,
			runAfter,
		)
		return err
	})
}

func (db *DB) UpsertMetricPoints(
	ctx context.Context,
	job SyncJob,
	points []syncer.MetricPoint,
) error {
	if len(points) == 0 {
		return nil
	}
	return db.WithWorkspace(ctx, job.WorkspaceID, func(tx pgx.Tx) error {
		for _, point := range points {
			dimensions, err := json.Marshal(point.Dimensions)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(
				ctx,
				`insert into metric_points(
				   workspace_id,
				   app_id,
				   provider,
				   metric_key,
				   occurred_at,
				   value,
				   unit,
				   dimensions,
				   source_updated_at,
				   freshness_hours,
				   completeness
				 ) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
				 on conflict(
				   app_id,
				   provider,
				   metric_key,
				   occurred_at,
				   dimensions_hash
				 ) do update set
				   value=excluded.value,
				   unit=excluded.unit,
				   source_updated_at=excluded.source_updated_at,
				   imported_at=now(),
				   freshness_hours=excluded.freshness_hours,
				   completeness=excluded.completeness`,
				job.WorkspaceID,
				job.AppID,
				point.Provider,
				point.MetricKey,
				point.OccurredAt,
				point.Value,
				point.Unit,
				dimensions,
				nullTime(point.SourceUpdatedAt),
				freshnessHours(point.SourceUpdatedAt),
				pointCompleteness(point),
			); err != nil {
				return err
			}
		}
		return nil
	})
}

func (db *DB) DeleteExpiredMetrics(
	ctx context.Context,
	now time.Time,
	historyDays int,
) (int64, error) {
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
	rows.Close()
	cutoff := now.UTC().AddDate(0, 0, -historyDays)
	var total int64
	for _, workspaceID := range workspaceIDs {
		err := db.WithWorkspace(ctx, workspaceID, func(tx pgx.Tx) error {
			result, err := tx.Exec(
				ctx,
				"delete from metric_points where workspace_id=$1 and occurred_at < $2",
				workspaceID,
				cutoff,
			)
			if err == nil {
				total += result.RowsAffected()
			}
			return err
		})
		if err != nil {
			return total, err
		}
	}
	return total, nil
}

func nullTime(value time.Time) any {
	if value.IsZero() {
		return nil
	}
	return value
}

func freshnessHours(value time.Time) float64 {
	if value.IsZero() {
		return 0
	}
	return time.Since(value).Hours()
}

func pointCompleteness(point syncer.MetricPoint) float64 {
	if point.Completeness <= 0 {
		return 1
	}
	if point.Completeness > 1 {
		return 1
	}
	return point.Completeness
}
