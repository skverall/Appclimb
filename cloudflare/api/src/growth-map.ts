import { isFlagEnabled, rolloutFlagState } from "./diagnosis/flags";
import { getCurrentDiagnosis, getLatestDiagnosisRun } from "./diagnosis/persist";
import { deriveWorkspaceReadiness, type SourceStatusInfo } from "./diagnosis/readiness";
import { STAGE_DEFINITIONS, WEB_STAGE_DEFINITIONS } from "./diagnosis/stage-definitions";
import { isEntitled, workspaceFor } from "./db";
import { listSources } from "./sources";
import type { AuthContext } from "./types";
import type {
  ActionPlan,
  ComparisonType,
  DiagnosisSummary,
  GrowthStage,
  SourceProvider,
  StageHealth,
  StageId,
  WebGrowthStage,
  WebStageId,
} from "@/lib/contracts";

/**
 * The iOS funnel shape shown before a diagnosis exists.
 *
 * Sourced from the engine's own stage definitions so the API cannot drift from
 * what the engine actually classifies.
 */
const stageDefinitions = STAGE_DEFINITIONS.map((definition) => ({
  id: definition.id as StageId,
  label: definition.label,
  metricKey: definition.metricKey,
  source: definition.source as SourceProvider,
}));

const IOS_STAGE_IDS = new Set<string>(
  STAGE_DEFINITIONS.map((definition) => definition.id),
);
const WEB_STAGE_IDS = new Set<string>(
  WEB_STAGE_DEFINITIONS.map((definition) => definition.id),
);

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toString();
}

interface MetricRow {
  provider: string;
  metric_key: string;
  occurred_at: string;
  value: number;
  unit: string;
  completeness: number;
  dimensions: string;
}

function stageValues(metrics: MetricRow[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const definition of stageDefinitions) {
    const matching = metrics.filter(
      (metric) =>
        metric.metric_key === definition.metricKey &&
        metric.provider === definition.source,
    );
    const snapshots = matching.filter((metric) =>
      ["range_count", "range_ratio"].includes(metric.unit),
    );
    if (snapshots.length) {
      snapshots.sort(
        (left, right) =>
          new Date(right.occurred_at).getTime() -
          new Date(left.occurred_at).getTime(),
      );
      result.set(definition.metricKey, Number(snapshots[0].value));
    } else {
      result.set(
        definition.metricKey,
        matching.reduce((sum, metric) => sum + Number(metric.value), 0),
      );
    }
  }
  return result;
}

function confidence(metrics: MetricRow[], now: Date): {
  score: number;
  level: "high" | "medium" | "low";
} {
  if (!metrics.length) return { score: 0, level: "low" };
  const completeness =
    metrics.reduce((sum, metric) => sum + Number(metric.completeness), 0) /
    metrics.length;
  const latestBySeries = new Map<string, number>();
  for (const metric of metrics) {
    const key = `${metric.provider}\u0000${metric.metric_key}`;
    const value = new Date(metric.occurred_at).getTime();
    latestBySeries.set(key, Math.max(value, latestBySeries.get(key) ?? 0));
  }
  const averageFreshnessHours =
    [...latestBySeries.values()].reduce(
      (sum, timestamp) => sum + Math.max(0, now.getTime() - timestamp) / 3_600_000,
      0,
    ) / latestBySeries.size;
  const freshness = Math.max(0, 1 - averageFreshnessHours / 72);
  const score = Math.round(
    Math.max(0, Math.min(1, completeness * 0.72 + freshness * 0.28)) * 100,
  );
  return {
    score,
    level: score >= 80 ? "high" : score >= 55 ? "medium" : "low",
  };
}

function parseJSON<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const SOURCE_STATUSES = new Set(["connected", "needs-attention", "not-connected"]);

/**
 * Narrows a `listSources` row to the readiness input shape.
 *
 * `listSources` returns loosely typed rows, so each field is checked rather
 * than asserted: an unrecognised status is reported as not-connected instead of
 * being cast into the union and treated as live.
 */
function toSourceStatusInfo(row: Record<string, unknown>): SourceStatusInfo {
  const provider = String(row.provider ?? "") as SourceProvider;
  const rawStatus = String(row.status ?? "");
  return {
    provider,
    status: SOURCE_STATUSES.has(rawStatus)
      ? (rawStatus as SourceStatusInfo["status"])
      : "not-connected",
    lastErrorCode:
      typeof row.lastErrorCode === "string" ? row.lastErrorCode : null,
    metricCount: typeof row.metricCount === "number" ? row.metricCount : 0,
    lastMetricAt: typeof row.lastMetricAt === "string" ? row.lastMetricAt : null,
  };
}

