import { nowISO, log } from "../runtime";
import { audit } from "../db";
import {
  RELEASE_COHORT_ACTIVATED_USERS,
  RELEASE_COHORT_NEW_USERS,
} from "../release-impact/config";
import type { CohortCounts } from "../release-impact/types";
import { ensureGrowthContract } from "./contracts";
import type { AppReleaseRow, ReleaseCheckMessage } from "./types";

function normalizeVersion(value: string): string {
  return value.trim().slice(0, 64);
}

function normalizeBuild(value: string): string {
  return value.trim().slice(0, 64);
}

export async function upsertAppRelease(
  db: D1Database,
  input: {
    workspaceId: string;
    appId: string;
    version: string;
    buildNumber?: string;
    source: "agent" | "posthog" | "manual";
    sourceTrust:
      | "verified_connector"
      | "signed_agent_observation"
      | "user_assertion";
    firstSeenAt: string;
    reportedDeployedAt?: string | null;
    commitSha?: string | null;
    previousCommitSha?: string | null;
    pullRequestUrl?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<AppReleaseRow> {
  const version = normalizeVersion(input.version);
  const buildNumber = normalizeBuild(input.buildNumber ?? "");
  if (!version) throw new Error("invalid_version");

  const existing = await db
    .prepare(
      `SELECT * FROM app_releases
       WHERE app_id=? AND version=? AND build_number=? LIMIT 1`,
    )
    .bind(input.appId, version, buildNumber)
    .first<AppReleaseRow>();

  if (existing) {
    const updatedAt = nowISO();
    await db
      .prepare(
        `UPDATE app_releases SET
          reported_deployed_at=COALESCE(?, reported_deployed_at),
          commit_sha=COALESCE(?, commit_sha),
          previous_commit_sha=COALESCE(?, previous_commit_sha),
          pull_request_url=COALESCE(?, pull_request_url),
          updated_at=?
         WHERE id=? AND workspace_id=?`,
      )
      .bind(
        input.reportedDeployedAt ?? null,
        input.commitSha ?? null,
        input.previousCommitSha ?? null,
        input.pullRequestUrl ?? null,
        updatedAt,
        existing.id,
        input.workspaceId,
      )
      .run();
    return (
      (await db
        .prepare(`SELECT * FROM app_releases WHERE id=?`)
        .bind(existing.id)
        .first<AppReleaseRow>()) ?? existing
    );
  }

  // Link previous release by first_seen_at
  const previous = await db
    .prepare(
      `SELECT id FROM app_releases
       WHERE workspace_id=? AND app_id=? AND first_seen_at < ?
       ORDER BY first_seen_at DESC LIMIT 1`,
    )
    .bind(input.workspaceId, input.appId, input.firstSeenAt)
    .first<{ id: string }>();

  const id = crypto.randomUUID();
  const createdAt = nowISO();
  await db
    .prepare(
      `INSERT INTO app_releases(
        id,workspace_id,app_id,version,build_number,source,source_trust,status,
        first_seen_at,reported_deployed_at,previous_release_id,
        commit_sha,previous_commit_sha,pull_request_url,metadata,
        created_at,updated_at
      ) VALUES (?,?,?,?,?,?,?,'observed',?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      input.workspaceId,
      input.appId,
      version,
      buildNumber,
      input.source,
      input.sourceTrust,
      input.firstSeenAt,
      input.reportedDeployedAt ?? null,
      previous?.id ?? null,
      input.commitSha ?? null,
      input.previousCommitSha ?? null,
      input.pullRequestUrl ?? null,
      JSON.stringify(input.metadata ?? {}),
      createdAt,
      createdAt,
    )
    .run();

  // Supersede older evaluated releases when a newer one arrives
  if (previous?.id) {
    await db
      .prepare(
        `UPDATE app_releases SET status='superseded', updated_at=?
         WHERE id=? AND workspace_id=? AND status='evaluated'`,
      )
      .bind(createdAt, previous.id, input.workspaceId)
      .run();
  }

  log("info", "release_detected", {
    releaseId: id,
    appId: input.appId,
    version,
    buildNumber,
    source: input.source,
  });

  return (await db
    .prepare(`SELECT * FROM app_releases WHERE id=?`)
    .bind(id)
    .first<AppReleaseRow>())!;
}

export type ManualReleaseReportInput = {
  workspaceId: string;
  userId: string;
  appId: string;
  version: string;
  buildNumber?: string;
  reportedDeployedAt?: string | null;
  commitSha?: string | null;
  pullRequestUrl?: string | null;
  taskId?: string | null;
};

export type ManualReleaseReportResult =
  | { ok: true; releaseId: string; checkId: string; taskLinked: boolean }
  | {
      ok: false;
      code: "app_not_found" | "task_not_found" | "task_not_active";
    };

/**
 * Lets an owner/admin report a production release without an Agent Bridge
 * token. The release remains a user assertion; the verdict still comes only
 * from the normal PostHog cohort check.
 */
export async function reportManualRelease(
  env: Cloudflare.Env,
  input: ManualReleaseReportInput,
): Promise<ManualReleaseReportResult> {
  const app = await env.DB.prepare(
    `SELECT id FROM apps WHERE id=? AND workspace_id=? AND platform='iOS' LIMIT 1`,
  )
    .bind(input.appId, input.workspaceId)
    .first<{ id: string }>();
  if (!app) return { ok: false, code: "app_not_found" };

  const taskId = input.taskId?.trim() || null;
  let task: { id: string; incident_id: string; status: string } | null = null;
  if (taskId) {
    task = await env.DB.prepare(
      `SELECT id,incident_id,status FROM agent_tasks
       WHERE id=? AND workspace_id=? AND app_id=? LIMIT 1`,
    )
      .bind(taskId, input.workspaceId, input.appId)
      .first<{ id: string; incident_id: string; status: string }>();
    if (!task) return { ok: false, code: "task_not_found" };
    if (["closed", "canceled"].includes(task.status)) {
      return { ok: false, code: "task_not_active" };
    }
  }

  const reportedAt =
    input.reportedDeployedAt && Number.isFinite(Date.parse(input.reportedDeployedAt))
      ? new Date(input.reportedDeployedAt).toISOString()
      : nowISO();
  const release = await upsertAppRelease(env.DB, {
    workspaceId: input.workspaceId,
    appId: input.appId,
    version: input.version,
    buildNumber: input.buildNumber,
    source: "manual",
    sourceTrust: "user_assertion",
    firstSeenAt: reportedAt,
    reportedDeployedAt: reportedAt,
    commitSha: input.commitSha ?? null,
    pullRequestUrl: input.pullRequestUrl ?? null,
  });

  if (task) {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE agent_tasks SET status='deployed',fix_release_id=?,deployed_at=?,
         commit_sha=COALESCE(?,commit_sha),pull_request_url=COALESCE(?,pull_request_url),
         updated_at=?
         WHERE id=? AND workspace_id=? AND app_id=?
           AND status IN ('available','claimed','submitted','deployed')`,
      ).bind(
        release.id,
        reportedAt,
        input.commitSha ?? null,
        input.pullRequestUrl ?? null,
        reportedAt,
        task.id,
        input.workspaceId,
        input.appId,
      ),
      env.DB.prepare(
        `UPDATE growth_incidents SET status='awaiting_verification',fix_release_id=?,updated_at=?
         WHERE id=? AND workspace_id=? AND app_id=?
           AND status IN ('open','in_progress','awaiting_verification')`,
      ).bind(
        release.id,
        reportedAt,
        task.incident_id,
        input.workspaceId,
        input.appId,
      ),
    ]);
  }

  const checkId = await queueReleaseCheck(
    env,
    release,
    await releaseInputHash(release, null),
  );
  if (!checkId) {
    throw new Error("release_check_not_queued");
  }

  await audit(
    env.DB,
    input.workspaceId,
    input.userId,
    "manual_release.reported",
    "app_release",
    release.id,
    { appId: input.appId, taskId, version: release.version },
  );

  return {
    ok: true,
    releaseId: release.id,
    checkId,
    taskLinked: Boolean(task),
  };
}

