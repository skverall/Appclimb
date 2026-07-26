import { audit, isEntitled, workspaceFor } from "./db";
import { sealCredentials } from "./crypto";
import { isSupportedProvider, verifyProvider } from "./connectors";
import { nowISO, requireSecret } from "./runtime";
import type { AuthContext } from "./types";

const providerOrder = [
  "app-store-connect",
  "revenuecat",
  "posthog",
  "superwall",
  "appclimb-rank",
] as const;

const providerMetadata: Record<
  (typeof providerOrder)[number],
  { label: string; capabilities: string[] }
> = {
  "app-store-connect": {
    label: "App Store Connect",
    capabilities: [
      "App Store impressions",
      "Product page views",
      "Downloads",
    ],
  },
  revenuecat: {
    label: "RevenueCat",
    capabilities: [
      "Revenue",
      "New trials",
      "New paid",
      "Trial conversion",
      "Retention rate",
      "Churn rate",
    ],
  },
  posthog: {
    label: "PostHog",
    capabilities: ["Activation event users", "Session event users"],
  },
  superwall: {
    label: "Superwall",
    capabilities: ["Paywall views", "Paywall conversion", "Trial starts"],
  },
  "appclimb-rank": {
    label: "Keyword Monitor",
    capabilities: ["Roadmap", "100 keywords planned", "3 storefronts planned"],
  },
};

interface SourceRow {
  id: string;
  provider: string;
  status: string;
  account_label: string | null;
  last_verified_at: string | null;
  last_synced_at: string | null;
  next_sync_at: string | null;
  last_error_code: string | null;
  sync_status: string | null;
  sync_attempt: number | null;
  sync_max_attempts: number | null;
  metric_count: number;
  last_metric_at: string | null;
}

export async function listSources(
  db: D1Database,
  workspaceId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await db
    .prepare(
      `SELECT
         sc.id,
         sc.provider,
         sc.status,
         sc.account_label,
         sc.last_verified_at,
         sc.last_synced_at,
         sc.next_sync_at,
         sc.last_error_code,
         (
           SELECT sj.status
           FROM sync_jobs sj
           WHERE sj.connection_id = sc.id
           ORDER BY sj.created_at DESC
           LIMIT 1
         ) AS sync_status,
         (
           SELECT sj.attempt
           FROM sync_jobs sj
           WHERE sj.connection_id = sc.id
           ORDER BY sj.created_at DESC
           LIMIT 1
         ) AS sync_attempt,
         (
           SELECT sj.max_attempts
           FROM sync_jobs sj
           WHERE sj.connection_id = sc.id
           ORDER BY sj.created_at DESC
           LIMIT 1
         ) AS sync_max_attempts,
         (
           SELECT COUNT(*)
           FROM metric_points mp
           WHERE mp.workspace_id = sc.workspace_id
             AND mp.provider = sc.provider
         ) AS metric_count,
         (
           SELECT MAX(mp.occurred_at)
           FROM metric_points mp
           WHERE mp.workspace_id = sc.workspace_id
             AND mp.provider = sc.provider
         ) AS last_metric_at
       FROM source_connections sc
       WHERE sc.workspace_id = ?
       ORDER BY sc.provider`,
    )
    .bind(workspaceId)
    .all<SourceRow>();
  const byProvider = new Map(rows.results.map((row) => [row.provider, row]));
  return providerOrder.map((provider) => {
    const row = byProvider.get(provider);
    const metadata = providerMetadata[provider];
    return {
      provider,
      label: metadata.label,
      status: row?.status ?? "not-connected",
      accountLabel: row?.account_label ?? "",
      lastSyncAt: row?.last_synced_at ?? null,
      nextSyncAt: row?.next_sync_at ?? null,
      lastErrorCode: row?.last_error_code ?? "",
      syncStatus: row?.sync_status ?? null,
      syncAttempt: row?.sync_attempt ?? 0,
      syncMaxAttempts: row?.sync_max_attempts ?? 0,
      metricCount: Number(row?.metric_count ?? 0),
      lastMetricAt: row?.last_metric_at ?? null,
      capabilities: metadata.capabilities,
      readOnly: true,
    };
  });
}

export async function connectSource(
  env: Cloudflare.Env,
  auth: AuthContext,
  provider: string,
  credentials: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const verification = await verifyProvider(provider, credentials);
  const envelope = await sealCredentials(
    credentials,
    requireSecret(env, "ENVELOPE_MASTER_KEY"),
  );
  const app = await env.DB.prepare(
    "SELECT id FROM apps WHERE workspace_id = ? ORDER BY created_at LIMIT 1",
  )
    .bind(auth.workspaceId)
    .first<{ id: string }>();
  if (!app) {
    throw new Error("app_not_found");
  }
  const now = nowISO();
  const existing = await env.DB.prepare(
    "SELECT id FROM source_connections WHERE workspace_id = ? AND provider = ?",
  )
    .bind(auth.workspaceId, provider)
    .first<{ id: string }>();
  if (existing) {
    await env.DB.prepare(
      `UPDATE source_connections SET
         app_id = ?,
         status = 'connected',
         credential_envelope = ?,
         account_label = ?,
         last_verified_at = ?,
         next_sync_at = ?,
         last_error_code = NULL,
         updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
      .bind(
        app.id,
        JSON.stringify(envelope),
        verification.accountLabel ?? "",
        verification.checkedAt,
        now,
        now,
        existing.id,
        auth.workspaceId,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO source_connections(
         id,workspace_id,app_id,provider,status,credential_envelope,
         account_label,last_verified_at,next_sync_at,created_at,updated_at
       ) VALUES(?,?,?,?,'connected',?,?,?,?,?,?)`,
    )
      .bind(
        crypto.randomUUID(),
        auth.workspaceId,
        app.id,
        provider,
        JSON.stringify(envelope),
        verification.accountLabel ?? "",
        verification.checkedAt,
        now,
        now,
        now,
      )
      .run();
  }
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "source.connected",
    "source",
    provider,
    { provider },
  );
  return {
    provider,
    status: "connected",
    accountLabel: verification.accountLabel ?? "",
    lastVerifiedAt: verification.checkedAt,
    nextSyncAt: now,
    lastErrorCode: "",
    metricCount: 0,
  };
}