export async function growthMapSnapshot(
  env: Cloudflare.Env,
  auth: AuthContext,
  requestedAppId = "",
): Promise<{
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
}> {
  const now = new Date();
  const workspace = await workspaceFor(env.DB, auth.userId, auth.workspaceId);
  if (!workspace) {
    throw new Error("workspace_not_found");
  }
  const selectedApp = await env.DB.prepare(
    `SELECT id,name,platform,bundle_id,apple_app_id,default_storefront,icon_url,
            is_placeholder
     FROM apps
     WHERE workspace_id=? AND id=?
     LIMIT 1`,
  )
    .bind(auth.workspaceId, requestedAppId || workspace.defaultAppId)
    .first<{
      id: string;
      name: string;
      platform: string;
      bundle_id: string | null;
      apple_app_id: string | null;
      default_storefront: string;
      icon_url: string | null;
      is_placeholder: number | null;
    }>();
  if (!selectedApp) throw new Error("app_not_found");
  const sources = await listSources(env.DB, auth.workspaceId, selectedApp.id);
  const entitled = isEntitled(workspace, now);
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const metricResult = entitled
    ? await env.DB.prepare(
        `SELECT provider,metric_key,occurred_at,value,unit,completeness,dimensions
         FROM metric_points
         WHERE workspace_id = ? AND app_id = ? AND occurred_at >= ?
         ORDER BY occurred_at`,
      )
        .bind(auth.workspaceId, selectedApp.id, from)
        .all<MetricRow>()
    : { results: [] as MetricRow[] };
  const metrics = metricResult.results;
  const sums = stageValues(metrics);
  const top = Math.max(sums.get("impressions") ?? 0, 1);

  const diagnosisV2 = isFlagEnabled(env, "DIAGNOSIS_V2_ENABLED");

  const [latestRun, currentDiagnosis] = entitled
    ? await Promise.all([
        getLatestDiagnosisRun(env.DB, auth.workspaceId, selectedApp.id),
        getCurrentDiagnosis(env.DB, auth.workspaceId, selectedApp.id),
      ])
    : [null, null];

  /**
   * Stage payload.
   *
   * When a diagnosis result exists and DIAGNOSIS_V2_ENABLED is on, the engine's
   * persisted verdict is authoritative: health, evidence links, baseline,
   * comparison type, sample size, confidence and readiness reason all come from
   * the run that computed them. The metric-aggregation fallback below is only
   * the pre-diagnosis shape of the funnel, and it says so — every stage it
   * produces is explicitly `unknown` with a reason, never a silent verdict.
   */
  const persistedIosStages = currentDiagnosis?.stages.filter((stage) =>
    IOS_STAGE_IDS.has(stage.stageId),
  );

  const stages: GrowthStage[] =
    diagnosisV2 && persistedIosStages?.length
      ? persistedIosStages.map((stage) => ({
          id: stage.stageId as StageId,
          label: stage.label,
          value: stage.value,
          formattedValue: stage.formattedValue,
          conversionRate: stage.conversionRate,
          health: stage.health,
          source: stage.source as SourceProvider,
          evidenceIds: stage.evidenceIds,
          flowWidth: stage.flowWidth,
          ...(stage.benchmark === null ? {} : { benchmark: stage.benchmark }),
          comparisonType: stage.comparisonType,
          ratioComparisonType: stage.ratioComparisonType,
          ...(stage.readinessReason
            ? { readinessReason: stage.readinessReason }
            : {}),
          ...(stage.sampleSize === null ? {} : { sampleSize: stage.sampleSize }),
          valueState: stage.valueState,
          baselineMethod: stage.baselineMethod,
          baselineWindow: stage.baselineWindow,
          confidence: stage.confidence,
        }))
      : stageDefinitions.map((definition, index) => {
          const value = sums.get(definition.metricKey) ?? 0;
          const previous =
            index > 0 ? sums.get(stageDefinitions[index - 1].metricKey) ?? 0 : 0;
          const measured = metrics.some(
            (metric) =>
              metric.metric_key === definition.metricKey &&
              metric.provider === definition.source,
          );
          return {
            id: definition.id,
            label: definition.label,
            value,
            formattedValue: measured ? compactNumber(value) : "—",
            conversionRate: index > 0 && previous > 0 ? value / previous : null,
            health: "unknown" as StageHealth,
            source: definition.source,
            evidenceIds: [] as string[],
            flowWidth: Math.max(30, 155 * Math.sqrt(value / Math.max(top, value, 1))),
            comparisonType: "not_comparable" as ComparisonType,
            ratioComparisonType: "not_comparable" as ComparisonType,
            readinessReason: measured
              ? "diagnosis_not_available"
              : "metric_missing",
            valueState: measured
              ? value === 0
                ? ("explicit_zero" as const)
                : ("measured" as const)
              : ("missing" as const),
            baselineMethod: "none" as const,
          };
        });

  /**
   * Web funnel stages, when the selected product is a website and a diagnosis
   * covered it. Delivered on a separate key because GrowthStage.id is keyed to
   * the iOS StageId union that several UI lookup tables depend on.
   */
  const webStages: WebGrowthStage[] =
    diagnosisV2 && currentDiagnosis
      ? currentDiagnosis.stages
          .filter((stage) => WEB_STAGE_IDS.has(stage.stageId))
          .map((stage) => ({
            id: stage.stageId as WebStageId,
            label: stage.label,
            value: stage.value,
            formattedValue: stage.formattedValue,
            conversionRate: stage.conversionRate,
            health: stage.health,
            source: "appclimb-web" as const,
            evidenceIds: stage.evidenceIds,
            flowWidth: stage.flowWidth,
            ...(stage.benchmark === null ? {} : { benchmark: stage.benchmark }),
            comparisonType: stage.comparisonType,
            ratioComparisonType: stage.ratioComparisonType,
            ...(stage.readinessReason
              ? { readinessReason: stage.readinessReason }
              : {}),
            ...(stage.sampleSize === null ? {} : { sampleSize: stage.sampleSize }),
            valueState: stage.valueState,
            baselineMethod: stage.baselineMethod,
            baselineWindow: stage.baselineWindow,
            confidence: stage.confidence,
          }))
      : [];

  const webPropertyRow = selectedApp.platform === "Web"
    ? await env.DB.prepare(
        `SELECT id,domain,first_event_at,last_event_at,primary_conversion_goal
         FROM web_properties
         WHERE workspace_id = ? LIMIT 1`,
      )
        .bind(auth.workspaceId)
        .first<{
          id: string;
          domain: string;
          first_event_at: string | null;
          last_event_at: string | null;
          primary_conversion_goal: string | null;
        }>()
    : null;

  const eventResult = entitled
    ? await env.DB.prepare(
        `SELECT id,occurred_at,label,detail,event_type
         FROM change_events
         WHERE workspace_id = ? AND app_id = ? AND occurred_at >= ?
         ORDER BY occurred_at DESC
         LIMIT 50`,
      )
        .bind(auth.workspaceId, selectedApp.id, from)
        .all<{
          id: string;
          occurred_at: string;
          label: string;
          detail: string | null;
          event_type: string;
        }>()
    : { results: [] };
  const evidenceResult = entitled
    ? await env.DB.prepare(
        `SELECT id,title,finding,provider,metric_keys,window_from,window_to,
                confidence,before_value,after_value
         FROM evidence WHERE workspace_id = ? AND app_id = ?
         ORDER BY created_at DESC LIMIT 50`,
      )
        .bind(auth.workspaceId, selectedApp.id)
        .all<{
          id: string;
          title: string;
          finding: string;
          provider: string;
          metric_keys: string;
          window_from: string;
          window_to: string;
          confidence: string;
          before_value: string;
          after_value: string;
        }>()
    : { results: [] };
  const insightResult = entitled
    ? await env.DB.prepare(
        `SELECT id,title,summary,kind,stage_id,evidence_ids,confidence,impact,effort,rank
         FROM insights WHERE workspace_id = ? AND app_id = ?
         ORDER BY created_at DESC,rank LIMIT 30`,
      )
        .bind(auth.workspaceId, selectedApp.id)
        .all<{
          id: string;
          title: string;
          summary: string;
          kind: string;
          stage_id: string;
          evidence_ids: string;
          confidence: string;
          impact: string;
          effort: string;
          rank: number;
        }>()
    : { results: [] };
  const actionsResult = entitled
    ? await env.DB.prepare(
        `SELECT id,insight_id,title,rationale,experiment_template,status,
                external_mutation_allowed,structured_plan
         FROM action_proposals WHERE workspace_id = ? AND app_id = ?
         ORDER BY created_at DESC LIMIT 30`,
      )
        .bind(auth.workspaceId, selectedApp.id)
        .all<{
          id: string;
          insight_id: string;
          title: string;
          rationale: string;
          experiment_template: string;
          status: string;
          external_mutation_allowed: number;
          structured_plan: string | null;
        }>()
    : { results: [] };
  const trust = confidence(metrics, now);
  const connectedCount = sources.filter(
    (source) => source.status === "connected",
  ).length;
  const colorByType: Record<string, string> = {
    release: "blue",
    metadata: "teal",
    screenshots: "teal",
    price: "coral",
    paywall: "violet",
  };
  const postHogMetrics = metrics.filter(
    (metric) => metric.provider === "posthog",
  );
  const activeByDay = new Map<string, number>();
  const flowByKey = new Map<
    string,
    { label: string; event: string; role: string; value: number }
  >();
  let detectedEventCount = 0;
  let activeTotal = 0;
  let activationTotal = 0;
  let postHogUpdatedAt: string | null = null;
  for (const metric of postHogMetrics) {
    const dimensions = parseJSON<Record<string, string>>(metric.dimensions, {});
    const date = metric.occurred_at.slice(0, 10);
    if (metric.metric_key === "active_users") {
      activeTotal += Number(metric.value);
      activeByDay.set(date, (activeByDay.get(date) ?? 0) + Number(metric.value));
    }
    if (metric.metric_key === "activated_users") {
      activationTotal += Number(metric.value);
    }
    if (/^posthog_flow_\d+$/u.test(metric.metric_key)) {
      const current = flowByKey.get(metric.metric_key) ?? {
        label: dimensions.label || dimensions.event || "Product milestone",
        event: dimensions.event || "",
        role: dimensions.role || "value",
        value: 0,
      };
      current.value += Number(metric.value);
      flowByKey.set(metric.metric_key, current);
    }
    detectedEventCount = Math.max(
      detectedEventCount,
      Number(dimensions.detectedEventCount) || 0,
    );
    if (
      !postHogUpdatedAt ||
      new Date(metric.occurred_at).getTime() >
        new Date(postHogUpdatedAt).getTime()
    ) {
      postHogUpdatedAt = metric.occurred_at;
    }
  }
  const postHogSource = sources.find(
    (source) => source.provider === "posthog",
  );
  const flow = [...flowByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([id, item]) => ({ id, ...item }));

  // Distinct dates in window to estimate complete days
  const distinctDays = new Set(metrics.map((m) => m.occurred_at.slice(0, 10))).size;

  /**
   * Derived from the persisted diagnosis outcome, not from "any insight
   * exists". An insight can be an early warning; only a run whose recorded
   * outcome is `ready` produced a confirmed constraint.
   */
  const hasConfirmedInsight = currentDiagnosis?.run.outcome === "ready";

  const readiness = deriveWorkspaceReadiness({
    app: {
      id: selectedApp.id,
      name: selectedApp.name,
      platform: selectedApp.platform === "Web" ? "Web" : "iOS",
      isPlaceholder: Boolean(selectedApp.is_placeholder),
    },
    webProperty: webPropertyRow
      ? {
          id: webPropertyRow.id,
          domain: webPropertyRow.domain,
          firstEventAt: webPropertyRow.first_event_at,
          lastEventAt: webPropertyRow.last_event_at,
          primaryConversionGoal: webPropertyRow.primary_conversion_goal,
        }
      : null,
    sources: sources.map(toSourceStatusInfo),
    metricCount: metrics.length,
    completeDays: distinctDays,
    hasDiagnosisRun: Boolean(latestRun),
    hasConfirmedInsight,
    isDiagnosisRunning:
      latestRun?.status === "running" ||
      latestRun?.status === "queued" ||
      latestRun?.status === "retrying",
  });

  /**
   * The contract only accepts DiagnosisStatus values. The queue lifecycle
   * vocabulary ('succeeded', 'retrying') is mapped away in persist.ts, so the
   * frontend can never receive a status that is not a member of the union.
   */
  const diagnosisSummary: DiagnosisSummary = latestRun
    ? {
        status: latestRun.outcome,
        generatedAt: latestRun.completedAt ?? latestRun.generatedAt,
        version: latestRun.version,
        primaryInsightId: latestRun.primaryInsightId,
        limitations: latestRun.limitations,
        missingRequirements: latestRun.missingRequirements,
        errorCode: latestRun.errorCode,
      }
    : {
        status: "not_ready",
        generatedAt: null,
        version: null,
      };

  const actionProposals = actionsResult.results.map((item) => {
    const actionPlan = parseJSON<ActionPlan | undefined>(
      item.structured_plan,
      undefined,
    );
    return {
      id: item.id,
      insightId: item.insight_id,
      title: item.title,
      rationale: item.rationale,
      experimentTemplate: item.experiment_template,
      status: item.status,
      externalMutationAllowed: Boolean(item.external_mutation_allowed) as false,
      ...(actionPlan ? { actionPlan } : {}),
    };
  });

  const actionPlans = actionProposals
    .map((ap) => ap.actionPlan)
    .filter((ap): ap is NonNullable<typeof ap> => Boolean(ap));

  return {
    data: {
      generatedAt: now.toISOString(),
      workspaceName: workspace.name,
      app: {
        id: selectedApp.id,
        name: selectedApp.name,
        platform: selectedApp.platform,
        bundleId: selectedApp.bundle_id ?? "",
        appStoreId: selectedApp.apple_app_id ?? "",
        storefront: selectedApp.default_storefront,
        iconUrl:
          selectedApp.icon_url ||
          (selectedApp.platform === "Web" && selectedApp.bundle_id
            ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(selectedApp.bundle_id)}.ico`
            : ""),
        period: "Last 30 days",
      },
      readiness,
      diagnosis: diagnosisSummary,
      confidence: {
        ...trust,
        note: `${connectedCount} sources connected`,
      },
      stages,
      // Additive: web funnel stages, empty for iOS products and whenever no
      // web diagnosis has run yet.
      webStages,
      events: eventResult.results.map((event) => ({
        id: event.id,
        occurredAt: event.occurred_at,
        label: event.label,
        detail: event.detail ?? "",
        type: event.event_type,
        color: colorByType[event.event_type] ?? "teal",
      })),
      evidence: evidenceResult.results.map((item) => ({
        id: item.id,
        title: item.title,
        finding: item.finding,
        source: item.provider,
        metricKeys: parseJSON<string[]>(item.metric_keys, []),
        window: { from: item.window_from, to: item.window_to },
        confidence: item.confidence,
        before: parseJSON<Record<string, unknown>>(item.before_value, {}),
        after: parseJSON<Record<string, unknown>>(item.after_value, {}),
      })),
      insights: insightResult.results.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        kind: item.kind,
        stageId: item.stage_id,
        evidenceIds: parseJSON<string[]>(item.evidence_ids, []),
        confidence: item.confidence,
        impact: item.impact,
        effort: item.effort,
        rank: item.rank,
      })),
      actionProposals,
      actionPlans,
      experiments: [],
      sources,
      posthogPulse: {
        status: postHogMetrics.length
          ? "live"
          : postHogSource?.status === "connected" ||
              postHogSource?.status === "needs-attention"
            ? "preparing"
            : "not-connected",
        autoMapped: true,
        detectedEventCount,
        updatedAt:
          (typeof postHogSource?.lastSyncAt === "string"
            ? postHogSource.lastSyncAt
            : null) ?? postHogUpdatedAt,
        activeUserDays: activeTotal,
        activationUserDays: activationTotal,
        activationRate:
          activeTotal > 0 ? Math.min(1, activationTotal / activeTotal) : null,
        dailyActive: [...activeByDay.entries()].map(([date, value]) => ({
          date,
          value,
        })),
        flow,
      },
      retention: [],
      customerClusters: [],
    },
    meta: {
      mode: metrics.length ? "live" : "empty",
      entitled,
      ...(entitled ? {} : { entitlementError: "entitlement_required" }),
      externalMutationsAllowed: false,
      windowDays: 30,
      // Which rollout flags produced this payload, so a shadow-mode run is
      // distinguishable from a live one when comparing snapshots.
      flags: rolloutFlagState(env),
    },
  };
}
