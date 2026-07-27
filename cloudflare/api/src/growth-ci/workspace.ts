import { ensureGrowthContract, thresholdsFromRow } from "./contracts";
import { exportGrowthContractYaml } from "../release-impact/task-packet";
import { listAppReleases, getLatestReleaseCheck } from "./releases";
import type { AgentTaskRow, GrowthIncidentRow } from "./types";
import { computeMeasurementReadiness } from "./readiness";
import { assessGrowthCiAccess } from "./entitlement";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function growthCiWorkspaceSnapshot(
  db: D1Database,
  workspaceId: string,
  appId: string,
) {
  const app = await db
    .prepare(
      `SELECT id,name,bundle_id,icon_url,default_storefront,platform
       FROM apps WHERE id=? AND workspace_id=? LIMIT 1`,
    )
    .bind(appId, workspaceId)
    .first<{
      id: string;
      name: string;
      bundle_id: string | null;
      icon_url: string | null;
      default_storefront: string | null;
      platform: string | null;
    }>();
  if (!app) return null;

  const contractRow = await ensureGrowthContract(db, workspaceId, appId);
  const thresholds = thresholdsFromRow(contractRow);

  const sources = await db
    .prepare(
      `SELECT id,provider,status,last_synced_at,last_error_code,first_data_at
       FROM source_connections
       WHERE workspace_id=? AND app_id=?
         AND provider IN ('revenuecat','posthog','app-store-connect','superwall')
       ORDER BY provider`,
    )
    .bind(workspaceId, appId)
    .all();

  const mapping = await db
    .prepare(
      `SELECT status,mode,confidence,session_event,activation_event,
              version_property,build_property,version_property_status,
              version_property_confirmed_at,first_observed_version,
              last_observed_version,activation_window_days,confirmed_at,
              version_candidates
       FROM posthog_mappings
       WHERE workspace_id=? AND (app_id=? OR app_id IS NULL)
       ORDER BY CASE WHEN app_id=? THEN 0 ELSE 1 END
       LIMIT 1`,
    )
    .bind(workspaceId, appId, appId)
    .first();

  const releases = await listAppReleases(db, workspaceId, appId, 15);
  const history = [];
  for (const release of releases) {
    const check = await getLatestReleaseCheck(db, release.id);
    history.push({
      id: release.id,
      version: release.version,
      buildNumber: release.build_number,
      source: release.source,
      status: release.status,
      firstSeenAt: release.first_seen_at,
      reportedDeployedAt: release.reported_deployed_at,
      firstObservedLabel: "first observed in production",
      reportedDeployedLabel: release.reported_deployed_at
        ? "reported deployed at"
        : null,
      verdict: check?.verdict ?? null,
      confidenceScore: check?.confidence_score ?? null,
      confidenceLevel: check?.confidence_level ?? null,
      currentValue: check?.current_value ?? null,
      baselineValue: check?.baseline_value ?? null,
      currentSample: check?.current_sample ?? null,
      baselineSample: check?.baseline_sample ?? null,
      absoluteChange: check?.absolute_change ?? null,
      relativeChange: check?.relative_change ?? null,
      pValue: check?.p_value ?? null,
      limitations: parseJson<string[]>(check?.limitations, []),
      supportingSignals: parseJson<unknown[]>(check?.supporting_signals, []),
      evidence: parseJson<unknown[]>(check?.evidence, []),
      nextCheckAt: check?.next_check_at ?? null,
      checkStatus: check?.status ?? null,
      baselineMethod: check?.baseline_method ?? null,
    });
  }

  const latest = history[0] ?? null;

  const incident = await db
    .prepare(
      `SELECT * FROM growth_incidents
       WHERE workspace_id=? AND app_id=?
       ORDER BY
         CASE status
           WHEN 'open' THEN 0
           WHEN 'in_progress' THEN 1
           WHEN 'awaiting_verification' THEN 2
           ELSE 3
         END,
         opened_at DESC
       LIMIT 1`,
    )
    .bind(workspaceId, appId)
    .first<GrowthIncidentRow>();

  let task: AgentTaskRow | null = null;
  if (incident) {
    task = await db
      .prepare(`SELECT * FROM agent_tasks WHERE incident_id=? LIMIT 1`)
      .bind(incident.id)
      .first<AgentTaskRow>();
  }

  const sessionEvent =
    (mapping?.session_event as string) || contractRow.session_event || "";
  const activationEvent =
    (mapping?.activation_event as string) || contractRow.activation_event || "";
  const versionProperty =
    (mapping?.version_property as string) || contractRow.version_property || "";
  const versionPropertyStatus =
    (mapping?.version_property_status as string) ||
    contractRow.version_property_status ||
    "unconfirmed";

  const yaml = exportGrowthContractYaml({
    appId: app.id,
    sessionEvent,
    activationEvent,
    versionProperty,
    buildProperty:
      (mapping?.build_property as string) || contractRow.build_property,
    contract: thresholds,
  });

  const sourceList = sources.results ?? [];
  const revenueCat = sourceList.find((s) => s.provider === "revenuecat");
  const posthog = sourceList.find((s) => s.provider === "posthog");
  const readiness = computeMeasurementReadiness({
    revenueCatConnected: Boolean(revenueCat),
    revenueCatHasData: Boolean(
      revenueCat &&
        (revenueCat.first_data_at || revenueCat.last_synced_at),
    ),
    posthogConnected: Boolean(posthog),
    mappingStatus: (mapping?.status as string) ?? null,
    sessionEvent,
    activationEvent,
    versionProperty,
    versionPropertyStatus,
  });

  const workspaceRow = await db
    .prepare(
      `SELECT subscription_status, trial_ends_at, entitlement_ends_at
       FROM workspaces WHERE id=? LIMIT 1`,
    )
    .bind(workspaceId)
    .first<{
      subscription_status: string;
      trial_ends_at: string;
      entitlement_ends_at: string | null;
    }>();
  const access = assessGrowthCiAccess(
    {
      subscriptionStatus: workspaceRow?.subscription_status ?? "none",
      trialEndsAt:
        workspaceRow?.trial_ends_at ?? "1970-01-01T00:00:00.000Z",
      entitlementEndsAt: workspaceRow?.entitlement_ends_at ?? undefined,
    },
    contractRow.free_verdict_consumed_at,
  );

  let versionCandidates: unknown[] = [];
  try {
    const raw = mapping?.version_candidates;
    if (typeof raw === "string" && raw) {
      versionCandidates = JSON.parse(raw) as unknown[];
    }
  } catch {
    versionCandidates = [];
  }

  return {
    product: "growth_ci" as const,
    app: {
      id: app.id,
      name: app.name,
      bundleId: app.bundle_id,
      iconUrl: app.icon_url,
      storefront: app.default_storefront,
      platform: "ios" as const,
    },
    sources: sourceList.map((s) => ({
      id: s.id,
      provider: s.provider,
      status: s.status,
      lastSuccessAt: s.last_synced_at,
      lastErrorCode: s.last_error_code,
      firstDataAt: s.first_data_at,
    })),
    mapping: mapping
      ? {
          status: mapping.status,
          mode: mapping.mode,
          confidence: mapping.confidence,
          sessionEvent: mapping.session_event,
          activationEvent: mapping.activation_event,
          versionProperty: mapping.version_property,
          buildProperty: mapping.build_property,
          versionPropertyStatus: mapping.version_property_status,
          versionPropertyConfirmedAt: mapping.version_property_confirmed_at,
          firstObservedVersion: mapping.first_observed_version,
          lastObservedVersion: mapping.last_observed_version,
          activationWindowDays: mapping.activation_window_days,
          confirmedAt: mapping.confirmed_at,
          versionCandidates,
        }
      : {
          status: "not_connected",
          mode: "automatic",
          confidence: 0,
          sessionEvent: contractRow.session_event,
          activationEvent: contractRow.activation_event,
          versionProperty: contractRow.version_property,
          buildProperty: contractRow.build_property,
          versionPropertyStatus: contractRow.version_property_status,
          versionPropertyConfirmedAt: contractRow.version_property_confirmed_at,
          firstObservedVersion: contractRow.first_observed_version,
          lastObservedVersion: contractRow.last_observed_version,
          activationWindowDays: contractRow.activation_window_days,
          confirmedAt: null,
          versionCandidates: [],
        },
    readiness,
    access,
    contract: {
      version: contractRow.contract_version,
      thresholds,
      freeVerdictConsumedAt: contractRow.free_verdict_consumed_at,
      yaml,
    },
    latestRelease: latest,
    history,
    incident: incident
      ? {
          id: incident.id,
          title: incident.title,
          summary: incident.summary,
          severity: incident.severity,
          status: incident.status,
          outcome: incident.outcome,
          stageId: incident.stage_id,
          confidenceScore: incident.confidence_score,
          openedAt: incident.opened_at,
          closedAt: incident.closed_at,
          verificationContract: parseJson(incident.verification_contract, {}),
          learningRecord: parseJson(incident.learning_record, null),
          actionPlan: parseJson(incident.action_plan, {}),
        }
      : null,
    task: task
      ? {
          id: task.id,
          status: task.status,
          packet: parseJson(task.task_packet, {}),
          claimedBy: task.claimed_by,
          claimedAt: task.claimed_at,
          claimExpiresAt: task.claim_expires_at,
          branchName: task.branch_name,
          commitSha: task.commit_sha,
          pullRequestUrl: task.pull_request_url,
          submittedAt: task.submitted_at,
          deployedAt: task.deployed_at,
          closedAt: task.closed_at,
          fixReleaseId: task.fix_release_id,
        }
      : null,
  };
}

export async function dismissGrowthIncident(
  db: D1Database,
  workspaceId: string,
  appId: string,
  incidentId: string,
  reason: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE growth_incidents SET status='closed',outcome='dismissed',
       dismissal_reason=?,closed_at=?,updated_at=?
       WHERE id=? AND workspace_id=? AND app_id=?
         AND status IN ('open','in_progress','awaiting_verification')`,
    )
    .bind(reason.slice(0, 500), now, now, incidentId, workspaceId, appId)
    .run();
  if (result.meta.changes) {
    await db
      .prepare(
        `UPDATE agent_tasks SET status='canceled',closed_at=?,updated_at=?
         WHERE incident_id=? AND status IN ('available','claimed','submitted')`,
      )
      .bind(now, now, incidentId)
      .run();
  }
  return Boolean(result.meta.changes);
}
