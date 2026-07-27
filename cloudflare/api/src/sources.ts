import { audit, isEntitled, workspaceFor } from "./db";
import {
  discoverPostHogEvents,
  refreshPostHogOAuth,
  type PostHogEventOption,
} from "./aggregates";
import {
  openCredentials,
  sealCredentials,
  type CredentialEnvelope,
} from "./crypto";
import {
  isSupportedProvider,
  ProviderError,
  verifyProvider,
} from "./connectors";
import { nowISO, requireSecret } from "./runtime";
import type { AuthContext } from "./types";
import {
  buildPostHogMapping,
  DEFAULT_ACTIVATION_WINDOW_DAYS,
  postHogMappingContractStatus,
  type PostHogMapping,
  type PostHogMappingContractStatus,
  type PostHogMappingMode,
} from "../../../src/lib/posthog-events";

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
    capabilities: [
      "Automatic event map",
      "Active user trend",
      "First-value reach",
      "Product flow signals",
    ],
  },
  superwall: {
    label: "Superwall",
    capabilities: ["Paywall views", "Paywall conversion", "Trial starts"],
  },
  "appclimb-rank": {
    label: "Keyword Monitor",
    capabilities: [
      "100 tracked keywords",
      "Daily observed rank",
      "14-check trend history",
    ],
  },
};

interface SourceRow {
  id: string;
  app_id: string | null;
  provider: string;
  status: string;
  account_label: string | null;
  last_verified_at: string | null;
  last_synced_at: string | null;
  next_sync_at: string | null;
  last_error_code: string | null;
  first_data_at: string | null;
  sync_status: string | null;
  sync_attempt: number | null;
  sync_max_attempts: number | null;
  metric_count: number;
  last_metric_at: string | null;
}

interface PostHogConnectionRow {
  id: string;
  app_id: string | null;
  credential_envelope: string;
  account_label: string | null;
}

interface PostHogMappingRow {
  id: string;
  connection_id: string;
  app_id: string | null;
  project_id: string;
  project_label: string;
  mode: string;
  status: string;
  confidence: number;
  session_event: string;
  activation_event: string;
  milestone_events: string;
  detected_event_count: number;
  activation_window_days: number;
  confirmed_at: string | null;
}

type AccessStatus =
  | "not_connected"
  | "verifying"
  | "verified"
  | "revoked"
  | "error";

type DataStatus =
  | "none"
  | "provider_pending"
  | "collecting"
  | "ready"
  | "stale"
  | "failed";

/** Error codes that mean the saved access itself is no longer usable. */
const accessErrorCodes = new Set([
  "apple_reports_role_required",
  "posthog_oauth_refresh_failed",
  "invalid_posthog_oauth_credentials",
  "invalid_credentials_payload",
  "invalid_credential_envelope",
]);

/** Error codes that mean the provider accepted us but has no files yet. */
const providerPendingCodes = new Set([
  "apple_reports_pending",
  "apple_report_request_required",
]);

/** Hours after which imported data stops being trustworthy for a diagnosis. */
const staleAfterHours = 48;

function accessStatusFor(row: SourceRow | undefined): AccessStatus {
  if (!row || row.status === "not-connected") return "not_connected";
  if (row.status === "revoked") return "revoked";
  if (row.last_error_code && accessErrorCodes.has(row.last_error_code)) {
    return "error";
  }
  if (!row.last_verified_at) return "verifying";
  return "verified";
}

function dataStatusFor(row: SourceRow | undefined, metricCount: number): DataStatus {
  if (!row || row.status === "not-connected") return "none";
  if (row.last_error_code && providerPendingCodes.has(row.last_error_code)) {
    return "provider_pending";
  }
  if (
    row.sync_status === "queued" ||
    row.sync_status === "running" ||
    row.sync_status === "retrying"
  ) {
    return "collecting";
  }
  if (metricCount <= 0) {
    // No metric ever arrived. A failed job is a failure; an empty successful
    // window is simply "nothing yet" and must never be shown as zero.
    return row.sync_status === "failed" ? "failed" : "none";
  }
  const lastMetricAt = row.last_metric_at
    ? Date.parse(row.last_metric_at)
    : Number.NaN;
  if (
    Number.isFinite(lastMetricAt) &&
    Date.now() - lastMetricAt > staleAfterHours * 60 * 60 * 1000
  ) {
    return "stale";
  }
  return "ready";
}

