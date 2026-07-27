import { md5 } from "@noble/hashes/legacy.js";
import {
  DIAGNOSIS_VERSION,
  DIAGNOSIS_WINDOW_DAYS,
  THRESHOLDS,
} from "./config";
import { computeConfidence } from "./confidence";
import { buildActionPlan } from "./playbooks";
import { STAGE_DEFINITIONS } from "./stage-definitions";
import type {
  ComparisonType,
  DiagnosisActionProposalItem,
  DiagnosisEvidenceItem,
  DiagnosisInsightItem,
  DiagnosisMetric,
  DiagnosisRunResult,
  DiagnosisStageResult,
  EngineInput,
  StageId,
} from "./types";

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function diagnosisWindow(now: Date): { from: string; to: string } {
  const utc = new Date(now.getTime());
  const toDate = new Date(
    Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 0, 0, 0, 0),
  );
  const fromDate = new Date(toDate.getTime() - DIAGNOSIS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };
}

export function inputHash(metrics: DiagnosisMetric[], now: Date): string {
  const sorted = [...metrics].sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    if (a.key !== b.key) return a.key.localeCompare(b.key);
    return a.occurredAt.localeCompare(b.occurredAt);
  });

  const hourStr = now.toISOString().slice(0, 13);
  const payload = JSON.stringify({
    version: DIAGNOSIS_VERSION,
    hour: hourStr,
    points: sorted.map((m) => `${m.provider}:${m.key}:${m.occurredAt.slice(0, 10)}:${m.value}:${m.unit}`),
  });

  return hex(md5(new TextEncoder().encode(payload))).slice(0, 32);
}

interface MetricAggregate {
  sum: number;
  latestSnapshotValue?: number;
  latestSnapshotTime?: string;
  hasSnapshot: boolean;
  sampleCount: number;
}

export function aggregateMetrics(metrics: DiagnosisMetric[]): Map<string, MetricAggregate> {
  const map = new Map<string, MetricAggregate>();

  for (const m of metrics) {
    const key = `${m.provider}\u0000${m.key}`;
    const current = map.get(key) ?? {
      sum: 0,
      hasSnapshot: false,
      sampleCount: 0,
    };

    current.sampleCount += 1;

    if (m.unit === "range_count" || m.unit === "range_ratio") {
      if (
        !current.latestSnapshotTime ||
        m.occurredAt > current.latestSnapshotTime ||
        (m.occurredAt === current.latestSnapshotTime && m.value > (current.latestSnapshotValue ?? 0))
      ) {
        current.latestSnapshotValue = m.value;
        current.latestSnapshotTime = m.occurredAt;
      }
      current.hasSnapshot = true;
    } else {
      current.sum += m.value;
    }

    map.set(key, current);
  }

  return map;
}

