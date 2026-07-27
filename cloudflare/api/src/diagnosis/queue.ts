import { log, nowISO } from "../runtime";
import { DIAGNOSIS_WINDOW_DAYS, RUN_CONFIG } from "./config";
import { inputHash, runDiagnosis } from "./engine";
import {
  completeDebouncedRun,
  failDiagnosisRun,
  persistDiagnosisRun,
  toDiagnosisStatus,
} from "./persist";
import type { DiagnosisMetric, Platform } from "./types";

export interface DiagnosisMessage {
  type: "diagnosis-run";
  /**
   * The run row this message owns. Without it a worker cannot tell which row to
   * transition, which is how runs used to be stranded at 'queued' forever.
   */
  runId: string;
  workspaceId: string;
  appId: string;
  queuedAt: string;
}

/** Stable error codes. An exception message is never persisted or returned. */
export type DiagnosisErrorCode =
  | "app_not_found"
  | "metrics_read_failed"
  | "web_events_read_failed"
  | "engine_failed"
  | "persist_failed"
  | "diagnosis_failed";

function backoffSeconds(attempt: number): number {
  const exponent = Math.max(0, Math.min(8, attempt));
  return Math.min(
    RUN_CONFIG.retryMaxSeconds,
    RUN_CONFIG.retryBaseSeconds * 2 ** exponent,
  );
}

/**
 * Enqueues one diagnosis run for an app.
 *
 * A single row is created here and transitioned through
 * queued -> running -> succeeded/failed by the worker. It is never accompanied
 * by a second row: the partial unique index
 * `diagnosis_runs_one_outstanding_per_app_idx` guarantees at most one
 * outstanding run per app, and a duplicate insert would throw rather than
 * silently queue twice.
 */