export async function queueReleaseCheck(
  env: Cloudflare.Env,
  release: AppReleaseRow,
  inputHash: string,
  runAfter?: string,
): Promise<string | null> {
  const existing = await env.DB.prepare(
    `SELECT id,status FROM release_checks
     WHERE release_id=? AND input_hash=? LIMIT 1`,
  )
    .bind(release.id, inputHash)
    .first<{ id: string; status: string }>();
  if (existing) {
    if (["queued", "running", "collecting"].includes(existing.status)) {
      return existing.id;
    }
    // Succeeded/failed with same hash — do not duplicate
    if (existing.status === "succeeded") return existing.id;
  }

  const contract = await ensureGrowthContract(
    env.DB,
    release.workspace_id,
    release.app_id,
  );
  const id = crypto.randomUUID();
  const createdAt = nowISO();
  const when = runAfter ?? createdAt;
  await env.DB.prepare(
    `INSERT INTO release_checks(
      id,workspace_id,app_id,release_id,status,verdict,
      attempt,max_attempts,run_after,input_hash,contract_version,
      created_at,updated_at
    ) VALUES (?,?,?,?,'queued','collecting',0,5,?,?,?,?,?)`,
  )
    .bind(
      id,
      release.workspace_id,
      release.app_id,
      release.id,
      when,
      inputHash,
      contract.contract_version,
      createdAt,
      createdAt,
    )
    .run();

  const message: ReleaseCheckMessage = {
    type: "release-check",
    checkId: id,
    workspaceId: release.workspace_id,
    appId: release.app_id,
    releaseId: release.id,
    queuedAt: createdAt,
  };
  try {
    await env.SYNC_QUEUE.send(message);
  } catch (error) {
    log("warn", "release_check_enqueue_failed", {
      checkId: id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
  return id;
}

export function parseCohortDimensions(
  dimensions: string | Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!dimensions) return {};
  let parsed: unknown = dimensions;
  if (typeof dimensions === "string") {
    try {
      parsed = JSON.parse(dimensions);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (typeof value === "string") result[key] = value.slice(0, 200);
    else if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = String(value);
    }
  }
  return result;
}

export async function loadReleaseCohorts(
  db: D1Database,
  workspaceId: string,
  appId: string,
): Promise<CohortCounts[]> {
  const rows = await db
    .prepare(
      `SELECT metric_key,value,occurred_at,dimensions
       FROM metric_points
       WHERE workspace_id=? AND app_id=?
         AND metric_key IN (?,?)
       ORDER BY occurred_at DESC
       LIMIT 500`,
    )
    .bind(
      workspaceId,
      appId,
      RELEASE_COHORT_NEW_USERS,
      RELEASE_COHORT_ACTIVATED_USERS,
    )
    .all<{
      metric_key: string;
      value: number;
      occurred_at: string;
      dimensions: string | null;
    }>();

  type Acc = {
    newUsers: number | null;
    activatedUsers: number | null;
    dimensions: Record<string, string>;
    occurredAt: string;
  };
  const byKey = new Map<string, Acc>();

  for (const row of rows.results ?? []) {
    const dims = parseCohortDimensions(row.dimensions);
    const version = dims.version ?? "";
    if (!version) continue;
    const build = dims.build ?? "";
    const key = `${version}\0${build}\0${dims.cohortStart ?? ""}\0${dims.sessionEvent ?? ""}\0${dims.activationEvent ?? ""}\0${dims.versionProperty ?? ""}`;
    const entry = byKey.get(key) ?? {
      newUsers: null,
      activatedUsers: null,
      dimensions: dims,
      occurredAt: row.occurred_at,
    };
    entry.dimensions = { ...entry.dimensions, ...dims };
    if (row.metric_key === RELEASE_COHORT_NEW_USERS) {
      entry.newUsers = Math.max(0, Math.trunc(Number(row.value) || 0));
    } else {
      entry.activatedUsers = Math.max(0, Math.trunc(Number(row.value) || 0));
    }
    byKey.set(key, entry);
  }

  const cohorts: CohortCounts[] = [];
  for (const entry of byKey.values()) {
    if (entry.newUsers === null) continue;
    const newUsers = entry.newUsers;
    const activatedUsers = Math.min(
      newUsers,
      entry.activatedUsers ?? 0,
    );
    const windowDays = Number(entry.dimensions.activationWindowDays);
    cohorts.push({
      version: entry.dimensions.version,
      buildNumber: entry.dimensions.build ?? "",
      newUsers,
      activatedUsers,
      activationRate: newUsers > 0 ? activatedUsers / newUsers : null,
      cohortStart: entry.dimensions.cohortStart || null,
      cohortEnd: entry.dimensions.cohortEnd || null,
      activationWindowDays:
        Number.isFinite(windowDays) && windowDays > 0
          ? Math.trunc(windowDays)
          : 7,
      sessionEvent: entry.dimensions.sessionEvent ?? "",
      activationEvent: entry.dimensions.activationEvent ?? "",
      versionProperty: entry.dimensions.versionProperty ?? "",
      firstSessionAt: entry.dimensions.firstSessionAt || null,
      lastSessionAt: entry.dimensions.lastSessionAt || null,
      completeDays: Number(entry.dimensions.completeDays) || 0,
      mappingConfirmed: entry.dimensions.mappingConfirmed === "true",
      evidenceIds: [
        `metric:${RELEASE_COHORT_NEW_USERS}:${entry.dimensions.version}`,
      ],
    });
  }

  // Prefer latest occurrence ordering already applied; sort by version recency proxy
  return cohorts;
}

export async function discoverReleasesFromCohorts(
  env: Cloudflare.Env,
  workspaceId: string,
  appId: string,
): Promise<number> {
  const cohorts = await loadReleaseCohorts(env.DB, workspaceId, appId);
  let created = 0;
  // Group by version+build, take earliest cohortStart as first seen
  const byRelease = new Map<string, CohortCounts>();
  for (const cohort of cohorts) {
    const key = `${cohort.version}\0${cohort.buildNumber}`;
    const existing = byRelease.get(key);
    if (!existing) {
      byRelease.set(key, cohort);
      continue;
    }
    if (
      cohort.cohortStart &&
      existing.cohortStart &&
      cohort.cohortStart < existing.cohortStart
    ) {
      byRelease.set(key, cohort);
    }
  }

  for (const cohort of byRelease.values()) {
    const release = await upsertAppRelease(env.DB, {
      workspaceId,
      appId,
      version: cohort.version,
      buildNumber: cohort.buildNumber,
      source: "posthog",
      sourceTrust: "verified_connector",
      firstSeenAt:
        cohort.firstSessionAt ||
        cohort.cohortStart ||
        nowISO(),
    });
    const inputHash = await releaseInputHash(release, cohort);
    await queueReleaseCheck(env, release, inputHash);
    created += 1;
  }
  return created;
}

export async function releaseInputHash(
  release: AppReleaseRow,
  cohort: CohortCounts | null,
): Promise<string> {
  const payload = JSON.stringify({
    releaseId: release.id,
    version: release.version,
    build: release.build_number,
    newUsers: cohort?.newUsers ?? null,
    activatedUsers: cohort?.activatedUsers ?? null,
    sessionEvent: cohort?.sessionEvent ?? null,
    activationEvent: cohort?.activationEvent ?? null,
    versionProperty: cohort?.versionProperty ?? null,
    mappingConfirmed: cohort?.mappingConfirmed ?? null,
  });
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function listAppReleases(
  db: D1Database,
  workspaceId: string,
  appId: string,
  limit = 20,
): Promise<AppReleaseRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM app_releases
       WHERE workspace_id=? AND app_id=?
       ORDER BY first_seen_at DESC
       LIMIT ?`,
    )
    .bind(workspaceId, appId, limit)
    .all<AppReleaseRow>();
  return result.results ?? [];
}

export async function getLatestReleaseCheck(
  db: D1Database,
  releaseId: string,
): Promise<import("./types").ReleaseCheckRow | null> {
  return db
    .prepare(
      `SELECT * FROM release_checks
       WHERE release_id=?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(releaseId)
    .first();
}
