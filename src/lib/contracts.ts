export type SourceProvider =
  | "app-store-connect"
  | "revenuecat"
  | "posthog"
  | "superwall"
  | "appclimb-rank";

export type InsightKind = "Observed" | "Derived" | "Hypothesis";
export type ConfidenceLevel = "high" | "medium" | "low";
export type StageHealth = "healthy" | "watch" | "critical" | "unknown";
export type StageId =
  | "discover"
  | "store"
  | "install"
  | "activate"
  | "paywall"
  | "trial"
  | "paid"
  | "renew";

export interface MetricPoint {
  id: string;
  workspaceId: string;
  appId: string;
  source: SourceProvider;
  metricKey: string;
  occurredAt: string;
  value: number;
  unit: "count" | "currency" | "ratio" | "rank";
  dimensions: Record<string, string>;
  freshnessHours: number;
  completeness: number;
}

export interface GrowthStage {
  id: StageId;
  label: string;
  value: number;
  formattedValue: string;
  conversionRate: number | null;
  health: StageHealth;
  source: SourceProvider;
  evidenceIds: string[];
  flowWidth: number;
  benchmark?: number;
}

export type ChangeEventType =
  | "release"
  | "metadata"
  | "screenshots"
  | "price"
  | "paywall";

export interface ChangeEvent {
  id: string;
  occurredAt: string;
  label: string;
  detail: string;
  type: ChangeEventType;
  color: "teal" | "blue" | "coral" | "violet";
}

export interface Evidence {
  id: string;
  title: string;
  finding: string;
  source: SourceProvider;
  metricKeys: string[];
  window: { from: string; to: string };
  confidence: ConfidenceLevel;
  before: { label: string; value: string };
  after: { label: string; value: string };
}

export interface Insight {
  id: string;
  title: string;
  summary: string;
  kind: InsightKind;
  stageId: StageId;
  evidenceIds: string[];
  confidence: ConfidenceLevel;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  rank: number;
}

export interface ActionProposal {
  id: string;
  insightId: string;
  title: string;
  rationale: string;
  experimentTemplate: string;
  status: "proposed" | "accepted" | "dismissed";
  externalMutationAllowed: false;
}

export interface Experiment {
  id: string;
  title: string;
  stageId: StageId;
  hypothesis: string;
  primaryMetric: string;
  guardrailMetric: string;
  status: "draft" | "ready" | "running" | "completed";
  source: SourceProvider;
  startedAt?: string;
}

export interface SourceConnection {
  provider: SourceProvider;
  label: string;
  status: "connected" | "needs-attention" | "not-connected";
  lastSyncAt?: string;
  freshnessHours?: number;
  capabilities: string[];
  readOnly: true;
}

export interface RetentionCell {
  cohort: string;
  values: number[];
}

export interface CustomerCluster {
  id: string;
  label: string;
  mentions: number;
  sentiment: "positive" | "mixed" | "negative";
  x: number;
  y: number;
  radius: number;
}

export interface DashboardSnapshot {
  mode?: "demo" | "live";
  generatedAt: string;
  workspaceName: string;
  app: {
    id: string;
    name: string;
    platform: "iOS";
    storefront: string;
    period: string;
  };
  confidence: {
    score: number;
    level: ConfidenceLevel;
    note: string;
  };
  stages: GrowthStage[];
  events: ChangeEvent[];
  evidence: Evidence[];
  insights: Insight[];
  actionProposals: ActionProposal[];
  experiments: Experiment[];
  sources: SourceConnection[];
  retention: RetentionCell[];
  customerClusters: CustomerCluster[];
}
