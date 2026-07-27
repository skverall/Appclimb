import {
  base64UrlEncode,
  randomToken,
  sha256,
  timingSafeEqual,
} from "../crypto";
import { audit } from "../db";
import { nowISO, log } from "../runtime";
import { DEFAULT_GROWTH_CONTRACT } from "../release-impact/config";
import { upsertAppRelease, queueReleaseCheck, releaseInputHash } from "./releases";
import {
  AGENT_SCOPES,
  type AgentAuthContext,
  type AgentScope,
  type AgentTaskRow,
} from "./types";

const TOKEN_PREFIX_LEN = 12;
const MAX_BODY_KEYS = 24;
const MAX_STRING = 500;
const CLAIM_TIMEOUT_MS =
  DEFAULT_GROWTH_CONTRACT.claimTimeoutMinutes * 60 * 1000;

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createAgentToken(
  db: D1Database,
  input: {
    workspaceId: string;
    appId: string;
    name: string;
    scopes?: AgentScope[];
    createdByUserId: string;
    expiresAt?: string | null;
  },
): Promise<{ id: string; token: string; prefix: string; scopes: AgentScope[] }> {
  const raw = `acagt_${randomToken(32)}`;
  const tokenHash = hex(await sha256(raw));
  const prefix = raw.slice(0, TOKEN_PREFIX_LEN);
  const id = crypto.randomUUID();
  const scopes = (input.scopes?.length
    ? input.scopes
    : (["tasks:read", "tasks:write", "releases:write", "verdicts:read"] as AgentScope[])
  ).filter((s) => (AGENT_SCOPES as readonly string[]).includes(s));
  const createdAt = nowISO();
  await db
    .prepare(
      `INSERT INTO agent_tokens(
        id,workspace_id,app_id,name,token_prefix,token_hash,scopes,
        expires_at,created_by_user_id,created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      input.workspaceId,
      input.appId,
      input.name.trim().slice(0, 80) || "Agent token",
      prefix,
      tokenHash,
      JSON.stringify(scopes),
      input.expiresAt ?? null,
      input.createdByUserId,
      createdAt,
      createdAt,
    )
    .run();
  await audit(
    db,
    input.workspaceId,
    input.createdByUserId,
    "agent_token.created",
    "agent_token",
    id,
    { appId: input.appId, prefix, scopes },
  );
  return { id, token: raw, prefix, scopes };
}

export async function listAgentTokens(
  db: D1Database,
  workspaceId: string,
  appId?: string,
) {
  const result = appId
    ? await db
        .prepare(
          `SELECT id,app_id,name,token_prefix,scopes,expires_at,last_used_at,
                  revoked_at,created_at
           FROM agent_tokens
           WHERE workspace_id=? AND app_id=?
           ORDER BY created_at DESC`,
        )
        .bind(workspaceId, appId)
        .all()
    : await db
        .prepare(
          `SELECT id,app_id,name,token_prefix,scopes,expires_at,last_used_at,
                  revoked_at,created_at
           FROM agent_tokens
           WHERE workspace_id=?
           ORDER BY created_at DESC`,
        )
        .bind(workspaceId)
        .all();
  return (result.results ?? []).map((row) => ({
    id: row.id as string,
    appId: row.app_id as string,
    name: row.name as string,
    prefix: row.token_prefix as string,
    scopes: JSON.parse(String(row.scopes || "[]")) as string[],
    expiresAt: row.expires_at as string | null,
    lastUsedAt: row.last_used_at as string | null,
    revokedAt: row.revoked_at as string | null,
    createdAt: row.created_at as string,
  }));
}

export async function revokeAgentToken(
  db: D1Database,
  workspaceId: string,
  tokenId: string,
  actorUserId: string,
): Promise<boolean> {
  const updatedAt = nowISO();
  const result = await db
    .prepare(
      `UPDATE agent_tokens SET revoked_at=?,updated_at=?
       WHERE id=? AND workspace_id=? AND revoked_at IS NULL`,
    )
    .bind(updatedAt, updatedAt, tokenId, workspaceId)
    .run();
  if (result.meta.changes) {
    await audit(
      db,
      workspaceId,
      actorUserId,
      "agent_token.revoked",
      "agent_token",
      tokenId,
      {},
    );
  }
  return Boolean(result.meta.changes);
}

export async function authenticateAgentToken(
  db: D1Database,
  authorizationHeader: string | undefined,
): Promise<AgentAuthContext | null> {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  const raw = authorizationHeader.slice("Bearer ".length).trim();
  if (!raw.startsWith("acagt_") || raw.length < 20 || raw.length > 200) {
    return null;
  }
  const prefix = raw.slice(0, TOKEN_PREFIX_LEN);
  const row = await db
    .prepare(
      `SELECT id,workspace_id,app_id,name,token_hash,scopes,expires_at,revoked_at
       FROM agent_tokens WHERE token_prefix=? LIMIT 1`,
    )
    .bind(prefix)
    .first<{
      id: string;
      workspace_id: string;
      app_id: string;
      name: string;
      token_hash: string;
      scopes: string;
      expires_at: string | null;
      revoked_at: string | null;
    }>();
  if (!row || row.revoked_at) return null;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return null;

  const actual = await sha256(raw);
  const expectedHex = row.token_hash;
  const expected = new Uint8Array(
    expectedHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [],
  );
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  await db
    .prepare(`UPDATE agent_tokens SET last_used_at=?,updated_at=? WHERE id=?`)
    .bind(nowISO(), nowISO(), row.id)
    .run();

  let scopes: AgentScope[] = [];
  try {
    const parsed = JSON.parse(row.scopes) as unknown;
    if (Array.isArray(parsed)) {
      scopes = parsed.filter((s): s is AgentScope =>
        (AGENT_SCOPES as readonly string[]).includes(String(s)),
      );
    }
  } catch {
    scopes = [];
  }

  return {
    tokenId: row.id,
    workspaceId: row.workspace_id,
    appId: row.app_id,
    scopes,
    name: row.name,
  };
}

export function agentHasScope(
  auth: AgentAuthContext,
  scope: AgentScope,
): boolean {
  return auth.scopes.includes(scope);
}

export async function expireStaleClaims(db: D1Database, appId: string) {
  const now = nowISO();
  await db
    .prepare(
      `UPDATE agent_tasks SET status='available',claimed_by=NULL,
       claimed_token_id=NULL,claimed_at=NULL,claim_expires_at=NULL,updated_at=?
       WHERE app_id=? AND status='claimed'
         AND claim_expires_at IS NOT NULL AND claim_expires_at < ?`,
    )
    .bind(now, appId, now)
    .run();
}

export async function getAgentStatus(
  db: D1Database,
  auth: AgentAuthContext,
) {
  await expireStaleClaims(db, auth.appId);
  const app = await db
    .prepare(
      `SELECT id,name,bundle_id,icon_url FROM apps
       WHERE id=? AND workspace_id=? LIMIT 1`,
    )
    .bind(auth.appId, auth.workspaceId)
    .first<{
      id: string;
      name: string;
      bundle_id: string | null;
      icon_url: string | null;
    }>();
  if (!app) return null;

  const release = await db
    .prepare(
      `SELECT r.*, c.verdict, c.confidence_score, c.current_sample, c.next_check_at,
              c.limitations, c.summary_proxy
       FROM app_releases r
       LEFT JOIN (
         SELECT release_id,verdict,confidence_score,current_sample,next_check_at,
                limitations, created_at,
                '' as summary_proxy
         FROM release_checks
       ) c ON c.release_id = r.id
       WHERE r.workspace_id=? AND r.app_id=?
       ORDER BY r.first_seen_at DESC
       LIMIT 1`,
    )
    .bind(auth.workspaceId, auth.appId)
    .first();

  // Simpler latest release + latest check
  const latestRelease = await db
    .prepare(
      `SELECT * FROM app_releases
       WHERE workspace_id=? AND app_id=?
       ORDER BY first_seen_at DESC LIMIT 1`,
    )
    .bind(auth.workspaceId, auth.appId)
    .first();
  const latestCheck = latestRelease
    ? await db
        .prepare(
          `SELECT verdict,confidence_score,current_sample,baseline_sample,
                  current_value,baseline_value,absolute_change,relative_change,
                  limitations,next_check_at,status,completed_at
           FROM release_checks WHERE release_id=?
           ORDER BY created_at DESC LIMIT 1`,
        )
        .bind((latestRelease as { id: string }).id)
        .first()
    : null;

  const incident = await db
    .prepare(
      `SELECT id,title,status,severity,outcome,summary
       FROM growth_incidents
       WHERE workspace_id=? AND app_id=?
         AND status IN ('open','in_progress','awaiting_verification')
       LIMIT 1`,
    )
    .bind(auth.workspaceId, auth.appId)
    .first();

  const task = await db
    .prepare(
      `SELECT id,status,claimed_by,claim_expires_at,branch_name,commit_sha
       FROM agent_tasks
       WHERE workspace_id=? AND app_id=?
         AND status IN ('available','claimed','submitted','deployed')
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(auth.workspaceId, auth.appId)
    .first();

  const sources = await db
    .prepare(
      `SELECT provider,status,last_synced_at
       FROM source_connections
       WHERE workspace_id=? AND app_id=? AND provider IN ('revenuecat','posthog')`,
    )
    .bind(auth.workspaceId, auth.appId)
    .all();

  return {
    app: {
      id: app.id,
      name: app.name,
      platform: "iOS" as const,
      bundleId: app.bundle_id,
    },
    release: latestRelease
      ? {
          id: (latestRelease as { id: string }).id,
          version: (latestRelease as { version: string }).version,
          buildNumber: (latestRelease as { build_number: string }).build_number,
          firstSeenAt: (latestRelease as { first_seen_at: string }).first_seen_at,
          // Never call first_seen_at "App Store publication"
          firstObservedLabel: "first observed in production",
          status: (latestRelease as { status: string }).status,
        }
      : null,
    verdict: latestCheck
      ? {
          verdict: latestCheck.verdict,
          confidenceScore: latestCheck.confidence_score,
          currentSample: latestCheck.current_sample,
          baselineSample: latestCheck.baseline_sample,
          currentValue: latestCheck.current_value,
          baselineValue: latestCheck.baseline_value,
          absoluteChange: latestCheck.absolute_change,
          relativeChange: latestCheck.relative_change,
          limitations: safeJsonArray(latestCheck.limitations as string),
          nextCheckAt: latestCheck.next_check_at,
          status: latestCheck.status,
        }
      : null,
    incident: incident
      ? {
          id: incident.id,
          title: incident.title,
          status: incident.status,
          severity: incident.severity,
          outcome: incident.outcome,
          summary: incident.summary,
        }
      : null,
    task: task
      ? {
          id: task.id,
          status: task.status,
          claimedBy: task.claimed_by,
          claimExpiresAt: task.claim_expires_at,
          branchName: task.branch_name,
          commitSha: task.commit_sha,
        }
      : null,
    sources: (sources.results ?? []).map((s) => ({
      provider: s.provider,
      status: s.status,
      lastSuccessAt: s.last_synced_at,
    })),
    // Explicit: no credentials, no raw rows
  };
}

function safeJsonArray(value: string | null | undefined): unknown[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function getNextAgentTask(
  db: D1Database,
  auth: AgentAuthContext,
): Promise<Record<string, unknown> | null> {
  await expireStaleClaims(db, auth.appId);
  const row = await db
    .prepare(
      `SELECT * FROM agent_tasks
       WHERE workspace_id=? AND app_id=? AND status='available'
       ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(auth.workspaceId, auth.appId)
    .first<AgentTaskRow>();
  if (!row) return null;
  return {
    task_id: row.id,
    status: row.status,
    packet: safeJsonObject(row.task_packet),
  };
}

export async function claimAgentTask(
  db: D1Database,
  auth: AgentAuthContext,
  taskId: string,
  body: { agent?: string; agent_version?: string; workspace_hint?: string },
): Promise<{ ok: true; task: AgentTaskRow } | { ok: false; code: string }> {
  await expireStaleClaims(db, auth.appId);
  const claimedAt = nowISO();
  const expiresAt = new Date(Date.now() + CLAIM_TIMEOUT_MS).toISOString();
  const agent = String(body.agent ?? "agent").slice(0, 80);
  const result = await db
    .prepare(
      `UPDATE agent_tasks SET status='claimed',claimed_by=?,claimed_token_id=?,
       claimed_at=?,claim_expires_at=?,updated_at=?
       WHERE id=? AND workspace_id=? AND app_id=? AND status='available'`,
    )
    .bind(
      agent,
      auth.tokenId,
      claimedAt,
      expiresAt,
      claimedAt,
      taskId,
      auth.workspaceId,
      auth.appId,
    )
    .run();
  if (!result.meta.changes) {
    return { ok: false, code: "task_not_available" };
  }
  await db
    .prepare(
      `UPDATE growth_incidents SET status='in_progress',updated_at=?
       WHERE id=(SELECT incident_id FROM agent_tasks WHERE id=?)
         AND status='open'`,
    )
    .bind(claimedAt, taskId)
    .run();
  await audit(
    db,
    auth.workspaceId,
    null,
    "agent_task.claimed",
    "agent_task",
    taskId,
    { agent, tokenId: auth.tokenId },
  );
  const task = await db
    .prepare(`SELECT * FROM agent_tasks WHERE id=?`)
    .bind(taskId)
    .first<AgentTaskRow>();
  return { ok: true, task: task! };
}

function sanitizeEventPayload(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>).slice(
    0,
    MAX_BODY_KEYS,
  )) {
    if (!key || key.length > 40) continue;
    // Never accept credential-like keys
    if (/(secret|token|password|api[_-]?key|credential)/iu.test(key)) continue;
    if (typeof value === "string") result[key] = value.trim().slice(0, MAX_STRING);
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "boolean") result[key] = value;
  }
  return result;
}

const ALLOWED_EVENTS = new Set([
  "work_started",
  "blocked",
  "change_submitted",
  "tests_completed",
  "deployment_reported",
  "note",
]);

export async function reportAgentTaskEvent(
  env: Cloudflare.Env,
  auth: AgentAuthContext,
  taskId: string,
  idempotencyKey: string,
  body: {
    event_type?: string;
    payload?: unknown;
    occurred_at?: string;
  },
): Promise<{ ok: true } | { ok: false; code: string; status: number }> {
  if (!idempotencyKey || idempotencyKey.length > 120) {
    return { ok: false, code: "invalid_idempotency_key", status: 400 };
  }
  const eventType = String(body.event_type ?? "");
  if (!ALLOWED_EVENTS.has(eventType)) {
    return { ok: false, code: "invalid_event_type", status: 400 };
  }

  const task = await env.DB.prepare(
    `SELECT * FROM agent_tasks WHERE id=? AND workspace_id=? AND app_id=?`,
  )
    .bind(taskId, auth.workspaceId, auth.appId)
    .first<AgentTaskRow>();
  if (!task) return { ok: false, code: "not_found", status: 404 };

  const existing = await env.DB.prepare(
    `SELECT id FROM agent_task_events WHERE task_id=? AND idempotency_key=?`,
  )
    .bind(taskId, idempotencyKey)
    .first();
  if (existing) return { ok: true };

  const payload = sanitizeEventPayload(body.payload);
  const occurredAt =
    typeof body.occurred_at === "string" && Date.parse(body.occurred_at)
      ? new Date(body.occurred_at).toISOString()
      : nowISO();
  const createdAt = nowISO();
  const eventId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO agent_task_events(
      id,workspace_id,app_id,task_id,event_type,idempotency_key,
      actor_type,actor_id,payload,occurred_at,created_at
    ) VALUES (?,?,?,?,?,?,'agent',?,?,?,?)`,
  )
    .bind(
      eventId,
      auth.workspaceId,
      auth.appId,
      taskId,
      eventType,
      idempotencyKey,
      auth.tokenId,
      JSON.stringify(payload),
      occurredAt,
      createdAt,
    )
    .run();

  if (eventType === "change_submitted") {
    const branch =
      typeof payload.branch_name === "string" ? payload.branch_name.slice(0, 200) : null;
    const commit =
      typeof payload.commit_sha === "string" &&
      /^[0-9a-f]{7,40}$/iu.test(payload.commit_sha)
        ? payload.commit_sha.toLowerCase()
        : null;
    const pr =
      typeof payload.pull_request_url === "string" &&
      /^https:\/\//u.test(payload.pull_request_url)
        ? payload.pull_request_url.slice(0, 500)
        : null;
    await env.DB.prepare(
      `UPDATE agent_tasks SET status='submitted',branch_name=COALESCE(?,branch_name),
       commit_sha=COALESCE(?,commit_sha),pull_request_url=COALESCE(?,pull_request_url),
       submitted_at=?,updated_at=?
       WHERE id=? AND status IN ('claimed','submitted')`,
    )
      .bind(branch, commit, pr, createdAt, createdAt, taskId)
      .run();
    await audit(
      env.DB,
      auth.workspaceId,
      null,
      "agent_task.change_submitted",
      "agent_task",
      taskId,
      { branch, commit },
    );
  }

  if (eventType === "deployment_reported") {
    await env.DB.prepare(
      `UPDATE agent_tasks SET status='deployed',deployed_at=?,updated_at=?
       WHERE id=? AND status IN ('submitted','claimed','deployed')`,
    )
      .bind(createdAt, createdAt, taskId)
      .run();
  }

  return { ok: true };
}

export async function reportAgentRelease(
  env: Cloudflare.Env,
  auth: AgentAuthContext,
  body: {
    version?: string;
    build_number?: string;
    reported_deployed_at?: string;
    commit_sha?: string;
    previous_commit_sha?: string;
    pull_request_url?: string;
    task_id?: string;
  },
): Promise<{ ok: true; releaseId: string } | { ok: false; code: string; status: number }> {
  const version = String(body.version ?? "").trim();
  if (!version || version.length > 64) {
    return { ok: false, code: "invalid_version", status: 400 };
  }
  const buildNumber = String(body.build_number ?? "").trim().slice(0, 64);
  const commitSha =
    typeof body.commit_sha === "string" && /^[0-9a-f]{7,40}$/iu.test(body.commit_sha)
      ? body.commit_sha.toLowerCase()
      : null;
  const previousCommitSha =
    typeof body.previous_commit_sha === "string" &&
    /^[0-9a-f]{7,40}$/iu.test(body.previous_commit_sha)
      ? body.previous_commit_sha.toLowerCase()
      : null;
  const pullRequestUrl =
    typeof body.pull_request_url === "string" &&
    /^https:\/\/github\.com\/[^\s]+$/iu.test(body.pull_request_url)
      ? body.pull_request_url.slice(0, 500)
      : typeof body.pull_request_url === "string" &&
          /^https:\/\//u.test(body.pull_request_url)
        ? body.pull_request_url.slice(0, 500)
        : null;
  const reportedDeployedAt =
    typeof body.reported_deployed_at === "string" &&
    Date.parse(body.reported_deployed_at)
      ? new Date(body.reported_deployed_at).toISOString()
      : nowISO();

  const release = await upsertAppRelease(env.DB, {
    workspaceId: auth.workspaceId,
    appId: auth.appId,
    version,
    buildNumber,
    source: "agent",
    sourceTrust: "signed_agent_observation",
    firstSeenAt: reportedDeployedAt,
    reportedDeployedAt,
    commitSha,
    previousCommitSha,
    pullRequestUrl,
  });

  if (body.task_id) {
    const task = await env.DB.prepare(
      `SELECT * FROM agent_tasks WHERE id=? AND workspace_id=? AND app_id=?`,
    )
      .bind(body.task_id, auth.workspaceId, auth.appId)
      .first<AgentTaskRow>();
    if (task) {
      const updatedAt = nowISO();
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE agent_tasks SET status='deployed',fix_release_id=?,
           deployed_at=?,commit_sha=COALESCE(?,commit_sha),
           pull_request_url=COALESCE(?,pull_request_url),updated_at=?
           WHERE id=?`,
        ).bind(
          release.id,
          updatedAt,
          commitSha,
          pullRequestUrl,
          updatedAt,
          task.id,
        ),
        env.DB.prepare(
          `UPDATE growth_incidents SET status='awaiting_verification',
           fix_release_id=?,updated_at=?
           WHERE id=? AND status IN ('open','in_progress','awaiting_verification')`,
        ).bind(release.id, updatedAt, task.incident_id),
      ]);
    }
  }

  const hash = await releaseInputHash(release, null);
  await queueReleaseCheck(env, release, hash);

  await audit(
    env.DB,
    auth.workspaceId,
    null,
    "agent_release.reported",
    "app_release",
    release.id,
    { version, buildNumber, taskId: body.task_id ?? null },
  );

  return { ok: true, releaseId: release.id };
}

export async function getTaskVerification(
  db: D1Database,
  auth: AgentAuthContext,
  taskId: string,
) {
  const task = await db
    .prepare(
      `SELECT * FROM agent_tasks WHERE id=? AND workspace_id=? AND app_id=?`,
    )
    .bind(taskId, auth.workspaceId, auth.appId)
    .first<AgentTaskRow>();
  if (!task) return null;

  const incident = await db
    .prepare(`SELECT * FROM growth_incidents WHERE id=?`)
    .bind(task.incident_id)
    .first();
  if (!incident) return null;

  let check = null;
  if (incident.verification_check_id) {
    check = await db
      .prepare(`SELECT * FROM release_checks WHERE id=?`)
      .bind(incident.verification_check_id)
      .first();
  } else if (task.fix_release_id) {
    check = await db
      .prepare(
        `SELECT * FROM release_checks WHERE release_id=?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(task.fix_release_id)
      .first();
  }

  return {
    task_id: task.id,
    task_status: task.status,
    incident_status: incident.status,
    outcome: incident.outcome,
    learning: safeJsonObject(incident.learning_record as string | null),
    check: check
      ? {
          verdict: (check as { verdict: string }).verdict,
          status: (check as { status: string }).status,
          currentValue: (check as { current_value: number | null }).current_value,
          currentSample: (check as { current_sample: number | null })
            .current_sample,
          limitations: safeJsonArray(
            (check as { limitations: string }).limitations,
          ),
          nextCheckAt: (check as { next_check_at: string | null }).next_check_at,
        }
      : null,
  };
}

// silence unused import warning if base64UrlEncode unused
void base64UrlEncode;
void log;