export function runDiagnosis(input: EngineInput): DiagnosisRunResult {
  const { metrics, now, customTargets } = input;
  const window = diagnosisWindow(now);
  const confidence = computeConfidence(metrics, now);
  const hash = inputHash(metrics, now);
  const aggregates = aggregateMetrics(metrics);

  const stages: DiagnosisStageResult[] = [];
  const limitations: string[] = [];
  const missingRequirements: string[] = [];

  const topMetricKey = `${STAGE_DEFINITIONS[0].source}\u0000${STAGE_DEFINITIONS[0].metricKey}`;
  const topAgg = aggregates.get(topMetricKey);
  const topValue = topAgg?.hasSnapshot ? (topAgg.latestSnapshotValue ?? 0) : (topAgg?.sum ?? 0);

  let previousValue = 0;
  let previousPresent = false;
  let previousSource = STAGE_DEFINITIONS[0].source;

  for (let index = 0; index < STAGE_DEFINITIONS.length; index += 1) {
    const def = STAGE_DEFINITIONS[index];
    const key = `${def.source}\u0000${def.metricKey}`;
    const agg = aggregates.get(key);
    const present = agg !== undefined && agg.sampleCount > 0;
    const value = agg?.hasSnapshot ? (agg.latestSnapshotValue ?? 0) : (agg?.sum ?? 0);

    let conversionRate: number | null = null;
    let comparisonType: ComparisonType = "not_comparable";
    let health: "healthy" | "watch" | "critical" | "unknown" = "unknown";
    let readinessReason = undefined;

    if (!present) {
      missingRequirements.push(`Missing data for stage: ${def.label} (${def.source})`);
    }

    if (index > 0 && present && previousPresent && previousValue > 0) {
      rateCalculation: {
        const rawRate = Math.max(0, Math.min(1, value / previousValue));
        conversionRate = rawRate;

        if (def.validDenominator) {
          comparisonType = def.validDenominator.relationship as ComparisonType;
        } else {
          comparisonType = def.source === previousSource ? "same_source_funnel" : "aggregate_directional";
        }

        const benchmark = customTargets?.[def.id];
        if (benchmark && benchmark > 0) {
          if (rawRate < benchmark * THRESHOLDS.criticalDeteriorationFactor) {
            health = "critical";
          } else if (rawRate < benchmark * THRESHOLDS.watchDeteriorationFactor) {
            health = "watch";
          } else {
            health = "healthy";
          }
        } else {
          health = "unknown";
          readinessReason = "no_explicit_target_or_historical_baseline";
        }
      }
    }

    const flowWidth = Math.round(
      Math.max(30, 155 * Math.sqrt(value / Math.max(topValue, value, 1))),
    );

    stages.push({
      id: def.id,
      label: def.label,
      value,
      formattedValue: compactNumber(value),
      conversionRate,
      health,
      source: def.source,
      flowWidth,
      benchmark: customTargets?.[def.id],
      comparisonType,
      readinessReason,
      sampleSize: agg?.sampleCount ?? 0,
      evidenceIds: [],
    });

    previousValue = value;
    previousPresent = present;
    previousSource = def.source;
  }

  // Generate Insights, Evidence, and Action Proposals (Max 3 ranked)
  const evidence: DiagnosisEvidenceItem[] = [];
  const insights: DiagnosisInsightItem[] = [];
  const actionProposals: DiagnosisActionProposalItem[] = [];

  // Rank 1: Earliest critical constraint
  const criticalStage = stages.find(
    (s, idx) => idx > 0 && s.health === "critical" && s.comparisonType !== "aggregate_directional",
  ) ?? stages.find((s, idx) => idx > 0 && s.health === "critical");

  if (criticalStage) {
    addDiagnosisInsight({
      stage: criticalStage,
      rank: 1,
      kind: "Derived",
      confidence: confidence.level,
      evidence,
      insights,
      actionProposals,
      window,
    });
  }

  // Rank 2: Next watch/critical stage
  const watchStage = stages.find(
    (s, idx) =>
      idx > 0 &&
      s.id !== criticalStage?.id &&
      (s.health === "watch" || s.health === "critical"),
  );

  if (watchStage && insights.length < THRESHOLDS.maxRankedInsights) {
    addDiagnosisInsight({
      stage: watchStage,
      rank: insights.length + 1,
      kind: "Observed",
      confidence: confidence.level,
      evidence,
      insights,
      actionProposals,
      window,
    });
  }

  // Rank 3: Hypothesis for soft renewal/retention if present
  const renewStage = stages.find(
    (s) => s.id === "renew" && !insights.some((i) => i.stageId === "renew") && s.value > 0,
  );

  if (renewStage && insights.length < THRESHOLDS.maxRankedInsights) {
    addDiagnosisInsight({
      stage: renewStage,
      rank: insights.length + 1,
      kind: "Hypothesis",
      confidence: "low",
      evidence,
      insights,
      actionProposals,
      window,
    });
  }

  const actionPlans = actionProposals.map((ap) => ap.actionPlan);
  const status = !metrics.length
    ? "not_ready"
    : insights.length > 0
      ? "ready"
      : "no_confirmed_issue";

  return {
    version: DIAGNOSIS_VERSION,
    status,
    window,
    confidence,
    stages,
    evidence,
    insights,
    actionProposals,
    actionPlans,
    inputHash: hash,
    limitations,
    missingRequirements,
  };
}

function addDiagnosisInsight(params: {
  stage: DiagnosisStageResult;
  rank: number;
  kind: "Observed" | "Derived" | "Hypothesis";
  confidence: "high" | "medium" | "low";
  evidence: DiagnosisEvidenceItem[];
  insights: DiagnosisInsightItem[];
  actionProposals: DiagnosisActionProposalItem[];
  window: { from: string; to: string };
}) {
  const { stage, rank, kind, confidence, evidence, insights, actionProposals, window } = params;

  const evId = `ev_${stage.id}_${rank}`;
  const insightId = `ins_${stage.id}_${rank}`;
  const proposalId = `prop_${stage.id}_${rank}`;

  const rateStr = stage.conversionRate !== null ? `${(stage.conversionRate * 100).toFixed(1)}%` : "N/A";
  const benchmarkStr = stage.benchmark ? `${(stage.benchmark * 100).toFixed(0)}%` : "baseline";

  evidence.push({
    id: evId,
    provider: stage.source,
    title: `${stage.label} stage conversion evidence`,
    finding: `${stage.label} conversion rate is ${rateStr} against ${benchmarkStr} target in 30-day window.`,
    metricKeys: [stage.id],
    windowFrom: window.from,
    windowTo: window.to,
    confidence,
    before: { label: "Target Baseline", value: benchmarkStr },
    after: { label: "Observed Rate", value: rateStr },
  });

  stage.evidenceIds.push(evId);

  insights.push({
    id: insightId,
    title: `Fix the ${stage.label.toLowerCase()} constraint`,
    summary: `Confirmed bottleneck at ${stage.label} stage with observed rate of ${rateStr}.`,
    kind,
    stageId: stage.id,
    evidenceIds: [evId],
    confidence,
    impact: rank === 1 ? "high" : "medium",
    effort: "medium",
    rank,
  });

  const actionPlan = buildActionPlan({
    stageId: stage.id,
    stageLabel: stage.label,
    sourceProvider: stage.source,
    observedRate: stage.conversionRate,
    benchmarkRate: stage.benchmark,
    evidenceIds: [evId],
  });

  actionProposals.push({
    id: proposalId,
    insightId,
    title: actionPlan.steps[0]?.title || `Optimize ${stage.label}`,
    rationale: actionPlan.whyThisAction,
    experimentTemplate: `${stage.id}-optimization`,
    status: "proposed",
    externalMutationAllowed: false,
    actionPlan,
  });
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toString();
}
