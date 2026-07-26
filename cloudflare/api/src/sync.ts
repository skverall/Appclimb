import { md5 } from "@noble/hashes/legacy.js";

import {
  discoverPostHogEvents,
  readAggregates,
  refreshPostHogOAuth,
  type Aggregate,
} from "./aggregates";
import { ProviderError } from "./connectors";
import {
  openCredentials,
  sealCredentials,
  type CredentialEnvelope,
} from "./crypto";
import { log, nowISO, requireSecret } from "./runtime";
import type { SyncMessage } from "./sources";
import { autoMapPostHogEvents } from "../../../src/lib/posthog-events";

interface SyncJobRow {
  id: string;
  workspace_id: string;
  connection_id: string;
  provider: string;
  status: string;
  window_from: string;
  window_to: string;
  attempt: number;
  max_attempts: number;
  app_id: string;
  credential_envelope: string;
}

function stableDimensions(dimensions: Record<string, string>): string {
  return `{${Object.entries(dimensions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`,
    )
    .join(", ")}}`;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function freshnessHours(sourceUpdatedAt: string | null): number {
  if (!sourceUpdatedAt) return 0;
  return Math.max(
    0,
    (Date.now() - new Date(sourceUpdatedAt).getTime()) / 3_600_000,
  );
}

async function upsertMetrics(
  db: D1Database,
  job: SyncJobRow,
  points: Aggregate[],
): Promise<void> {
  const importedAt = nowISO();
  for (let offset = 0; offset < points.length; offset += 50) {
    const statements = points.slice(offset, offset + 50).map((point) => {
      const pgDimensions = stableDimensions(point.dimensions);
      return db
        .prepare(
          `INSERT INTO metric_points(
             id,workspace_id,app_id,provider,metric_key,occurred_at,value,unit,
             dimensions,dimensions_hash,source_updated_at,imported_at,
             freshness_hours,completeness
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(app_id,provider,metric_key,occurred_at,dimensions_hash)
           DO UPDATE SET
             value=excluded.value,
             unit=excluded.unit,
             source_updated_at=excluded.source_updated_at,
             imported_at=excluded.imported_at,
             freshness_hours=excluded.freshness_hours,
             completeness=excluded.completeness`,
        )
        .bind(
          crypto.randomUUID(),
          job.workspace_id,
          job.app_id,
          job.provider,
          point.metricKey,
          point.occurredAt,
          point.value,
          point.unit,
          JSON.stringify(point.dimensions),
          hex(md5(new TextEncoder().encode(pgDimensions))),
          point.sourceUpdatedAt,
          importedAt,
          freshnessHours(point.sourceUpdatedAt),
          Math.max(0, Math.min(1, point.completeness || 1)),
        );
    });
    if (statements.length) {
      await db.batch(statements);
    }
  }
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(30 * 60, 15 * 2 ** Math.max(0, Math.min(8, attempt)));
}

async function completeSync(
  env: Cloudflare.Env,
  job: SyncJobRow,
  pointCount: number,
): Promise<void> {
  const now = new Date();
  const intervalHours = Math.max(1, Number(env.SYNC_INTERVAL_HOURS) || 6);
  const nextSyncAt = new Date(
    now.getTime() + intervalHours * 60 * 60 * 1000,
  ).toISOString();
  const status = pointCount > 0 ? "connected" : "needs-attention";
  const errorCode = pointCount > 0 ? null : "no_data_in_window";
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE sync_jobs SET status='succeeded',locked_at=NULL,
       last_error_code=NULL,updated_at=? WHERE id=? AND workspace_id=?`,
    ).bind(now.toISOString(), job.id, job.workspace_id),
    env.DB.prepare(
      `UPDATE source_connections SET status=?,last_synced_at=?,next_sync_at=?,
       last_error_code=?,updated_at=? WHERE id=? AND workspace_id=?`,
    ).bind(
      status,
      now.toISOString(),
      nextSyncAt,
      errorCode,
      now.toISOString(),
      job.connection_id,
      job.workspace_id,
    ),
    env.DB.prepare(
      `INSERT INTO audit_events(
         id,workspace_id,action,target_type,target_id,metadata,occurred_at
       ) VALUES(?,?,'source.synced','source',?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      job.workspace_id,
      job.provider,
      JSON.stringify({ jobId: job.id, pointCount }),
      now.toISOString(),
    ),
  ]);
}

async function failSync(
  env: Cloudflare.Env,
  job: SyncJobRow,
  error: unknown,
): Promise<boolean> {
  const providerError =
    error instanceof ProviderError
      ? error
      : new ProviderError("sync_failed", 502, true);
  const shouldRetry =
    providerError.retryable && job.attempt < job.max_attempts;
  const delay = retryDelaySeconds(job.attempt);
  const runAfter = new Date(Date.now() + delay * 1000).toISOString();
  const updatedAt = nowISO();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE sync_jobs SET status=?,run_after=?,locked_at=NULL,
       last_error_code=?,updated_at=? WHERE id=? AND workspace_id=?`,
    ).bind(
      shouldRetry ? "retrying" : "failed",
      runAfter,
      providerError.code,
      updatedAt,
      job.id,
      job.workspace_id,
    ),
    env.DB.prepare(
      `UPDATE source_connections SET status=?,last_error_code=?,
       next_sync_at=?,updated_at=? WHERE id=? AND workspace_id=?`,
    ).bind(
      shouldRetry ? "connected" : "needs-attention",
      providerError.code,
      runAfter,
      updatedAt,
      job.connection_id,
      job.workspace_id,
    ),
  ]);
  log(shouldRetry ? "warn" : "error", "source_sync_failed", {
    jobId: job.id,
    provider: job.provider,
    attempt: job.attempt,
    retry: shouldRetry,
    errorCode: providerError.code,
  });
  return shouldRetry;
}

