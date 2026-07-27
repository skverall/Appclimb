import type {
  ActionPlan,
  AnyStageId,
  BaselineMethod,
  ComparisonType,
  ConfidenceLevel,
  DiagnosisStatus,
  InsightKind,
  SourceProvider,
  StageHealth,
  StageId,
  StageValueState,
  WebStageId,
} from "@/lib/contracts";

export type {
  StageId,
  WebStageId,
  AnyStageId,
  SourceProvider,
  ConfidenceLevel,
  StageHealth,
  ComparisonType,
  BaselineMethod,
  StageValueState,
  DiagnosisStatus,
  ActionPlan,
};

/**
 * Providers the diagnosis engine can read from.
 *
 * `appclimb-web` is AppClimb's own first-party web collector. It is not part of
 * the external {@link SourceProvider} union because that union drives the
 * connect-a-source UI, and the web collector is not something a user connects.
 */
export type DiagnosisProvider = SourceProvider | "appclimb-web";

export type Platform = "iOS" | "Web";

export interface DiagnosisMetric {
  provider: DiagnosisProvider;
  key: string;
  occurredAt: string;
  value: number;
  unit: "count" | "currency" | "ratio" | "rank" | "range_count" | "range_ratio";
  freshnessHours: number;
  completeness: number;
  dimensions?: Record<string, string>;
}

export interface StageDefinition {
  id: AnyStageId;
  label: string;
  metricKey: string;
  source: DiagnosisProvider;
  validDenominator?: {
    metricKey: string;
    source: DiagnosisProvider;
    relationship: "same_source_funnel" | "cohort" | "aggregate_directional";
  };
}

export interface DiagnosisStageResult {
  id: AnyStageId;
  label: string;
  /**
   * Rendering value. Meaningful only when `valueState !== "missing"`; a missing
   * metric carries 0 here purely so the flow diagram has a width, never as an
   * observation.
   */
  value: number;
  valueState: StageValueState;
  formattedValue: string;
  conversionRate: number | null;
  health: StageHealth;
  source: DiagnosisProvider;
  flowWidth: number;
  /** Baseline the classification compared against, when one existed. */
  benchmark?: number;
  baselineMethod: BaselineMethod;
  baselineWindow?: { from: string; to: string } | null;
  /** How health was decided. */
  comparisonType: ComparisonType;
  /** How honest the displayed conversionRate is. */
  ratioComparisonType: ComparisonType;
  readinessReason?: string;
  /** Denominator size backing the classification, not the raw point count. */
  sampleSize?: number;
  confidence: ConfidenceLevel;
  evidenceIds: string[];
}

export interface DiagnosisEvidenceItem {
  id: string;
  provider: DiagnosisProvider;
  title: string;
  finding: string;
  metricKeys: string[];
  windowFrom: string;
  windowTo: string;
  confidence: ConfidenceLevel;
  before: { label: string; value: string };
  after: { label: string; value: string };
}

export interface DiagnosisInsightItem {
  id: string;
  title: string;
  summary: string;
  kind: InsightKind;
  stageId: AnyStageId;
  evidenceIds: string[];
  confidence: ConfidenceLevel;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  /** 1 is reserved for a confirmed constraint; 2-3 are early warnings. */
  rank: number;
}

export interface DiagnosisActionProposalItem {
  id: string;
  insightId: string;
  title: string;
  rationale: string;
  experimentTemplate: string;
  status: "proposed" | "accepted" | "dismissed";
  externalMutationAllowed: false;
  actionPlan: ActionPlan;
}

export interface DiagnosisRunResult {
  version: string;
  status: DiagnosisStatus;
  window: { from: string; to: string };
  confidence: {
    score: number;
    level: ConfidenceLevel;
    note: string;
  };
  platform: Platform;
  stages: DiagnosisStageResult[];
  evidence: DiagnosisEvidenceItem[];
  insights: DiagnosisInsightItem[];
  actionProposals: DiagnosisActionProposalItem[];
  actionPlans: ActionPlan[];
  inputHash: string;
  limitations: string[];
  missingRequirements: string[];
}

export interface EngineInput {
  metrics: DiagnosisMetric[];
  now: Date;
  platform?: Platform;
  customTargets?: Partial<Record<AnyStageId, number>>;
}
