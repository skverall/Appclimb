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

/**
 * Web funnel stage identifiers.
 *
 * Deliberately a separate union from {@link StageId}: several UI modules build
 * `satisfies Record<StageId, …>` lookup tables, so widening `StageId` itself
 * would be a breaking change. Web stages travel through the additive
 * {@link WebGrowthStage} channel until those tables cover them.
 */
export type WebStageId = "web_visit" | "web_engaged" | "web_conversion";

/** Any stage the diagnosis engine can classify, across platforms. */
export type AnyStageId = StageId | WebStageId;

/**
 * Whether a stage value was actually measured.
 *
 * A missing metric point is NOT zero. `missing` means the provider returned
 * nothing for the window; `explicit_zero` means the provider covered the
 * window and reported no volume.
 */
export type StageValueState = "measured" | "explicit_zero" | "missing";

/**
 * Where the comparison baseline for a stage came from.
 *
 * AppClimb never ships unsourced industry benchmarks: every baseline is either
 * the product's own history or a target the user set explicitly.
 */
export type BaselineMethod =
  | "previous_window"
  | "historical_average"
  | "explicit_target"
  | "none";

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
  /** How the stage's health was decided. */
  comparisonType?: ComparisonType;
  /**
   * How honest the DISPLAYED `conversionRate` is.
   *
   * `aggregate_directional` means the ratio divides one provider's aggregate by
   * another's: it may be drawn to show direction, but it never decides health
   * and must not be presented as a measured conversion rate.
   */
  ratioComparisonType?: ComparisonType;
  readinessReason?: string;
  sampleSize?: number;
  /**
   * Distinguishes a measured zero from an absent metric. When this is
   * `"missing"`, `value` is a rendering placeholder and must not be read as a
   * real observation — `formattedValue` carries the em dash instead.
   */
  valueState?: StageValueState;
  baselineMethod?: BaselineMethod;
  /** Baseline window the classification compared the recent window against. */
  baselineWindow?: { from: string; to: string } | null;
  confidence?: ConfidenceLevel;
}

/**
 * A stage of the web funnel. Structurally mirrors {@link GrowthStage} but keyed
 * by {@link WebStageId} so it can be adopted independently by the UI.
 */
export interface WebGrowthStage extends Omit<GrowthStage, "id" | "source"> {
  id: WebStageId;
  source: "appclimb-web";
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