export async function processSyncMessage(
  env: Cloudflare.Env,
  message: SyncMessage,
): Promise<{ retry: boolean }> {
  const claimedAt = nowISO();
  const claimed = await env.DB.prepare(
    `UPDATE sync_jobs SET status='running',locked_at=?,
     attempt=attempt+1,updated_at=?
     WHERE id=? AND workspace_id=? AND connection_id=?
       AND status IN ('queued','retrying')`,
  )
    .bind(
      claimedAt,
      claimedAt,
      message.jobId,
      message.workspaceId,
      message.connectionId,
    )
    .run();
  if (!claimed.meta.changes) {
    return { retry: false };
  }
  const job = await env.DB.prepare(
    `SELECT sj.id,sj.workspace_id,sj.connection_id,sj.provider,sj.status,
            sj.window_from,sj.window_to,sj.attempt,sj.max_attempts,
            sc.app_id,sc.credential_envelope
     FROM sync_jobs sj
     JOIN source_connections sc
       ON sc.id=sj.connection_id AND sc.workspace_id=sj.workspace_id
     WHERE sj.id=? AND sj.workspace_id=?
       AND sc.status IN ('connected','needs-attention')`,
  )
    .bind(message.jobId, message.workspaceId)
    .first<SyncJobRow>();
  if (!job || job.provider !== message.provider || !job.app_id) {
    if (job) {
      return { retry: await failSync(env, job, new Error("job_invalid")) };
    }
    return { retry: false };
  }
  try {
    const envelope = JSON.parse(
      job.credential_envelope,
    ) as CredentialEnvelope;
    let credentials = await openCredentials(
      envelope,
      requireSecret(env, "ENVELOPE_MASTER_KEY"),
    );
    if (job.provider === "posthog") {
      let credentialsChanged = false;
      const refreshed = await refreshPostHogOAuth(credentials);
      credentials = refreshed.credentials;
      credentialsChanged = refreshed.changed;
      if (credentials.mappingMode !== "manual") {
        try {
          const events = await discoverPostHogEvents(credentials, 30);
          const autoMap = autoMapPostHogEvents(events);
          const currentMap = JSON.stringify({
            sessionEvent: credentials.sessionEvent,
            activationEvent: credentials.activationEvent,
            eventFlow: credentials.eventFlow,
            detectedEventCount: credentials.detectedEventCount,
            mappingMode: credentials.mappingMode,
          });
          const nextMap = JSON.stringify({
            ...autoMap,
            mappingMode: "automatic",
          });
          credentials = {
            ...credentials,
            ...autoMap,
            mappingMode: "automatic",
          };
          credentialsChanged ||= currentMap !== nextMap;
        } catch (error) {
          if (!credentials.sessionEvent && !credentials.activationEvent) {
            throw error;
          }
          log("warn", "posthog_auto_map_refresh_failed", {
            jobId: job.id,
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      }
      if (credentialsChanged) {
        const resealed = await sealCredentials(
          credentials,
          requireSecret(env, "ENVELOPE_MASTER_KEY"),
        );
        await env.DB.prepare(
          `UPDATE source_connections SET credential_envelope=?,updated_at=?
           WHERE id=? AND workspace_id=?`,
        )
          .bind(
            JSON.stringify(resealed),
            nowISO(),
            job.connection_id,
            job.workspace_id,
          )
          .run();
      }
    }
    const points = await readAggregates(
      job.provider,
      credentials,
      new Date(job.window_from),
      new Date(job.window_to),
    );
    await upsertMetrics(env.DB, job, points);
    await completeSync(env, job, points.length);
    log("info", "source_sync_succeeded", {
      jobId: job.id,
      provider: job.provider,
      pointCount: points.length,
    });
    return { retry: false };
  } catch (error) {
    return { retry: await failSync(env, job, error) };
  }
}