export async function queueDiagnosisRun(
  env: Cloudflare.Env,
  workspaceId: string,
  appId: string,
): Promise<{ queued: boolean; runId?: string; reason?: string }> {
  const outstanding = await env.DB.prepare(
    `SELECT id FROM diagnosis_runs
      WHERE workspace_id=? AND app_id=? AND status IN ('queued','running','retrying')
      LIMIT 1`,
  )
    .bind(workspaceId, appId)
    .first<{ id: string }>();

  if (outstanding) {
    log("info", "diagnosis_run_already_outstanding", {
      workspaceId,
      appId,
      runId: outstanding.id,
    });
    return { queued: false, runId: outstanding.id, reason: "already_outstanding" };
  }

  const now = nowISO();
  const runId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO diagnosis_runs(
       id,workspace_id,app_id,status,outcome,attempt,max_attempts,
       run_after,updated_at,created_at
     ) VALUES(?,?,?,'queued','queued',0,?,?,?,?)`,
  )
    .bind(runId, workspaceId, appId, RUN_CONFIG.maxAttempts, now, now, now)
    .run();

  await sendDiagnosisMessage(env, { runId, workspaceId, appId, queuedAt: now });

  log("info", "diagnosis_run_queued", { runId, workspaceId, appId });
  return { queued: true, runId };
}

async function sendDiagnosisMessage(
  env: Cloudflare.Env,
  params: { runId: string; workspaceId: string; appId: string; queuedAt: string },
): Promise<void> {
  const message: DiagnosisMessage = {
    type: "diagnosis-run",
    runId: params.runId,
    workspaceId: params.workspaceId,
    appId: params.appId,
    queuedAt: params.queuedAt,
  };
  await env.SYNC_QUEUE.send(message);
}

/**
 * Resets runs abandoned mid-flight.
 *
 * A worker that dies after claiming a run leaves it 'running' forever, and the
 * one-outstanding-run index then blocks the app permanently. Anything locked
 * longer than the stale threshold goes back to 'retrying' so the catch-up pass
 * can pick it up.
 */
export async function recoverStaleDiagnosisRuns(
  env: Cloudflare.Env,
): Promise<number> {
  const now = new Date();
  const cutoff = new Date(
    now.getTime() - RUN_CONFIG.staleRunMinutes * 60 * 1000,
  ).toISOString();

  const result = await env.DB.prepare(
    `UPDATE diagnosis_runs
        SET status='retrying',outcome='queued',locked_at=NULL,
            run_after=?,last_error_code='stale_run_recovered',updated_at=?
      WHERE status='running' AND locked_at IS NOT NULL AND locked_at < ?`,
  )
    .bind(now.toISOString(), now.toISOString(), cutoff)
    .run();

  const recovered = Number(result.meta?.changes ?? 0);
  if (recovered) {
    log("warn", "diagnosis_stale_runs_recovered", { recovered });
  }
  return recovered;
}

/**
 * Scheduled catch-up for runs whose queue message never arrived or whose retry
 * is now due. Mirrors the `queueDueSyncs` pattern.
 */
export async function queueDueDiagnosisRuns(
  env: Cloudflare.Env,
): Promise<number> {
  const now = nowISO();
  const rows = await env.DB.prepare(
    `SELECT id,workspace_id,app_id
       FROM diagnosis_runs
      WHERE status IN ('queued','retrying') AND run_after <= ?
      ORDER BY run_after
      LIMIT ?`,
  )
    .bind(now, RUN_CONFIG.catchUpBatchSize)
    .all<{ id: string; workspace_id: string; app_id: string }>();

  let queued = 0;
  for (const row of rows.results) {
    try {
      await sendDiagnosisMessage(env, {
        runId: row.id,
        workspaceId: row.workspace_id,
        appId: row.app_id,
        queuedAt: now,
      });
      queued += 1;
    } catch (error) {
      log("warn", "diagnosis_catch_up_send_failed", {
        runId: row.id,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
  return queued;
}

interface AppRow {
  id: string;
  platform: string;
}

async function loadIosMetrics(
  env: Cloudflare.Env,
  workspaceId: string,
  appId: string,
  from: string,
): Promise<DiagnosisMetric[]> {
  const result = await env.DB.prepare(
    `SELECT provider,metric_key,occurred_at,value,unit,freshness_hours,completeness
       FROM metric_points
      WHERE workspace_id=? AND app_id=? AND occurred_at >= ?
      ORDER BY occurred_at`,
  )
    .bind(workspaceId, appId, from)
    .all<{
      provider: string;
      metric_key: string;
      occurred_at: string;
      value: number;
      unit: string;
      freshness_hours: number;
      completeness: number;
    }>();

  return result.results.map((row) => ({
    provider: row.provider as DiagnosisMetric["provider"],
    key: row.metric_key,
    occurredAt: row.occurred_at,
    value: Number(row.value),
    unit: row.unit as DiagnosisMetric["unit"],
    freshnessHours: Number(row.freshness_hours),
    completeness: Number(row.completeness),
  }));
}

/**
 * Builds the web funnel from AppClimb's own collector.
 *
 * Every stage is a visitor-scoped subset of the one before it, so each ratio is
 * a real proportion with a valid denominator rather than a cross-source
 * aggregate. Days before today are complete; the day in progress is not, and is
 * marked so the engine excludes it from comparisons.
 */
export async function loadWebMetrics(
  env: Cloudflare.Env,
  workspaceId: string,
  appId: string,
  from: string,
  now: Date,
): Promise<DiagnosisMetric[]> {
  const property = await env.DB.prepare(
    `SELECT id FROM web_properties
      WHERE workspace_id=? AND (app_id=? OR app_id IS NULL)
      ORDER BY CASE WHEN app_id=? THEN 0 ELSE 1 END, created_at
      LIMIT 1`,
  )
    .bind(workspaceId, appId, appId)
    .first<{ id: string }>();

  if (!property) return [];

  const rows = await env.DB.prepare(
    `SELECT substr(occurred_at,1,10) AS day,
            COUNT(DISTINCT visitor_id) AS visitors,
            COUNT(DISTINCT CASE WHEN kind IN ('engagement','conversion')
                                THEN visitor_id END) AS engaged,
            COUNT(DISTINCT CASE WHEN kind='conversion'
                                THEN visitor_id END) AS converted,
            MAX(occurred_at) AS last_seen
       FROM web_events
      WHERE workspace_id=? AND property_id=? AND occurred_at >= ?
      GROUP BY day
      ORDER BY day`,
  )
    .bind(workspaceId, property.id, from)
    .all<{
      day: string;
      visitors: number;
      engaged: number;
      converted: number;
      last_seen: string;
    }>();

  const today = now.toISOString().slice(0, 10);
  const metrics: DiagnosisMetric[] = [];

  for (const row of rows.results) {
    const complete = row.day < today;
    const occurredAt = `${row.day}T00:00:00.000Z`;
    const freshnessHours = Math.max(
      0,
      (now.getTime() - new Date(row.last_seen).getTime()) / 3_600_000,
    );
    const shared = {
      provider: "appclimb-web" as const,
      occurredAt,
      unit: "count" as const,
      freshnessHours,
      // A day still in progress cannot be compared against a whole day.
      completeness: complete ? 1 : 0.5,
    };
    metrics.push({ ...shared, key: "web_visitors", value: Number(row.visitors) });
    metrics.push({
      ...shared,
      key: "web_engaged_visitors",
      value: Number(row.engaged),
    });
    metrics.push({
      ...shared,
      key: "web_converted_visitors",
      value: Number(row.converted),
    });
  }

  return metrics;
}

/**
 * Runs one diagnosis message end to end.
 *
 * Claims the run row it owns, loads the platform's metrics, debounces against a
 * recent identical input, executes the deterministic engine, and persists the
 * result atomically. Returns `{ retry: true }` while attempts remain so the
 * queue actually retries instead of silently swallowing every failure.
 */
export async function processDiagnosisMessage(
  env: Cloudflare.Env,
  message: DiagnosisMessage,
): Promise<{ retry: boolean }> {
  const { runId, workspaceId, appId } = message;
  const now = new Date();
  const claimedAt = now.toISOString();

  const claimed = await env.DB.prepare(
    `UPDATE diagnosis_runs
        SET status='running',outcome='running',locked_at=?,
            attempt=attempt+1,updated_at=?
      WHERE id=? AND workspace_id=? AND app_id=?
        AND status IN ('queued','retrying')`,
  )
    .bind(claimedAt, claimedAt, runId, workspaceId, appId)
    .run();

  if (!claimed.meta?.changes) {
    // Already claimed by another delivery, or already finished.
    log("info", "diagnosis_run_not_claimable", { runId, workspaceId, appId });
    return { retry: false };
  }

  const run = await env.DB.prepare(
    `SELECT attempt,max_attempts FROM diagnosis_runs WHERE id=? AND workspace_id=?`,
  )
    .bind(runId, workspaceId)
    .first<{ attempt: number; max_attempts: number }>();

  const attempt = Number(run?.attempt ?? 1);
  const maxAttempts = Number(run?.max_attempts ?? RUN_CONFIG.maxAttempts);

  let errorCode: DiagnosisErrorCode = "diagnosis_failed";

  try {
    const app = await env.DB.prepare(
      `SELECT id,platform FROM apps WHERE id=? AND workspace_id=? LIMIT 1`,
    )
      .bind(appId, workspaceId)
      .first<AppRow>();

    if (!app) {
      // A deleted app is not retryable.
      await failDiagnosisRun(env.DB, runId, workspaceId, "app_not_found", {
        retry: false,
        runAfter: claimedAt,
      });
      return { retry: false };
    }

    const platform: Platform = app.platform === "Web" ? "Web" : "iOS";
    const from = new Date(
      now.getTime() - DIAGNOSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    errorCode = platform === "Web" ? "web_events_read_failed" : "metrics_read_failed";
    const metrics =
      platform === "Web"
        ? await loadWebMetrics(env, workspaceId, appId, from, now)
        : await loadIosMetrics(env, workspaceId, appId, from);

    // Debounce: an identical input already diagnosed recently does not need to
    // be recomputed or rewritten. Computed before the engine runs, so the
    // expensive path is genuinely skipped.
    const hash = inputHash(metrics, now, platform);
    const debounceCutoff = new Date(
      now.getTime() - RUN_CONFIG.debounceMinutes * 60 * 1000,
    ).toISOString();

    const recent = await env.DB.prepare(
      `SELECT outcome,status FROM diagnosis_runs
        WHERE workspace_id=? AND app_id=? AND status='succeeded'
          AND input_hash=? AND completed_at >= ?
        ORDER BY completed_at DESC
        LIMIT 1`,
    )
      .bind(workspaceId, appId, hash, debounceCutoff)
      .first<{ outcome: string | null; status: string }>();

    if (recent) {
      await completeDebouncedRun(
        env.DB,
        runId,
        workspaceId,
        appId,
        toDiagnosisStatus(recent.outcome, recent.status),
        hash,
      );
      log("info", "diagnosis_run_debounced", { runId, workspaceId, appId, hash });
      return { retry: false };
    }

    errorCode = "engine_failed";
    const result = runDiagnosis({ metrics, now, platform });

    errorCode = "persist_failed";
    await persistDiagnosisRun(env.DB, runId, workspaceId, appId, result);

    log("info", "diagnosis_run_succeeded", {
      runId,
      workspaceId,
      appId,
      platform,
      outcome: result.status,
      insightCount: result.insights.length,
      evidenceCount: result.evidence.length,
      inputHash: result.inputHash,
    });

    return { retry: false };
  } catch (error) {
    const shouldRetry = attempt < maxAttempts;
    const runAfter = new Date(
      now.getTime() + backoffSeconds(attempt) * 1000,
    ).toISOString();

    // The message is logged for operators; only the stable code is persisted.
    log(shouldRetry ? "warn" : "error", "diagnosis_run_failed", {
      runId,
      workspaceId,
      appId,
      attempt,
      maxAttempts,
      retry: shouldRetry,
      errorCode,
      error: error instanceof Error ? error.message : "unknown",
    });

    try {
      await failDiagnosisRun(env.DB, runId, workspaceId, errorCode, {
        retry: shouldRetry,
        runAfter,
      });
    } catch (updateError) {
      log("error", "diagnosis_run_status_update_failed", {
        runId,
        error: updateError instanceof Error ? updateError.message : "unknown",
      });
    }

    return { retry: shouldRetry };
  }
}
