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

export type AccessStatus =
  | "not_connected"
  | "verifying"
  | "verified"
  | "revoked"
  | "error";

export type DataStatus =
  | "none"
  | "provider_pending"
  | "collecting"
  | "ready"
  | "stale"
  | "failed";

export type MappingStatus =
  | "not_required"
  | "automatic_unconfirmed"
  | "confirmed"
  | "manual"
  | "insufficient_events"
  | "invalid";

export type DiagnosisEligibility =
  | "blocked"
  | "eligible"
  | "queued"
  | "running"
  | "ready"
  | "no_confirmed_issue"
  | "failed";

export type DiagnosisStatus =
  | "not_ready"
  | "queued"
  | "running"
  | "ready"
  | "no_confirmed_issue"
  | "failed";

export type ComparisonType =
  | "same_source_funnel"
  | "cohort"
  | "time_baseline"
  | "aggregate_directional"
  | "not_comparable";

export interface CapabilityReadiness {
  status: "unsupported" | "blocked" | "collecting" | "ready";
  reasonCode?: string;
}

export interface WorkspaceReadiness {
  state:
    | "product_required"
    | "installation_required"
    | "source_required"
    | "source_pending"
    | "collecting"
    | "diagnosis_running"
    | "diagnosis_ready"
    | "no_confirmed_issue"
    | "attention";
  progress: number;
  primaryAction: {
    kind:
      | "add_product"
      | "install_web_tracking"
      | "connect_source"
      | "confirm_posthog_mapping"
      | "retry_source"
      | "open_diagnosis"
      | "open_action_plan"
      | "wait";
    provider?: SourceProvider;
    reasonCode: string;
  };
  capabilities: {
    acquisition: CapabilityReadiness;
    activation: CapabilityReadiness;
    monetization: CapabilityReadiness;
    retention: CapabilityReadiness;
  };
  blockers: Array<{
    code: string;
    provider?: SourceProvider;
    required: boolean;
    current?: number;
    target?: number;
    lastCheckedAt?: string;
    nextCheckAt?: string;
  }>;
}

export interface StructuredActionStep {
  order: number;
  title: string;
  instruction: string;
  effort: "small" | "medium" | "large";
}

export interface ActionPlan {
  targetStageId?: StageId;
  problem: string;
  desiredOutcome: string;
  whyThisAction: string;
  steps: StructuredActionStep[];
  prerequisites: string[];
  instrumentation: string[];
  primaryMetric: {
    key: string;
    label: string;
    current?: number;
    targetDirection: "up" | "down";
    successThreshold?: number;
  };
  guardrails: Array<{
    key: string;
    label: string;
    failureThreshold?: number;
  }>;
  segment?: string;
  minimumSample?: number;
  minimumCompleteDays?: number;
  stopCondition: string;
  rollbackCondition?: string;
  evidenceIds?: string[];
  sourceProviders?: SourceProvider[];
}

export interface DiagnosisSummary {
  status: DiagnosisStatus;
  generatedAt: string | null;
  version: string | null;
  primaryInsightId?: string | null;
  limitations?: string[];
  missingRequirements?: string[];
  errorCode?: string | null;
}

export interface MetricPoint {
  id: string;
  workspaceId: string;
  appId: string;
  source: SourceProvider;
  metricKey: string;
  occurredAt: string;
  value: number;
  unit:
    | "count"
    | "currency"
    | "ratio"
    | "rank"
    | "range_count"
    | "range_ratio";
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
  comparisonType?: ComparisonType;
  readinessReason?: string;
  sampleSize?: number;
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
  actionPlan?: ActionPlan;
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
  endedAt?: string;
  actionProposalId?: string;
  evidenceIds?: string[];
  result?: string;
}

export interface SourceConnection {
  provider: SourceProvider;
  label: string;
  status: "connected" | "needs-attention" | "not-connected";
  accessStatus?: AccessStatus;
  dataStatus?: DataStatus;
  mappingStatus?: MappingStatus;
  accountLabel?: string;
  lastSyncAt?: string | null;
  nextSyncAt?: string | null;
  freshnessHours?: number | null;
  lastErrorCode?: string | null;
  syncStatus?: "queued" | "running" | "retrying" | "succeeded" | "failed" | null;
  syncAttempt?: number;
  syncMaxAttempts?: number;
  metricCount?: number;
  lastMetricAt?: string | null;
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

export interface PostHogPulse {
  status: "live" | "preparing" | "not-connected";
  autoMapped: boolean;
  detectedEventCount: number;
  updatedAt: string | null;
  activeUserDays: number;
  activationUserDays: number;
  activationRate: number | null;
  dailyActive: Array<{ date: string; value: number }>;
  flow: Array<{
    id: string;
    label: string;
    event: string;
    role: string;
    value: number;
  }>;
}

export interface DashboardSnapshot {
  mode?: "demo" | "empty" | "live" | "restricted" | "unavailable";
  generatedAt: string;
  workspaceName: string;
  app: {
    id: string;
    name: string;
    platform: "iOS" | "Web";
    /** Domain for Web apps, bundle id for iOS when available. */
    bundleId?: string;
    appStoreId?: string;
    storefront: string;
    iconUrl?: string;
    period: string;
  };
  readiness?: WorkspaceReadiness;
  diagnosis?: DiagnosisSummary;
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
  actionPlans?: ActionPlan[];
  experiments: Experiment[];
  sources: SourceConnection[];
  retention: RetentionCell[];
  customerClusters: CustomerCluster[];
  posthogPulse?: PostHogPulse;
}

