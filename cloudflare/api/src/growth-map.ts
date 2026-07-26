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
): Promise<{
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
}> {
  const now = new Date();
  const workspace = await workspaceFor(env.DB, auth.userId, auth.workspaceId);
  if (!workspace) {
    throw new Error("workspace_not_found");
  }
  const sources = await listSources(env.DB, auth.workspaceId);
  const entitled = isEntitled(workspace, now);
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const metricResult = entitled
    ? await env.DB.prepare(
        `SELECT provider,metric_key,occurred_at,value,unit,completeness
         FROM metric_points
         WHERE workspace_id = ? AND occurred_at >= ?
         ORDER BY occurred_at`,
      )
        .bind(auth.workspaceId, from)
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
         WHERE workspace_id = ? AND occurred_at >= ?
         ORDER BY occurred_at DESC
         LIMIT 50`,
      )
        .bind(auth.workspaceId, from)
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
         FROM evidence WHERE workspace_id = ?
         ORDER BY created_at DESC LIMIT 50`,
      )
        .bind(auth.workspaceId)
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
         FROM insights WHERE workspace_id = ?
         ORDER BY created_at DESC,rank LIMIT 30`,
      )
        .bind(auth.workspaceId)
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
         FROM action_proposals WHERE workspace_id = ?
         ORDER BY created_at DESC LIMIT 30`,
      )
        .bind(auth.workspaceId)
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
  return {
    data: {
      generatedAt: now.toISOString(),
      workspaceName: workspace.name,
      app: {
        id: workspace.defaultAppId,
        name: workspace.defaultAppName,
        platform: "iOS",
        storefront: workspace.defaultStorefront,
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