export async function deleteSource(
  env: Cloudflare.Env,
  auth: AuthContext,
  provider: string,
): Promise<void> {
  await env.DB.prepare(
    "DELETE FROM source_connections WHERE workspace_id = ? AND provider = ?",
  )
    .bind(auth.workspaceId, provider)
    .run();
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "source.revoked",
    "source",
    provider,
    { provider },
  );
}

export interface SyncMessage {
  type: "source-sync";
  jobId: string;
  workspaceId: string;
  connectionId: string;
  provider: string;
}

export async function queueSourceSync(
  env: Cloudflare.Env,
  auth: AuthContext,
  provider: string,
): Promise<{ jobId: string; provider: string; status: "queued" }> {
  if (!isSupportedProvider(provider)) {
    throw new Error("unsupported_provider");
  }
  const workspace = await workspaceFor(env.DB, auth.userId, auth.workspaceId);
  if (!workspace || !isEntitled(workspace)) {
    throw new Error("entitlement_required");
  }
  const connection = await env.DB.prepare(
    `SELECT id FROM source_connections
     WHERE workspace_id = ? AND provider = ?
       AND status IN ('connected','needs-attention')`,
  )
    .bind(auth.workspaceId, provider)
    .first<{ id: string }>();
  if (!connection) {
    throw new Error("source_not_connected");
  }
  const outstanding = await env.DB.prepare(
    `SELECT id FROM sync_jobs
     WHERE connection_id = ? AND status IN ('queued','running','retrying')
     ORDER BY created_at LIMIT 1`,
  )
    .bind(connection.id)
    .first<{ id: string }>();
  if (outstanding) {
    return { jobId: outstanding.id, provider, status: "queued" };
  }
  const now = new Date();
  const jobId = crypto.randomUUID();
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const to = now.toISOString();
  await env.DB.prepare(
    `INSERT INTO sync_jobs(
       id,workspace_id,connection_id,provider,status,window_from,window_to,
       attempt,max_attempts,run_after,created_at,updated_at
     ) VALUES(?,?,?,?,'queued',?,?,0,6,?,?,?)`,
  )
    .bind(
      jobId,
      auth.workspaceId,
      connection.id,
      provider,
      from,
      to,
      to,
      to,
      to,
    )
    .run();
  const message: SyncMessage = {
    type: "source-sync",
    jobId,
    workspaceId: auth.workspaceId,
    connectionId: connection.id,
    provider,
  };
  await env.SYNC_QUEUE.send(message);
  return { jobId, provider, status: "queued" };
}

export async function queueDueSyncs(env: Cloudflare.Env): Promise<number> {
  const now = nowISO();
  const rows = await env.DB.prepare(
    `SELECT id,workspace_id,provider
     FROM source_connections
     WHERE status IN ('connected','needs-attention')
       AND (next_sync_at IS NULL OR next_sync_at <= ?)
     ORDER BY COALESCE(next_sync_at, created_at)
     LIMIT 100`,
  )
    .bind(now)
    .all<{ id: string; workspace_id: string; provider: string }>();
  let queued = 0;
  for (const connection of rows.results) {
    const outstanding = await env.DB.prepare(
      `SELECT id FROM sync_jobs
       WHERE connection_id = ? AND status IN ('queued','running','retrying')
       LIMIT 1`,
    )
      .bind(connection.id)
      .first<{ id: string }>();
    if (outstanding) {
      continue;
    }
    const jobId = crypto.randomUUID();
    const to = new Date();
    const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
    await env.DB.prepare(
      `INSERT INTO sync_jobs(
         id,workspace_id,connection_id,provider,status,window_from,window_to,
         attempt,max_attempts,run_after,created_at,updated_at
       ) VALUES(?,?,?,?,'queued',?,?,0,6,?,?,?)`,
    )
      .bind(
        jobId,
        connection.workspace_id,
        connection.id,
        connection.provider,
        from.toISOString(),
        to.toISOString(),
        to.toISOString(),
        to.toISOString(),
        to.toISOString(),
      )
      .run();
    await env.SYNC_QUEUE.send({
      type: "source-sync",
      jobId,
      workspaceId: connection.workspace_id,
      connectionId: connection.id,
      provider: connection.provider,
    } satisfies SyncMessage);
    queued += 1;
  }
  return queued;
}
