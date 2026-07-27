import { nowISO, log } from "../runtime";
import { evaluateReleaseImpact } from "../release-impact/engine";
import { evaluateVerification } from "../release-impact/verification";
import { buildTaskPacket } from "../release-impact/task-packet";
import type { CohortCounts, SupportingSignal } from "../release-impact/types";
import { ensureGrowthContract, thresholdsFromRow } from "./contracts";
import {
  loadReleaseCohorts,
  releaseInputHash,
} from "./releases";
import type {
  AppReleaseRow,
  GrowthIncidentRow,
  ReleaseCheckMessage,
  ReleaseCheckRow,
} from "./types";

function jsonString(value: unknown): string {
  return JSON.stringify(value ?? null);
}

async function loadAppName(
  db: D1Database,
  workspaceId: string,
  appId: string,
): Promise<string> {
  const row = await db
    .prepare(
      `SELECT name FROM apps WHERE id=? AND workspace_id=? LIMIT 1`,
    )
    .bind(appId, workspaceId)
    .first<{ name: string }>();
  return row?.name ?? "iOS app";
}

function matchCohort(
  cohorts: CohortCounts[],
  release: AppReleaseRow,
): CohortCounts | null {
  return (
    cohorts.find(
      (c) =>
        c.version === release.version &&
        (c.buildNumber || "") === (release.build_number || ""),
    ) ??
    cohorts.find((c) => c.version === release.version) ??
    null
  );
}

async function loadSupportingSignals(
  db: D1Database,
  workspaceId: string,
  appId: string,
): Promise<SupportingSignal[]> {
  // RevenueCat time-series are supporting only — never causal release proof.
  const rows = await db
    .prepare(
      `SELECT metric_key,value,occurred_at
       FROM metric_points
       WHERE workspace_id=? AND app_id=?
         AND metric_key IN ('trial_to_paid','renewal_rate','trial_starts','new_paid_subscriptions')
       ORDER BY occurred_at DESC
       LIMIT 40`,
    )
    .bind(workspaceId, appId)
    .all<{ metric_key: string; value: number; occurred_at: string }>();

  const byKey = new Map<string, number[]>();
  for (const row of rows.results ?? []) {
    const list = byKey.get(row.metric_key) ?? [];
    if (list.length < 2) list.push(Number(row.value));
    byKey.set(row.metric_key, list);
  }

  const signals: SupportingSignal[] = [];
  for (const [key, values] of byKey) {
    if (values.length < 2) continue;
    const [currentValue, baselineValue] = values;
    const relativeChange =
      baselineValue === 0
        ? null
        : (currentValue - baselineValue) / Math.abs(baselineValue);
    let direction: SupportingSignal["direction"] = "neutral";
    if (relativeChange !== null && relativeChange <= -0.1) {
      direction = "supports_regression";
    } else if (relativeChange !== null && relativeChange >= 0.1) {
      direction = "supports_improvement";
    }
    signals.push({
      key: `revenuecat_${key}`,
      label: key,
      direction,
      baselineValue,
      currentValue,
      relativeChange,
      trust: "verified_connector",
      note:
        direction === "supports_regression"
          ? `${key} also declined after the release. This supports the regression, but does not establish release-level causality.`
          : `${key} change is temporally associated only.`,
    });
  }
  return signals;
}