function freshnessHoursFor(row: SourceRow | undefined): number | null {
  const lastMetricAt = row?.last_metric_at
    ? Date.parse(row.last_metric_at)
    : Number.NaN;
  if (!Number.isFinite(lastMetricAt)) return null;
  return Math.max(0, Math.round((Date.now() - lastMetricAt) / 36e5));
}

function mappingFromRow(row: PostHogMappingRow | null): PostHogMapping | null {
  if (!row) return null;
  let milestoneEvents: unknown = [];
  try {
    milestoneEvents = JSON.parse(row.milestone_events);
  } catch {
    milestoneEvents = [];
  }
  const status = row.status as PostHogMapping["status"];
  return {
    mode: (row.mode === "manual" ? "manual" : "automatic") as PostHogMappingMode,
    status,
    confidence: Number.isFinite(row.confidence) ? row.confidence : 0,
    ...(row.session_event ? { sessionEvent: row.session_event } : {}),
    ...(row.activation_event ? { activationEvent: row.activation_event } : {}),
    milestoneEvents: Array.isArray(milestoneEvents)
      ? (milestoneEvents as PostHogMapping["milestoneEvents"])
      : [],
    detectedEventCount: Number(row.detected_event_count) || 0,
    ...(row.confirmed_at ? { confirmedAt: row.confirmed_at } : {}),
  };
}

async function readPostHogMappingRow(
  db: D1Database,
  workspaceId: string,
  connectionId?: string,
): Promise<PostHogMappingRow | null> {
  const statement = connectionId
    ? db
        .prepare(
          `SELECT * FROM posthog_mappings
           WHERE workspace_id=? AND connection_id=? LIMIT 1`,
        )
        .bind(workspaceId, connectionId)
    : db
        .prepare(
          `SELECT * FROM posthog_mappings WHERE workspace_id=? LIMIT 1`,
        )
        .bind(workspaceId);
  try {
    return await statement.first<PostHogMappingRow>();
  } catch {
    // The table only exists after migration 0011. Never fail a read because of
    // a mapping that has not been persisted yet.
    return null;
  }
}

async function writePostHogMappingRow(
  db: D1Database,
  workspaceId: string,
  connectionId: string,
  appId: string | null,
  projectId: string,
  projectLabel: string,
  mapping: PostHogMapping,
  activationWindowDays = DEFAULT_ACTIVATION_WINDOW_DAYS,
): Promise<void> {
  const now = nowISO();
  try {
    await db
      .prepare(
        `INSERT INTO posthog_mappings(
           id,workspace_id,connection_id,app_id,project_id,project_label,
           mode,status,confidence,session_event,activation_event,
           milestone_events,detected_event_count,activation_window_days,
           confirmed_at,created_at,updated_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(workspace_id,connection_id) DO UPDATE SET
           app_id=excluded.app_id,
           project_id=excluded.project_id,
           project_label=excluded.project_label,
           mode=excluded.mode,
           status=excluded.status,
           confidence=excluded.confidence,
           session_event=excluded.session_event,
           activation_event=excluded.activation_event,
           milestone_events=excluded.milestone_events,
           detected_event_count=excluded.detected_event_count,
           activation_window_days=excluded.activation_window_days,
           confirmed_at=excluded.confirmed_at,
           updated_at=excluded.updated_at`,
      )
      .bind(
        crypto.randomUUID(),
        workspaceId,
        connectionId,
        appId,
        projectId,
        projectLabel,
        mapping.mode,
        mapping.status,
        mapping.confidence,
        mapping.sessionEvent ?? "",
        mapping.activationEvent ?? "",
        JSON.stringify(mapping.milestoneEvents),
        mapping.detectedEventCount,
        activationWindowDays,
        mapping.confirmedAt ?? null,
        now,
        now,
      )
      .run();
  } catch {
    // Persisting the lifecycle must not break the connection itself.
  }
}

/**
 * Record the first real metric a source ever delivered (Task P0.17).
 *
 * Idempotent: the audit event is only written when this call is the one that
 * flipped `first_data_at` from NULL, so repeated dashboard reads cannot
 * duplicate `source.first_data_received`.
 */
