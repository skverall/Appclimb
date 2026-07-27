import type { GrowthContractThresholds } from "./config";

export type ReleaseSource = "agent" | "posthog" | "manual";
export type SourceTrust =
  | "verified_connector"
  | "signed_agent_observation"
  | "user_assertion";

export type ReleaseStatus =
  | "observed"
  | "collecting"
  | "evaluated"
  | "superseded";

export type ReleaseVerdict =
  | "collecting"
  | "healthy"
  | "improvement"
  | "regression"
  | "inconclusive"
  | "configuration_required"
  | "failed";

export type BaselineMethod =
  | "previous_release"
  | "pooled_previous_releases"
  | "trailing_historical"
  | "none";

export type ConfidenceLevel = "high" | "medium" | "low";

export type IncidentSeverity = "watch" | "important" | "critical";

export type IncidentStatus =
  | "open"
  | "in_progress"
  | "awaiting_verification"
  | "closed";

export type IncidentOutcome =
  | "resolved"
  | "partial"
  | "no_effect"
  | "worsened"
  | "dismissed"
  | "inconclusive";

export type VerificationOutcome =
  | "collecting"
  | "resolved"
  | "partial"
  | "no_effect"
  | "worsened"
  | "inconclusive";

export interface CohortCounts {
  version: string;
  buildNumber: string;
  newUsers: number;
  activatedUsers: number;
  /** null when newUsers is 0 or counts missing */
  activationRate: number | null;
  cohortStart: string | null;
  cohortEnd: string | null;
  activationWindowDays: number;
  sessionEvent: string;
  activationEvent: string;
  versionProperty: string;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  completeDays: number;
  mappingConfirmed: boolean;
  evidenceIds: string[];
}

export interface SupportingSignal {
  key: string;
  label: string;
  direction: "supports_regression" | "supports_improvement" | "neutral" | "unknown";
  baselineValue: number | null;
  currentValue: number | null;
  relativeChange: number | null;
  trust: SourceTrust;
  note: string;
}

export interface ReleaseImpactInput {
  release: {
    id: string;
    version: string;
    buildNumber: string;
    firstSeenAt: string;
    source: ReleaseSource;
    sourceTrust: SourceTrust;
  };
  current: CohortCounts | null;
  baselineCandidates: CohortCounts[];
  supportingSignals: SupportingSignal[];
  contract: GrowthContractThresholds;
  mapping: {
    sessionEvent: string;
    activationEvent: string;
    versionProperty: string;
    versionPropertyConfirmed: boolean;
    mappingConfirmed: boolean;
  };
  now: string;
  dataFreshnessHours: number | null;
}

export interface ReleaseImpactResult {
  verdict: ReleaseVerdict;
  primaryMetricKey: string;
  baselineMethod: BaselineMethod;
  baseline: CohortCounts | null;
  current: CohortCounts | null;
  baselineValue: number | null;
  currentValue: number | null;
  absoluteChange: number | null;
  relativeChange: number | null;
  baselineSample: number;
  currentSample: number;
  pValue: number | null;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  evidence: Array<Record<string, unknown>>;
  supportingSignals: SupportingSignal[];
  limitations: string[];
  missingRequirements: string[];
  nextCheckAt: string | null;
  severity: IncidentSeverity | null;
  shouldOpenIncident: boolean;
  stageId: string;
  title: string;
  summary: string;
}

export interface VerificationInput {
  origin: CohortCounts;
  baseline: CohortCounts | null;
  fix: CohortCounts | null;
  originRate: number;
  baselineRate: number | null;
  contract: GrowthContractThresholds;
  supportingSignals: SupportingSignal[];
  now: string;
  fixFirstSeenAt: string;
  maximumWaitDays: number;
}

export interface VerificationResult {
  outcome: VerificationOutcome;
  fixRate: number | null;
  originRate: number;
  baselineRate: number | null;
  absoluteChangeVsOrigin: number | null;
  relativeChangeVsOrigin: number | null;
  recoveryRatio: number | null;
  pValueVsOrigin: number | null;
  currentSample: number;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  limitations: string[];
  guardrailBreached: boolean;
  nextCheckAt: string | null;
  summary: string;
}
