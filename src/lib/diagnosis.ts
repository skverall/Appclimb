import type {
  ConfidenceLevel,
  GrowthStage,
  MetricPoint,
  SourceProvider,
  StageId,
} from "@/lib/contracts";

const SOURCE_PRECEDENCE: Record<string, SourceProvider> = {
  impressions: "app-store-connect",
  product_page_views: "app-store-connect",
  downloads: "app-store-connect",
  proceeds: "app-store-connect",
  activation_24h: "posthog",
  feature_usage: "posthog",
  retention: "posthog",
  paywall_view_rate: "superwall",
  paywall_conversion: "superwall",
  trial_start_rate: "revenuecat",
  trial_to_paid: "revenuecat",
  renewal_rate: "revenuecat",
  churn_rate: "revenuecat",
  revenue: "revenuecat",
};

export function conversionRate(
  currentValue: number,
  previousValue: number,
): number | null {
  if (!Number.isFinite(currentValue) || previousValue <= 0) {
    return null;
  }

  return Math.max(0, Math.min(1, currentValue / previousValue));
}

export function preferredSource(metricKey: string): SourceProvider | undefined {
  return SOURCE_PRECEDENCE[metricKey];
}

export function selectEarliestBrokenStage(
  stages: GrowthStage[],
): GrowthStage | undefined {
  return stages.find((stage, index) => {
    if (index === 0 || stage.health === "unknown") {
      return false;
    }

    if (stage.health === "critical") {
      return true;
    }

    return (
      stage.benchmark !== undefined &&
      stage.conversionRate !== null &&
      stage.conversionRate < stage.benchmark * 0.75
    );
  });
}

export function assessConfidence(points: MetricPoint[]): {
  score: number;
  level: ConfidenceLevel;
} {
  if (points.length === 0) {
    return { score: 0, level: "low" };
  }

  const avgCompleteness =
    points.reduce((sum, point) => sum + point.completeness, 0) / points.length;
  const avgFreshness =
    points.reduce((sum, point) => sum + point.freshnessHours, 0) / points.length;
  const freshnessFactor = Math.max(0, 1 - avgFreshness / 72);
  const score = Math.round(
    Math.max(0, Math.min(1, avgCompleteness * 0.72 + freshnessFactor * 0.28)) *
      100,
  );

  return {
    score,
    level: score >= 80 ? "high" : score >= 55 ? "medium" : "low",
  };
}

export function alignUtcDay(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  ).toISOString();
}

export function canJoinAtUserLevel(config: {
  sharedAppUserIdConfirmed: boolean;
  sources: SourceProvider[];
}): boolean {
  return config.sharedAppUserIdConfirmed && config.sources.length > 1;
}

export function stageOrder(stageId: StageId): number {
  return [
    "discover",
    "store",
    "install",
    "activate",
    "paywall",
    "trial",
    "paid",
    "renew",
  ].indexOf(stageId);
}
