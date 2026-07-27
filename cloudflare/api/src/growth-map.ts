import { isEntitled, workspaceFor } from "./db";
import { listSources } from "./sources";
import type { AuthContext } from "./types";

const stageDefinitions = [
  { id: "discover", label: "Discover", metricKey: "impressions", source: "app-store-connect" },
  { id: "store", label: "Store", metricKey: "product_page_views", source: "app-store-connect" },
  { id: "install", label: "Install", metricKey: "downloads", source: "app-store-connect" },
  { id: "activate", label: "Activate", metricKey: "activated_users", source: "posthog" },
  { id: "paywall", label: "Paywall", metricKey: "paywall_views", source: "superwall" },
  { id: "trial", label: "Trial", metricKey: "trials_new", source: "revenuecat" },
  { id: "paid", label: "Paid", metricKey: "paid_new", source: "revenuecat" },
  { id: "renew", label: "Renew", metricKey: "renewals", source: "revenuecat" },
] as const;

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
    `SELECT id,name,platform,apple_app_id,default_storefront
     FROM apps
     WHERE workspace_id=? AND id=?
     LIMIT 1`,
  )
    .bind(auth.workspaceId, requestedAppId || workspace.defaultAppId)
    .first<{
      id: string;
      name: string;
      platform: string;
      apple_app_id: string | null;
      default_storefront: string;
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
  const stages = stageDefinitions.map((definition, index) => {
    const value = sums.get(definition.metricKey) ?? 0;
    const previous =
      index > 0 ? sums.get(stageDefinitions[index - 1].metricKey) ?? 0 : 0;
    return {
      id: definition.id,
      label: definition.label,
      value,
      formattedValue: compactNumber(value),
      conversionRate: index > 0 && previous > 0 ? value / previous : null,
      health: "unknown",
      source: definition.source,
      evidenceIds: [] as string[],
      flowWidth: Math.max(30, 155 * Math.sqrt(value / Math.max(top, value, 1))),
    };
  });
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
                external_mutation_allowed
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
  return {
    data: {
      generatedAt: now.toISOString(),
      workspaceName: workspace.name,
      app: {
        id: selectedApp.id,
        name: selectedApp.name,
        platform: selectedApp.platform,
        appStoreId: selectedApp.apple_app_id ?? "",
        storefront: selectedApp.default_storefront,
        period: "Last 30 days",
      },
      confidence: {
        ...trust,
        note: `${connectedCount} sources connected`,
      },
      stages,
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
      actionProposals: actionsResult.results.map((item) => ({
        id: item.id,
        insightId: item.insight_id,
        title: item.title,
        rationale: item.rationale,
        experimentTemplate: item.experiment_template,
        status: item.status,
        externalMutationAllowed: Boolean(item.external_mutation_allowed),
      })),
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
    },
  };
}
