import type {
  ActionPlan,
  ComparisonType,
  ConfidenceLevel,
  DiagnosisStatus,
  InsightKind,
  SourceProvider,
  StageHealth,
  StageId,
} from "@/lib/contracts";

export type { StageId, SourceProvider, ConfidenceLevel, StageHealth, ComparisonType, ActionPlan };

export interface DiagnosisMetric {
  provider: SourceProvider;
  key: string;
  occurredAt: string;
  value: number;
  unit: "count" | "currency" | "ratio" | "rank" | "range_count" | "range_ratio";
  freshnessHours: number;
  completeness: number;
  dimensions?: Record<string, string>;
}

export interface StageDefinition {
  id: StageId;
  label: string;
  metricKey: string;
  source: SourceProvider;
  validDenominator?: {
    metricKey: string;
    source: SourceProvider;
    relationship: "same_source_funnel" | "cohort" | "aggregate_directional";
  };
}

export interface DiagnosisStageResult {
  id: StageId;
  label: string;
  value: number;
  formattedValue: string;
  conversionRate: number | null;
  health: StageHealth;
  source: SourceProvider;
  flowWidth: number;
  benchmark?: number;
  comparisonType: ComparisonType;
  readinessReason?: string;
  sampleSize?: number;
  evidenceIds: string[];
}

export interface DiagnosisEvidenceItem {
  id: string;
  provider: SourceProvider;
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
  stageId: StageId;
  evidenceIds: string[];
  confidence: ConfidenceLevel;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
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
  customTargets?: Partial<Record<StageId, number>>;
}