async function openIncidentAndTask(
  env: Cloudflare.Env,
  release: AppReleaseRow,
  checkId: string,
  impact: ReturnType<typeof evaluateReleaseImpact>,
): Promise<void> {
  if (!impact.shouldOpenIncident) return;

  const open = await env.DB.prepare(
    `SELECT id FROM growth_incidents
     WHERE app_id=? AND status IN ('open','in_progress','awaiting_verification')
     LIMIT 1`,
  )
    .bind(release.app_id)
    .first<{ id: string }>();
  if (open) {
    log("info", "growth_incident_skipped_existing_open", {
      appId: release.app_id,
      existingId: open.id,
    });
    return;
  }

  const contract = await ensureGrowthContract(
    env.DB,
    release.workspace_id,
    release.app_id,
  );
  const thresholds = thresholdsFromRow(contract);
  const incidentId = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const createdAt = nowISO();
  const appName = await loadAppName(
    env.DB,
    release.workspace_id,
    release.app_id,
  );
  const originLabel = release.build_number
    ? `${release.version} (${release.build_number})`
    : release.version;

  const verificationContract = {
    primary_metric: impact.primaryMetricKey,
    minimum_new_users: thresholds.minimumNewUsers,
    success:
      "statistically significant improvement versus the broken release and recovery of at least 80% of the lost gap",
    maximum_wait_days: thresholds.maximumCollectionDays,
  };

  const packet = buildTaskPacket({
    taskId,
    incidentId,
    app: { id: release.app_id, name: appName, platform: "iOS" },
    originReleaseLabel: originLabel,
    impact,
    contract: thresholds,
    commitSha: release.commit_sha,
  });

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO growth_incidents(
          id,workspace_id,app_id,origin_release_id,origin_check_id,
          stage_id,title,summary,severity,status,primary_metric_key,
          confidence_score,evidence_ids,action_plan,verification_contract,
          opened_at,created_at,updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?,?)`,
      ).bind(
        incidentId,
        release.workspace_id,
        release.app_id,
        release.id,
        checkId,
        impact.stageId,
        impact.title.slice(0, 200),
        impact.summary.slice(0, 1000),
        impact.severity ?? "important",
        impact.primaryMetricKey,
        impact.confidenceScore,
        jsonString(impact.evidence.map((_, i) => `ev_${i}`)),
        jsonString({ steps: packet.instructions }),
        jsonString(verificationContract),
        createdAt,
        createdAt,
        createdAt,
      ),
      env.DB.prepare(
        `INSERT INTO agent_tasks(
          id,workspace_id,app_id,incident_id,status,task_packet,
          created_at,updated_at
        ) VALUES (?,?,?,?,'available',?,?,?)`,
      ).bind(
        taskId,
        release.workspace_id,
        release.app_id,
        incidentId,
        jsonString(packet),
        createdAt,
        createdAt,
      ),
    ]);
    log("info", "growth_incident_opened", {
      incidentId,
      taskId,
      appId: release.app_id,
      releaseId: release.id,
    });
  } catch (error) {
    // Unique open-incident index race
    log("warn", "growth_incident_create_race", {
      appId: release.app_id,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function processReleaseCheckMessage(
  env: Cloudflare.Env,
  message: ReleaseCheckMessage,
): Promise<{ retry: boolean }> {
  const claimedAt = nowISO();
  const claimed = await env.DB.prepare(
    `UPDATE release_checks SET status='running',locked_at=?,
     attempt=attempt+1,updated_at=?
     WHERE id=? AND workspace_id=? AND release_id=?
       AND status IN ('queued','collecting','failed')`,
  )
    .bind(
      claimedAt,
      claimedAt,
      message.checkId,
      message.workspaceId,
      message.releaseId,
    )
    .run();
  if (!claimed.meta.changes) {
    return { retry: false };
  }

  const check = await env.DB.prepare(
    `SELECT * FROM release_checks WHERE id=? AND workspace_id=?`,
  )
    .bind(message.checkId, message.workspaceId)
    .first<ReleaseCheckRow>();
  const release = await env.DB.prepare(
    `SELECT * FROM app_releases WHERE id=? AND workspace_id=?`,
  )
    .bind(message.releaseId, message.workspaceId)
    .first<AppReleaseRow>();

  if (!check || !release) {
    return { retry: false };
  }

  try {
    const contractRow = await ensureGrowthContract(
      env.DB,
      release.workspace_id,
      release.app_id,
    );
    const contract = thresholdsFromRow(contractRow);
    const mapping = await env.DB.prepare(
      `SELECT status,session_event,activation_event,version_property,
              version_property_status,version_property_confirmed_at
       FROM posthog_mappings
       WHERE workspace_id=? AND (app_id=? OR app_id IS NULL)
       ORDER BY CASE WHEN app_id=? THEN 0 ELSE 1 END
       LIMIT 1`,
    )
      .bind(release.workspace_id, release.app_id, release.app_id)
      .first<{
        status: string;
        session_event: string;
        activation_event: string;
        version_property: string;
        version_property_status: string;
        version_property_confirmed_at: string | null;
      }>();

    const sessionEvent =
      mapping?.session_event || contractRow.session_event || "";
    const activationEvent =
      mapping?.activation_event || contractRow.activation_event || "";
    const versionProperty =
      mapping?.version_property || contractRow.version_property || "";
    const mappingConfirmed =
      mapping?.status === "confirmed" || mapping?.status === "manual";
    const versionConfirmed =
      mapping?.version_property_status === "confirmed" ||
      contractRow.version_property_status === "confirmed";

    const cohorts = await loadReleaseCohorts(
      env.DB,
      release.workspace_id,
      release.app_id,
    );
    const current = matchCohort(cohorts, release);
    const baselineCandidates = cohorts.filter(
      (c) =>
        !(
          c.version === release.version &&
          (c.buildNumber || "") === (release.build_number || "")
        ),
    );
    const supportingSignals = await loadSupportingSignals(
      env.DB,
      release.workspace_id,
      release.app_id,
    );

    // Verification path for fix releases linked to open incidents
    const awaiting = await env.DB.prepare(
      `SELECT * FROM growth_incidents
       WHERE app_id=? AND status='awaiting_verification'
         AND fix_release_id=?
       LIMIT 1`,
    )
      .bind(release.app_id, release.id)
      .first<GrowthIncidentRow>();

    if (awaiting) {
      const originRelease = await env.DB.prepare(
        `SELECT * FROM app_releases WHERE id=?`,
      )
        .bind(awaiting.origin_release_id)
        .first<AppReleaseRow>();
      const originCohort = originRelease
        ? matchCohort(cohorts, originRelease)
        : null;
      const originCheck = await env.DB.prepare(
        `SELECT * FROM release_checks WHERE id=?`,
      )
        .bind(awaiting.origin_check_id)
        .first<ReleaseCheckRow>();

      const verification = evaluateVerification({
        origin:
          originCohort ??
          ({
            version: originRelease?.version ?? "unknown",
            buildNumber: originRelease?.build_number ?? "",
            newUsers: originCheck?.current_sample ?? 0,
            activatedUsers: Math.round(
              (originCheck?.current_value ?? 0) *
                (originCheck?.current_sample ?? 0),
            ),
            activationRate: originCheck?.current_value ?? null,
            cohortStart: null,
            cohortEnd: null,
            activationWindowDays: contract.activationWindowDays,
            sessionEvent,
            activationEvent,
            versionProperty,
            firstSessionAt: null,
            lastSessionAt: null,
            completeDays: 0,
            mappingConfirmed,
            evidenceIds: [],
          } satisfies CohortCounts),
        baseline: null,
        fix: current,
        originRate: originCheck?.current_value ?? originCohort?.activationRate ?? 0,
        baselineRate: originCheck?.baseline_value ?? null,
        contract,
        supportingSignals,
        now: nowISO(),
        fixFirstSeenAt: release.first_seen_at,
        maximumWaitDays: contract.maximumCollectionDays,
      });

      const completedAt = nowISO();
      if (verification.outcome === "collecting") {
        await env.DB.prepare(
          `UPDATE release_checks SET status='collecting',verdict='collecting',
           locked_at=NULL,current_sample=?,current_value=?,limitations=?,
           next_check_at=?,run_after=?,updated_at=?
           WHERE id=?`,
        )
          .bind(
            verification.currentSample,
            verification.fixRate,
            jsonString(verification.limitations),
            verification.nextCheckAt,
            verification.nextCheckAt ?? completedAt,
            completedAt,
            check.id,
          )
          .run();
        return { retry: false };
      }

      await env.DB.batch([
        env.DB.prepare(
          `UPDATE release_checks SET status='succeeded',verdict=?,
           locked_at=NULL,current_value=?,current_sample=?,p_value=?,
           confidence_score=?,confidence_level=?,limitations=?,
           completed_at=?,updated_at=?,primary_metric_key='activation_rate'
           WHERE id=?`,
        ).bind(
          verification.outcome === "worsened" ? "regression" : "improvement",
          verification.fixRate,
          verification.currentSample,
          verification.pValueVsOrigin,
          verification.confidenceScore,
          verification.confidenceLevel,
          jsonString(verification.limitations),
          completedAt,
          completedAt,
          check.id,
        ),
        env.DB.prepare(
          `UPDATE growth_incidents SET status='closed',outcome=?,
           verification_check_id=?,learning_record=?,closed_at=?,updated_at=?
           WHERE id=?`,
        ).bind(
          verification.outcome,
          check.id,
          jsonString({
            originReleaseId: awaiting.origin_release_id,
            fixReleaseId: release.id,
            summary: verification.summary,
            fixRate: verification.fixRate,
            originRate: verification.originRate,
            baselineRate: verification.baselineRate,
            recoveryRatio: verification.recoveryRatio,
            limitations: verification.limitations,
          }),
          completedAt,
          completedAt,
          awaiting.id,
        ),
        env.DB.prepare(
          `UPDATE agent_tasks SET status='closed',closed_at=?,updated_at=?,
           fix_release_id=?
           WHERE incident_id=? AND status != 'canceled'`,
        ).bind(completedAt, completedAt, release.id, awaiting.id),
        env.DB.prepare(
          `UPDATE app_releases SET status='evaluated',updated_at=? WHERE id=?`,
        ).bind(completedAt, release.id),
      ]);
      log("info", "verification_completed", {
        incidentId: awaiting.id,
        outcome: verification.outcome,
        releaseId: release.id,
      });
      return { retry: false };
    }

    const impact = evaluateReleaseImpact({
      release: {
        id: release.id,
        version: release.version,
        buildNumber: release.build_number,
        firstSeenAt: release.first_seen_at,
        source: release.source as "agent" | "posthog" | "manual",
        sourceTrust: release.source_trust as
          | "verified_connector"
          | "signed_agent_observation"
          | "user_assertion",
      },
      current,
      baselineCandidates,
      supportingSignals,
      contract,
      mapping: {
        sessionEvent,
        activationEvent,
        versionProperty,
        versionPropertyConfirmed: versionConfirmed,
        mappingConfirmed,
      },
      now: nowISO(),
      dataFreshnessHours: 6,
    });

    const completedAt = nowISO();
    if (impact.verdict === "collecting") {
      await env.DB.prepare(
        `UPDATE release_checks SET
          status='collecting',verdict='collecting',locked_at=NULL,
          primary_metric_key=?,baseline_method=?,baseline_value=?,
          current_value=?,absolute_change=?,relative_change=?,
          baseline_sample=?,current_sample=?,p_value=?,
          confidence_score=?,confidence_level=?,
          evidence=?,supporting_signals=?,limitations=?,
          missing_requirements=?,next_check_at=?,run_after=?,
          updated_at=?
         WHERE id=?`,
      )
        .bind(
          impact.primaryMetricKey,
          impact.baselineMethod,
          impact.baselineValue,
          impact.currentValue,
          impact.absoluteChange,
          impact.relativeChange,
          impact.baselineSample,
          impact.currentSample,
          impact.pValue,
          impact.confidenceScore,
          impact.confidenceLevel,
          jsonString(impact.evidence),
          jsonString(impact.supportingSignals),
          jsonString(impact.limitations),
          jsonString(impact.missingRequirements),
          impact.nextCheckAt,
          impact.nextCheckAt ?? completedAt,
          completedAt,
          check.id,
        )
        .run();
      await env.DB.prepare(
        `UPDATE app_releases SET status='collecting',updated_at=? WHERE id=?`,
      )
        .bind(completedAt, release.id)
        .run();
      return { retry: false };
    }

    await env.DB.prepare(
      `UPDATE release_checks SET
        status='succeeded',verdict=?,locked_at=NULL,
        primary_metric_key=?,baseline_method=?,baseline_value=?,
        current_value=?,absolute_change=?,relative_change=?,
        baseline_sample=?,current_sample=?,p_value=?,
        confidence_score=?,confidence_level=?,
        evidence=?,supporting_signals=?,limitations=?,
        missing_requirements=?,next_check_at=NULL,completed_at=?,
        updated_at=?
       WHERE id=?`,
    )
      .bind(
        impact.verdict,
        impact.primaryMetricKey,
        impact.baselineMethod,
        impact.baselineValue,
        impact.currentValue,
        impact.absoluteChange,
        impact.relativeChange,
        impact.baselineSample,
        impact.currentSample,
        impact.pValue,
        impact.confidenceScore,
        impact.confidenceLevel,
        jsonString(impact.evidence),
        jsonString(impact.supportingSignals),
        jsonString(impact.limitations),
        jsonString(impact.missingRequirements),
        completedAt,
        completedAt,
        check.id,
      )
      .run();

    await env.DB.prepare(
      `UPDATE app_releases SET status='evaluated',updated_at=? WHERE id=?`,
    )
      .bind(completedAt, release.id)
      .run();

    await openIncidentAndTask(env, release, check.id, impact);

    // Mark free first verdict consumed when a non-collecting terminal verdict lands
    if (
      ["healthy", "improvement", "regression", "inconclusive"].includes(
        impact.verdict,
      )
    ) {
      await env.DB.prepare(
        `UPDATE growth_contracts SET free_verdict_consumed_at=COALESCE(free_verdict_consumed_at, ?),
         updated_at=?
         WHERE workspace_id=? AND app_id=?`,
      )
        .bind(completedAt, completedAt, release.workspace_id, release.app_id)
        .run();
    }

    log("info", "release_verdict_completed", {
      checkId: check.id,
      releaseId: release.id,
      verdict: impact.verdict,
      shouldOpenIncident: impact.shouldOpenIncident,
    });
    return { retry: false };
  } catch (error) {
    const shouldRetry = check.attempt < check.max_attempts;
    const delay = Math.min(3600, 60 * 2 ** check.attempt);
    const runAfter = new Date(Date.now() + delay * 1000).toISOString();
    await env.DB.prepare(
      `UPDATE release_checks SET status=?,locked_at=NULL,error_code=?,
       run_after=?,updated_at=?
       WHERE id=?`,
    )
      .bind(
        shouldRetry ? "queued" : "failed",
        error instanceof Error ? error.message.slice(0, 80) : "check_failed",
        runAfter,
        nowISO(),
        check.id,
      )
      .run();
    log("error", "release_check_failed", {
      checkId: check.id,
      retry: shouldRetry,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { retry: shouldRetry };
  }
}

export async function queueDueReleaseChecks(env: Cloudflare.Env): Promise<number> {
  const now = nowISO();
  const due = await env.DB.prepare(
    `SELECT id,workspace_id,app_id,release_id FROM release_checks
     WHERE status IN ('queued','collecting') AND run_after <= ?
     ORDER BY run_after ASC
     LIMIT 50`,
  )
    .bind(now)
    .all<{
      id: string;
      workspace_id: string;
      app_id: string;
      release_id: string;
    }>();

  let queued = 0;
  for (const row of due.results ?? []) {
    const message: ReleaseCheckMessage = {
      type: "release-check",
      checkId: row.id,
      workspaceId: row.workspace_id,
      appId: row.app_id,
      releaseId: row.release_id,
      queuedAt: now,
    };
    try {
      await env.SYNC_QUEUE.send(message);
      queued += 1;
    } catch {
      // leave for next cron
    }
  }
  return queued;
}

export async function recoverStaleReleaseChecks(
  env: Cloudflare.Env,
): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    `UPDATE release_checks SET status='queued',locked_at=NULL,run_after=?,updated_at=?
     WHERE status='running' AND locked_at IS NOT NULL AND locked_at < ?`,
  )
    .bind(nowISO(), nowISO(), cutoff)
    .run();
  return result.meta.changes ?? 0;
}

export { releaseInputHash };
