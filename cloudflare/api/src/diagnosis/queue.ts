import { log, nowISO } from "../runtime";
import { runDiagnosis } from "./engine";
import { persistDiagnosisRun } from "./persist";
import type { DiagnosisMetric } from "./types";

export interface DiagnosisMessage {
  type: "diagnosis-run";
  workspaceId: string;
  appId: string;
  queuedAt: string;
}

export async function queueDiagnosisRun(
  env: Cloudflare.Env,
  workspaceId: string,
  appId: string,
): Promise<{ queued: boolean }> {
  // Check if an existing uncompleted run is queued or running
  const existing = await env.DB.prepare(
    `SELECT id FROM diagnosis_runs
     WHERE workspace_id=? AND app_id=? AND status IN ('queued','running')
     LIMIT 1`,
  )
    .bind(workspaceId, appId)
    .first<{ id: string }>();

  if (existing) {
    log("info", "diagnosis_run_already_queued", { workspaceId, appId });
    return { queued: false };
  }

  const now = nowISO();
  const runId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO diagnosis_runs(
       id,workspace_id,app_id,status,attempt,max_attempts,run_after,updated_at,created_at
     ) VALUES(?,?,?,'queued',0,4,?,?,?)`,
  )
    .bind(runId, workspaceId, appId, now, now, now)
    .run();

  const message: DiagnosisMessage = {
    type: "diagnosis-run",
    workspaceId,
    appId,
    queuedAt: now,
  };

  await env.SYNC_QUEUE.send(message);

  log("info", "diagnosis_run_queued", { runId, workspaceId, appId });
  return { queued: true };
}

export async function processDiagnosisMessage(
  env: Cloudflare.Env,
  message: DiagnosisMessage,
): Promise<{ retry: boolean }> {
  const { workspaceId, appId } = message;
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Fetch metric_points for this workspace & app
    const metricsResult = await env.DB.prepare(
      `SELECT provider,metric_key,occurred_at,value,unit,freshness_hours,completeness,dimensions
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
        dimensions: string;
      }>();

    const metrics: DiagnosisMetric[] = metricsResult.results.map((m) => ({
      provider: m.provider as any,
      key: m.metric_key,
      occurredAt: m.occurred_at,
      value: Number(m.value),
      unit: m.unit as any,
      freshnessHours: Number(m.freshness_hours),
      completeness: Number(m.completeness),
    }));

    // 2. Execute Pure TS Diagnosis Engine
    const result = runDiagnosis({
      metrics,
      now,
    });

    // 3. Persist Diagnosis Run Output
    await persistDiagnosisRun(env.DB, workspaceId, appId, result);

    log("info", "diagnosis_run_succeeded", {
      workspaceId,
      appId,
      status: result.status,
      insightCount: result.insights.length,
      evidenceCount: result.evidence.length,
    });

    return { retry: false };
  } catch (error) {
    log("error", "diagnosis_run_failed", {
      workspaceId,
      appId,
      error: error instanceof Error ? error.message : "unknown",
    });

    await env.DB.prepare(
      `UPDATE diagnosis_runs
       SET status='failed',last_error_code=?,updated_at=?
       WHERE workspace_id=? AND app_id=? AND status IN ('queued','running')`,
    )
      .bind(
        error instanceof Error ? error.message : "engine_failed",
        nowISO(),
        workspaceId,
        appId,
      )
      .run();

    return { retry: false };
  }
}