export async function recordFirstDataReceived(
  db: D1Database,
  workspaceId: string,
  connectionId: string,
  provider: string,
  metricCount: number,
  observedAt = nowISO(),
): Promise<boolean> {
  if (metricCount <= 0) return false;
  try {
    const result = await db
      .prepare(
        `UPDATE source_connections SET first_data_at=?,updated_at=?
         WHERE id=? AND workspace_id=? AND first_data_at IS NULL`,
      )
      .bind(observedAt, nowISO(), connectionId, workspaceId)
      .run();
    if (!result.meta?.changes) return false;
  } catch {
    return false;
  }
  await audit(db, workspaceId, null, "source.first_data_received", "source", provider, {
    provider,
    connectionId,
    metricCount,
    observedAt,
  });
  return true;
}

export async function listSources(
  db: D1Database,
  workspaceId: string,
  appId?: string,
): Promise<Array<Record<string, unknown>>> {
  const [rows, keywordCount] = await Promise.all([
    db
      .prepare(
        `SELECT
         sc.id,
         sc.app_id,
         sc.provider,
         sc.status,
         sc.account_label,
         sc.last_verified_at,
         sc.last_synced_at,
         sc.next_sync_at,
         sc.last_error_code,
         sc.first_data_at,
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
             AND mp.app_id = sc.app_id
         ) AS metric_count,
         (
           SELECT MAX(mp.occurred_at)
           FROM metric_points mp
           WHERE mp.workspace_id = sc.workspace_id
             AND mp.provider = sc.provider
             AND mp.app_id = sc.app_id
         ) AS last_metric_at
       FROM source_connections sc
       WHERE sc.workspace_id = ?
       ORDER BY sc.provider`,
      )
      .bind(workspaceId)
      .all<SourceRow>(),
    appId
      ? db
          .prepare(
            `SELECT COUNT(*) AS total
             FROM keyword_tracks
             WHERE workspace_id=? AND app_id=? AND active=1`,
          )
          .bind(workspaceId, appId)
          .first<{ total: number }>()
      : Promise.resolve({ total: 0 }),
  ]);
  const byProvider = new Map(
    rows.results
      .filter((row) => !appId || row.app_id === appId)
      .map((row) => [row.provider, row]),
  );
  const postHogRow = byProvider.get("posthog");
  const postHogMapping = mappingFromRow(
    await readPostHogMappingRow(db, workspaceId, postHogRow?.id),
  );

  // A source that has finally delivered real data gets its lifecycle recorded
  // once, so readiness and the audit log cannot disagree.
  await Promise.all(
    [...byProvider.values()].map((row) =>
      recordFirstDataReceived(
        db,
        workspaceId,
        row.id,
        row.provider,
        Number(row.metric_count ?? 0),
        row.last_synced_at ?? undefined,
      ),
    ),
  );

  return providerOrder.map((provider) => {
    const row = byProvider.get(provider);
    const metadata = providerMetadata[provider];
    const keywordMetricCount =
      provider === "appclimb-rank" ? Number(keywordCount?.total ?? 0) : null;
    const metricCount = keywordMetricCount ?? Number(row?.metric_count ?? 0);
    const isBuiltIn = provider === "appclimb-rank";
    const mappingStatus: PostHogMappingContractStatus | "not_required" =
      provider !== "posthog"
        ? "not_required"
        : postHogMapping
          ? postHogMappingContractStatus(postHogMapping)
          : row
            ? "automatic_unconfirmed"
            : "not_required";
    return {
      provider,
      label: metadata.label,
      status: isBuiltIn ? "connected" : (row?.status ?? "not-connected"),
      accessStatus: isBuiltIn
        ? metricCount > 0
          ? "verified"
          : "not_connected"
        : accessStatusFor(row),
      dataStatus: isBuiltIn
        ? metricCount > 0
          ? "ready"
          : "none"
        : dataStatusFor(row, metricCount),
      mappingStatus,
      accountLabel: row?.account_label ?? "",
      lastVerifiedAt: row?.last_verified_at ?? null,
      lastSyncAt: row?.last_synced_at ?? null,
      nextSyncAt: row?.next_sync_at ?? null,
      /** Same instant as nextSyncAt, named for the pending timeline copy. */
      nextCheckAt: row?.next_sync_at ?? null,
      firstDataAt: row?.first_data_at ?? null,
      freshnessHours: isBuiltIn ? null : freshnessHoursFor(row),
      lastErrorCode: row?.last_error_code ?? "",
      syncStatus: row?.sync_status ?? null,
      syncAttempt: row?.sync_attempt ?? 0,
      syncMaxAttempts: row?.sync_max_attempts ?? 0,
      metricCount,
      lastMetricAt: row?.last_metric_at ?? null,
      capabilities: metadata.capabilities,
      readOnly: true,
      ...(provider === "posthog" && postHogMapping
        ? { mapping: postHogMapping }
        : {}),
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
  const targetAppId =
    typeof credentials.targetAppId === "string"
      ? credentials.targetAppId.trim()
      : typeof credentials.appId === "string" && provider === "posthog"
        ? credentials.appId.trim()
        : "";
  let app = targetAppId
    ? await env.DB.prepare(
        "SELECT id FROM apps WHERE id = ? AND workspace_id = ?",
      )
        .bind(targetAppId, auth.workspaceId)
        .first<{ id: string }>()
    : null;
  if (!app) {
    app = await env.DB.prepare(
      "SELECT id FROM apps WHERE workspace_id = ? ORDER BY created_at LIMIT 1",
    )
      .bind(auth.workspaceId)
      .first<{ id: string }>();
  }
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
  if (verification.accountLabel && verification.accountLabel.trim()) {
    await env.DB.prepare(
      `UPDATE apps SET name = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND (name = 'My iOS App' OR name IS NULL OR name = '')`,
    )
      .bind(verification.accountLabel.trim(), now, app.id, auth.workspaceId)
      .run();
  }
  if (provider === "app-store-connect") {
    const appleAppId =
      typeof credentials.appId === "string" ? credentials.appId.trim() : "";
    await env.DB.prepare(
      `UPDATE apps
       SET name=?,apple_app_id=?,updated_at=?
       WHERE id=? AND workspace_id=?`,
    )
      .bind(
        verification.accountLabel ?? "My iOS App",
        appleAppId,
        now,
        app.id,
        auth.workspaceId,
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

  let connectionResult: Record<string, unknown> = {};
  if (provider === "posthog") {
    connectionResult = await establishPostHogMapping(
      env,
      auth,
      credentials,
      app.id,
      verification.accountLabel ?? "",
    );
  } else {
    const workspace = await workspaceFor(env.DB, auth.userId, auth.workspaceId);
    if (workspace && isEntitled(workspace)) {
      try {
        await queueSourceSync(env, auth, provider);
      } catch {
        // Ignored if sync queueing fails or job is already queued
      }
    }
  }

  return {
    provider,
    status: "connected",
    accountLabel: verification.accountLabel ?? "",
    lastVerifiedAt: verification.checkedAt,
    nextSyncAt: now,
    lastErrorCode: "",
    metricCount: 0,
    ...connectionResult,
  };
}

/**
 * Persist the initial PostHog mapping and describe what the connection result
 * screen must show (Task P0.18).
 *
 * The mapping starts `automatic_unconfirmed`: access is verified, but nothing
 * is trusted for a diagnosis until the user confirms the events. When the
 * project has no events at all the mapping is `insufficient_events` — the
 * connection stays valid and is never reported as failed (Task P0.22).
 */
async function establishPostHogMapping(
  env: Cloudflare.Env,
  auth: AuthContext,
  credentials: Record<string, unknown>,
  appId: string,
  projectLabel: string,
): Promise<Record<string, unknown>> {
  const connection = await env.DB.prepare(
    `SELECT id FROM source_connections
     WHERE workspace_id=? AND provider='posthog' LIMIT 1`,
  )
    .bind(auth.workspaceId)
    .first<{ id: string }>();
  if (!connection) return {};

  let events: PostHogEventOption[] = [];
  try {
    events = await discoverPostHogEvents(credentials, 30);
  } catch {
    // Access is already verified. A discovery failure means "we do not know
    // the event list yet", not "the connection failed".
    events = [];
  }
  const mapping = buildPostHogMapping(events, {
    mode: credentials.mappingMode === "manual" ? "manual" : "automatic",
    sessionEvent:
      typeof credentials.sessionEvent === "string"
        ? credentials.sessionEvent
        : undefined,
    activationEvent:
      typeof credentials.activationEvent === "string"
        ? credentials.activationEvent
        : undefined,
    milestoneEvents: credentials.eventFlow,
  });
  const projectId =
    typeof credentials.projectId === "string" ? credentials.projectId : "";
  await writePostHogMappingRow(
    env.DB,
    auth.workspaceId,
    connection.id,
    appId,
    projectId,
    projectLabel,
    mapping,
  );
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "source.posthog_mapping_generated",
    "source",
    "posthog",
    {
      status: mapping.status,
      mode: mapping.mode,
      confidence: mapping.confidence,
      detectedEventCount: mapping.detectedEventCount,
    },
  );
  const app = await env.DB.prepare(
    "SELECT id,name FROM apps WHERE id=? AND workspace_id=?",
  )
    .bind(appId, auth.workspaceId)
    .first<{ id: string; name: string }>();
  return {
    mapping,
    project: { id: projectId, label: projectLabel },
    boundApp: app ? { id: app.id, name: app.name } : null,
    events: postHogEventSummaries(events, mapping),
    activationWindowDays: DEFAULT_ACTIVATION_WINDOW_DAYS,
  };
}

/** Volume and last-seen context for every event the mapping references. */
function postHogEventSummaries(
  events: PostHogEventOption[],
  mapping: PostHogMapping,
): PostHogEventOption[] {
  const referenced = new Set(
    [
      mapping.sessionEvent,
      mapping.activationEvent,
      ...mapping.milestoneEvents.map((milestone) => milestone.event),
    ].filter((event): event is string => Boolean(event)),
  );
  return events.filter((event) => referenced.has(event.name));
}

async function openPostHogConnection(
  env: Cloudflare.Env,
  auth: AuthContext,
): Promise<{
  row: PostHogConnectionRow;
  credentials: Record<string, unknown>;
}> {
  const row = await env.DB.prepare(
    `SELECT id,app_id,credential_envelope,account_label
     FROM source_connections
     WHERE workspace_id=? AND provider='posthog'
       AND status IN ('connected','needs-attention')
     LIMIT 1`,
  )
    .bind(auth.workspaceId)
    .first<PostHogConnectionRow>();
  if (!row) {
    throw new ProviderError("source_not_connected", 404);
  }
  let envelope: CredentialEnvelope;
  try {
    envelope = JSON.parse(row.credential_envelope) as CredentialEnvelope;
  } catch {
    throw new ProviderError("invalid_credential_envelope", 500);
  }
  let credentials = await openCredentials(
    envelope,
    requireSecret(env, "ENVELOPE_MASTER_KEY"),
  );
  const refreshed = await refreshPostHogOAuth(credentials);
  credentials = refreshed.credentials;
  if (refreshed.changed) {
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
        row.id,
        auth.workspaceId,
      )
      .run();
  }
  return { row, credentials };
}

export interface PostHogMappingView {
  events: PostHogEventOption[];
  activationEvent: string;
  sessionEvent: string;
  windowDays: number;
  mapping: PostHogMapping;
  project: { id: string; label: string };
  boundApp: { id: string; name: string } | null;
  activationWindowDays: number;
  /** Access is verified even when the project has no events yet. */
  accessVerified: boolean;
}

/**
 * Everything the mapping review screen needs: the live event list with volume
 * and last-seen time, the current lifecycle state, the bound product, and the
 * PostHog project the events came from.
 *
 * Reading also re-scores the stored mapping against what the project actually
 * emits today, so an event that disappeared becomes `invalid` instead of
 * silently reporting zero.
 */
export async function postHogEventOptions(
  env: Cloudflare.Env,
  auth: AuthContext,
): Promise<PostHogMappingView> {
  const { row, credentials } = await openPostHogConnection(env, auth);
  const events = await discoverPostHogEvents(credentials, 30);
  const stored = await readPostHogMappingRow(
    env.DB,
    auth.workspaceId,
    row.id,
  );
  const sessionEvent =
    typeof credentials.sessionEvent === "string"
      ? credentials.sessionEvent.trim()
      : "";
  const activationEvent =
    typeof credentials.activationEvent === "string"
      ? credentials.activationEvent.trim()
      : "";
  const mode: PostHogMappingMode =
    stored?.mode === "manual" || credentials.mappingMode === "manual"
      ? "manual"
      : "automatic";
  const mapping = buildPostHogMapping(events, {
    mode,
    sessionEvent,
    activationEvent,
    milestoneEvents: stored?.milestone_events
      ? safeParseMilestones(stored.milestone_events)
      : credentials.eventFlow,
    confirmedAt: stored?.confirmed_at ?? undefined,
  });
  const projectId =
    typeof credentials.projectId === "string" ? credentials.projectId : "";
  const projectLabel = stored?.project_label || row.account_label || projectId;
  await writePostHogMappingRow(
    env.DB,
    auth.workspaceId,
    row.id,
    row.app_id,
    projectId,
    projectLabel,
    mapping,
    stored?.activation_window_days || DEFAULT_ACTIVATION_WINDOW_DAYS,
  );
  const app = row.app_id
    ? await env.DB.prepare(
        "SELECT id,name FROM apps WHERE id=? AND workspace_id=?",
      )
        .bind(row.app_id, auth.workspaceId)
        .first<{ id: string; name: string }>()
    : null;
  return {
    events,
    activationEvent: mapping.activationEvent ?? "",
    sessionEvent: mapping.sessionEvent ?? "",
    windowDays: 30,
    mapping,
    project: { id: projectId, label: projectLabel },
    boundApp: app ? { id: app.id, name: app.name } : null,
    activationWindowDays:
      stored?.activation_window_days || DEFAULT_ACTIVATION_WINDOW_DAYS,
    accessVerified: true,
  };
}

function safeParseMilestones(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/**
 * Confirm or correct the mapping (Task P0.19).
 *
 * Submitting the events AppClimb picked confirms the automatic map; submitting
 * anything else records a manual map. Either way the mapping becomes
 * `confirmed`, the connection is rescheduled for an immediate import, and the
 * PostHog window is re-imported so stale metrics from the previous mapping are
 * replaced rather than mixed in.
 */
export async function updatePostHogEvents(
  env: Cloudflare.Env,
  auth: AuthContext,
  activationEvent: string,
  sessionEvent: string,
): Promise<{
  activationEvent: string;
  sessionEvent: string;
  nextSyncAt: string;
  mapping: PostHogMapping;
}> {
  const { row, credentials } = await openPostHogConnection(env, auth);
  const events = await discoverPostHogEvents(credentials, 30);
  const available = new Set(events.map((event) => event.name));
  if (!available.has(activationEvent) || !available.has(sessionEvent)) {
    throw new ProviderError("posthog_event_not_found", 422);
  }
  if (activationEvent === sessionEvent) {
    throw new ProviderError("posthog_event_conflict", 422);
  }
  const stored = await readPostHogMappingRow(env.DB, auth.workspaceId, row.id);
  const unchanged =
    stored?.activation_event === activationEvent &&
    stored?.session_event === sessionEvent;
  const mode: PostHogMappingMode =
    stored?.mode === "manual" || !unchanged ? "manual" : "automatic";
  const confirmedAt = nowISO();
  const mapping = buildPostHogMapping(events, {
    mode,
    sessionEvent,
    activationEvent,
    milestoneEvents: stored?.milestone_events
      ? safeParseMilestones(stored.milestone_events)
      : credentials.eventFlow,
    confirmedAt,
  });
  const nextCredentials = {
    ...credentials,
    activationEvent,
    sessionEvent,
    mappingMode: mode,
  };
  const sealed = await sealCredentials(
    nextCredentials,
    requireSecret(env, "ENVELOPE_MASTER_KEY"),
  );
  const updatedAt = nowISO();
  await env.DB.prepare(
    `UPDATE source_connections SET
       credential_envelope=?,
       status='connected',
       last_error_code=NULL,
       next_sync_at=?,
       updated_at=?
     WHERE id=? AND workspace_id=?`,
  )
    .bind(
      JSON.stringify(sealed),
      updatedAt,
      updatedAt,
      row.id,
      auth.workspaceId,
    )
    .run();
  await writePostHogMappingRow(
    env.DB,
    auth.workspaceId,
    row.id,
    row.app_id,
    typeof credentials.projectId === "string" ? credentials.projectId : "",
    stored?.project_label || row.account_label || "",
    mapping,
    stored?.activation_window_days || DEFAULT_ACTIVATION_WINDOW_DAYS,
  );
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "source.configuration_updated",
    "source",
    "posthog",
    { fields: ["activationEvent", "sessionEvent"] },
  );
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "source.posthog_mapping_confirmed",
    "source",
    "posthog",
    {
      mode: mapping.mode,
      status: mapping.status,
      confidence: mapping.confidence,
      replacedActivationEvent: stored?.activation_event ?? "",
      replacedSessionEvent: stored?.session_event ?? "",
    },
  );
  return { activationEvent, sessionEvent, nextSyncAt: updatedAt, mapping };
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

import type { DiagnosisMessage } from "./diagnosis/queue";

export interface SyncMessage {
  type: "source-sync";
  jobId: string;
  workspaceId: string;
  connectionId: string;
  provider: string;
}

export type QueueMessage = SyncMessage | DiagnosisMessage;


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
