import { md5 } from "@noble/hashes/legacy.js";
import {
  DIAGNOSIS_VERSION,
  DIAGNOSIS_WINDOW_DAYS,
  RECENT_WINDOW_DAYS,
  THRESHOLDS,
} from "./config";
import { computeConfidence } from "./confidence";
import { buildActionPlan } from "./playbooks";
import {
  alignedCompleteDays,
  buildSeries,
  isStale,
  seriesKey,
  seriesWindowValue,
  sharedDays,
  splitWindows,
  sumOverDates,
  type MetricSeries,
} from "./series";
import { stageDefinitionsFor } from "./stage-definitions";
import {
  countDeviationZ,
  deteriorationRatio,
  twoProportionZ,
  wilsonInterval,
} from "./stats";
import type {
  AnyStageId,
  BaselineMethod,
  ComparisonType,
  ConfidenceLevel,
  DiagnosisActionProposalItem,
  DiagnosisEvidenceItem,
  DiagnosisInsightItem,
  DiagnosisMetric,
  DiagnosisRunResult,
  DiagnosisStageResult,
  EngineInput,
  StageDefinition,
  StageHealth,
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

/**
 * Idempotency key for a diagnosis run.
 *
 * Deliberate choice: the hash folds in the UTC *date* of the analysis window,
 * not the wall-clock hour the previous implementation used. An hourly component
 * made the hash change 24 times a day for identical data, which defeated the
 * debounce and the "has anything actually changed?" check. A UTC date is the
 * correct granularity because the comparable windows themselves are defined in
 * whole UTC days: same data on the same day means the same verdict, and a new
 * day genuinely is a new comparison.
 */
export function inputHash(
  metrics: DiagnosisMetric[],
  now: Date,
  platform: "iOS" | "Web" = "iOS",
): string {
  const sorted = [...metrics].sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    if (a.key !== b.key) return a.key.localeCompare(b.key);
    return a.occurredAt.localeCompare(b.occurredAt);
  });

  const window = diagnosisWindow(now);
  const payload = JSON.stringify({
    version: DIAGNOSIS_VERSION,
    platform,
    windowTo: window.to.slice(0, 10),
    points: sorted.map(
      (m) =>
        `${m.provider}:${m.key}:${m.occurredAt.slice(0, 10)}:${m.value}:${m.unit}:${m.completeness}`,
    ),
  });

  return hex(md5(new TextEncoder().encode(payload))).slice(0, 32);
}

interface Classification {
  health: StageHealth;
  comparisonType: ComparisonType;
  baselineMethod: BaselineMethod;
  readinessReason?: string;
  benchmark?: number;
  sampleSize?: number;
  recentLabel?: string;
  baselineLabel?: string;
  recentValue?: number;
  baselineValue?: number;
  deteriorationPercent?: number;
  significanceZ?: number;
  /** 95% Wilson bounds on the recent rate, for evidence transparency. */
  interval?: { lower: number; upper: number };
  baselineWindow?: { from: string; to: string } | null;
}

function unknown(
  reason: string,
  comparisonType: ComparisonType,
): Classification {
  return {
    health: "unknown",
    comparisonType,
    baselineMethod: "none",
    readinessReason: reason,
  };
}

function healthFromRatio(ratio: number, significant: boolean): StageHealth {
  if (!significant) return "healthy";
  if (ratio < THRESHOLDS.criticalDeteriorationFactor) return "critical";
  if (ratio < THRESHOLDS.watchDeteriorationFactor) return "watch";
  return "healthy";
}

function windowBounds(dates: string[]): { from: string; to: string } | null {
  if (!dates.length) return null;
  const sorted = [...dates].sort();
  return {
    from: `${sorted[0]}T00:00:00.000Z`,
    to: `${sorted[sorted.length - 1]}T00:00:00.000Z`,
  };
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Classifies one stage against the product's own baseline.
 *
 * Priority, per the plan:
 *   1. recent window vs the previous comparable window (a real conversion rate
 *      where the denominator is honest);
 *   2. the same comparison against the product's own earlier history when a
 *      full previous window does not exist yet, then the stage's own volume
 *      over time when no valid denominator exists at all;
 *   3. an explicit user target, only when the user set one.
 *
 * There is no industry-benchmark path. A comparison that cannot clear the
 * sample and complete-day thresholds resolves to `unknown` with a reason.
 */
function classifyStage(params: {
  definition: StageDefinition;
  stageSeries: MetricSeries | undefined;
  denominatorSeries: MetricSeries | undefined;
  customTarget?: number;
  now: Date;
  confidenceLevel: ConfidenceLevel;
}): Classification {
  const { definition, stageSeries, denominatorSeries, customTarget, now, confidenceLevel } =
    params;

  const denominatorRelationship = definition.validDenominator?.relationship;
  const displayComparison: ComparisonType = denominatorRelationship ?? "not_comparable";

  if (!stageSeries || !stageSeries.present) {
    return unknown("metric_missing", displayComparison);
  }

  // ---- 1 & 2: rate against the product's own history -----------------------
  const rateComparable =
    denominatorRelationship === "same_source_funnel" ||
    denominatorRelationship === "cohort";

  // Two series that never cover the same day describe different windows. That
  // is a more specific answer than "stale", and both are usually true at once
  // when the numerator stopped reporting, so it is decided first.
  if (
    rateComparable &&
    denominatorSeries?.present &&
    !stageSeries.snapshot &&
    sharedDays([stageSeries, denominatorSeries]).length === 0
  ) {
    return unknown("window_mismatch", displayComparison);
  }

  if (isStale(stageSeries, now)) {
    return unknown("stale_data", displayComparison);
  }

  if (rateComparable && denominatorSeries?.present && !stageSeries.snapshot) {
    const aligned = alignedCompleteDays([stageSeries, denominatorSeries]);
    if (aligned.length < THRESHOLDS.minCompleteDays) {
      // Overlapping but mostly partial coverage is simply not ready yet.
      return unknown("insufficient_complete_days", displayComparison);
    }

    const windows = splitWindows(aligned, RECENT_WINDOW_DAYS);
    if (windows) {
      const recentNumerator = sumOverDates(stageSeries, windows.recent);
      const recentDenominator = sumOverDates(denominatorSeries, windows.recent);
      const baselineNumerator = sumOverDates(stageSeries, windows.baseline);
      const baselineDenominator = sumOverDates(denominatorSeries, windows.baseline);

      if (
        recentDenominator < THRESHOLDS.minSampleForRateComparison ||
        baselineDenominator < THRESHOLDS.minSampleForRateComparison
      ) {
        return unknown("insufficient_sample", displayComparison);
      }

      const recentRate = recentNumerator / recentDenominator;
      const baselineRate = baselineNumerator / baselineDenominator;
      const ratio = deteriorationRatio(recentRate, baselineRate);
      if (ratio === null) {
        return unknown("no_baseline_available", displayComparison);
      }

      const z = twoProportionZ(
        { successes: recentNumerator, trials: recentDenominator },
        { successes: baselineNumerator, trials: baselineDenominator },
      );
      const significant = z >= THRESHOLDS.minSignificanceZ;
      const interval = wilsonInterval({
        successes: recentNumerator,
        trials: recentDenominator,
      });

      return applyConfidenceGate(
        {
          health: healthFromRatio(ratio, significant),
          comparisonType: displayComparison,
          baselineMethod: windows.method,
          benchmark: baselineRate,
          sampleSize: recentDenominator,
          recentLabel: "Recent window conversion",
          baselineLabel:
            windows.method === "previous_window"
              ? "Previous window conversion"
              : "Own historical conversion",
          recentValue: recentRate,
          baselineValue: baselineRate,
          deteriorationPercent: (1 - ratio) * 100,
          significanceZ: z,
          interval,
          baselineWindow: windowBounds(windows.baseline),
          // A reason is only recorded when it qualifies the verdict. A
          // classified stage with a real signal carries none.
          readinessReason: significant ? undefined : "no_significant_change",
        },
        confidenceLevel,
      );
    }
  }

  // ---- 2b: own volume over time, when no honest rate exists ---------------
  if (!stageSeries.snapshot) {
    const aligned = alignedCompleteDays([stageSeries]);
    const windows =
      aligned.length >= THRESHOLDS.minCompleteDays
        ? splitWindows(aligned, RECENT_WINDOW_DAYS)
        : null;

    if (windows) {
      const recentTotal = sumOverDates(stageSeries, windows.recent);
      const baselineTotal = sumOverDates(stageSeries, windows.baseline);
      const baselinePerDay = baselineTotal / windows.baseline.length;
      const expected = baselinePerDay * windows.recent.length;

      if (
        recentTotal < THRESHOLDS.minSampleForRateComparison &&
        expected < THRESHOLDS.minSampleForRateComparison
      ) {
        return unknown("insufficient_sample", "time_baseline");
      }

      const ratio = deteriorationRatio(recentTotal, expected);
      if (ratio === null) {
        return unknown("no_baseline_available", "time_baseline");
      }

      const z = countDeviationZ(recentTotal, expected);
      const significant = z >= THRESHOLDS.minSignificanceZ;

      return applyConfidenceGate(
        {
          health: healthFromRatio(ratio, significant),
          comparisonType: "time_baseline",
          baselineMethod: windows.method,
          benchmark: expected,
          sampleSize: Math.round(recentTotal),
          recentLabel: "Recent window volume",
          baselineLabel:
            windows.method === "previous_window"
              ? "Previous window volume"
              : "Own historical volume",
          recentValue: recentTotal,
          baselineValue: expected,
          deteriorationPercent: (1 - ratio) * 100,
          significanceZ: z,
          baselineWindow: windowBounds(windows.baseline),
          readinessReason: significant ? undefined : "no_significant_change",
        },
        confidenceLevel,
      );
    }
  }

  // ---- 3: explicit user target -------------------------------------------
  if (
    customTarget !== undefined &&
    customTarget > 0 &&
    rateComparable &&
    denominatorSeries?.present &&
    !stageSeries.snapshot
  ) {
    const aligned = alignedCompleteDays([stageSeries, denominatorSeries]);
    if (aligned.length < THRESHOLDS.minCompleteDays) {
      return unknown("insufficient_complete_days", displayComparison);
    }
    const recent = aligned.slice(-RECENT_WINDOW_DAYS);
    const numerator = sumOverDates(stageSeries, recent);
    const denominator = sumOverDates(denominatorSeries, recent);
    if (denominator < THRESHOLDS.minSampleForRateComparison) {
      return unknown("insufficient_sample", displayComparison);
    }

    const recentRate = numerator / denominator;
    const ratio = deteriorationRatio(recentRate, customTarget);
    if (ratio === null) {
      return unknown("no_baseline_available", displayComparison);
    }

    // Sample-aware: only a Wilson upper bound that still sits under the target
    // threshold counts as a real shortfall.
    const interval = wilsonInterval({ successes: numerator, trials: denominator });
    const significantCritical =
      interval.upper < customTarget * THRESHOLDS.criticalDeteriorationFactor;
    const significantWatch =
      interval.upper < customTarget * THRESHOLDS.watchDeteriorationFactor;

    const health: StageHealth = significantCritical
      ? "critical"
      : significantWatch
        ? "watch"
        : "healthy";

    return applyConfidenceGate(
      {
        health,
        comparisonType: displayComparison,
        baselineMethod: "explicit_target",
        benchmark: customTarget,
        sampleSize: denominator,
        recentLabel: "Observed conversion",
        baselineLabel: "Your target",
        recentValue: recentRate,
        baselineValue: customTarget,
        deteriorationPercent: (1 - ratio) * 100,
        interval,
        baselineWindow: windowBounds(recent),
        readinessReason:
          health === "healthy" ? "target_met_or_indistinguishable" : undefined,
      },
      confidenceLevel,
    );
  }

  if (rateComparable && !denominatorSeries?.present) {
    return unknown("denominator_missing", displayComparison);
  }
  if (denominatorRelationship === "aggregate_directional") {
    return unknown("aggregate_not_classifiable", displayComparison);
  }
  if (stageSeries.snapshot) {
    return unknown("snapshot_not_comparable", displayComparison);
  }
  return unknown("insufficient_complete_days", displayComparison);
}

/**
 * The plan requires confidence >= medium before a constraint is called
 * critical. A low-confidence deterioration is still surfaced, but only as a
 * watch signal that cannot become the confirmed bottleneck.
 */
function applyConfidenceGate(
  classification: Classification,
  confidenceLevel: ConfidenceLevel,
): Classification {
  if (classification.health === "critical" && confidenceLevel === "low") {
    return {
      ...classification,
      health: "watch",
      readinessReason: "low_confidence_downgrade",
    };
  }
  return classification;
}

export function runDiagnosis(input: EngineInput): DiagnosisRunResult {
  const { metrics, now, customTargets } = input;
  const platform = input.platform ?? "iOS";
  const definitions = stageDefinitionsFor(platform);
  const window = diagnosisWindow(now);
  const confidence = computeConfidence(metrics, now);
  const hash = inputHash(metrics, now, platform);
  const series = buildSeries(metrics);

  const stages: DiagnosisStageResult[] = [];
  const limitations: string[] = [];
  const missingRequirements: string[] = [];
  /**
   * Carries classification detail from stage evaluation to insight authoring.
   * Scoped to this call so the engine stays pure and reentrant.
   */
  const classificationByStage = new Map<AnyStageId, Classification>();

  const topSeries = series.get(
    seriesKey(definitions[0].source, definitions[0].metricKey),
  );
  const topValue = seriesWindowValue(topSeries);

  let previousValue = 0;
  let previousPresent = false;

  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const stageSeries = series.get(seriesKey(definition.source, definition.metricKey));
    const denominatorSeries = definition.validDenominator
      ? series.get(
          seriesKey(
            definition.validDenominator.source,
            definition.validDenominator.metricKey,
          ),
        )
      : undefined;

    const present = Boolean(stageSeries?.present);
    const value = seriesWindowValue(stageSeries);
    // A missing metric is unknown, never zero. Only a provider that covered the
    // window and reported nothing produces an explicit zero.
    const valueState = !present ? "missing" : value === 0 ? "explicit_zero" : "measured";

    if (!present) {
      missingRequirements.push(
        `Missing data for stage: ${definition.label} (${definition.source})`,
      );
    } else if (isStale(stageSeries, now)) {
      limitations.push(
        `${definition.label} data from ${definition.source} is older than ${THRESHOLDS.staleSeriesHours}h`,
      );
    }

    const classification = classifyStage({
      definition,
      stageSeries,
      denominatorSeries,
      customTarget: customTargets?.[definition.id],
      now,
      confidenceLevel: confidence.level,
    });

    // Display-only ratio against the previous stage. Never the basis for health
    // when the two stages come from different providers.
    const conversionRate =
      index > 0 && present && previousPresent && previousValue > 0
        ? Math.max(0, Math.min(1, value / previousValue))
        : null;

    const flowWidth = Math.round(
      Math.max(30, 155 * Math.sqrt(value / Math.max(topValue, value, 1))),
    );

    stages.push({
      id: definition.id,
      label: definition.label,
      value,
      valueState,
      formattedValue: valueState === "missing" ? "—" : compactNumber(value),
      conversionRate,
      health: classification.health,
      source: definition.source,
      flowWidth,
      benchmark: classification.benchmark,
      baselineMethod: classification.baselineMethod,
      baselineWindow: classification.baselineWindow ?? null,
      comparisonType: classification.comparisonType,
      // The displayed ratio is described independently of the classification:
      // a stage may be judged on its own volume over time while the ratio drawn
      // next to it still mixes two providers' aggregates.
      ratioComparisonType: definition.validDenominator
        ? (definition.validDenominator.relationship as ComparisonType)
        : "not_comparable",
      readinessReason: classification.readinessReason,
      sampleSize: classification.sampleSize,
      confidence: confidence.level,
      evidenceIds: [],
    });

    previousValue = value;
    previousPresent = present;

    if (classification.readinessReason === "insufficient_sample") {
      limitations.push(
        `${definition.label} sample below ${THRESHOLDS.minSampleForRateComparison} required observations`,
      );
    }
    if (classification.readinessReason === "insufficient_complete_days") {
      limitations.push(
        `${definition.label} has fewer than ${THRESHOLDS.minCompleteDays} complete days`,
      );
    }
    if (definition.validDenominator?.relationship === "aggregate_directional") {
      limitations.push(
        `${definition.label} ratio mixes sources and is directional only`,
      );
    }

    classificationByStage.set(definition.id, classification);
  }

  const evidence: DiagnosisEvidenceItem[] = [];
  const insights: DiagnosisInsightItem[] = [];
  const actionProposals: DiagnosisActionProposalItem[] = [];

  /**
   * Only a same-source funnel or cohort comparison, or the stage's own volume
   * over time, may back an insight. Cross-source aggregate ratios are shown but
   * never confirmed — there is no fallback that re-admits them.
   */
  const eligible = stages.filter(
    (stage) =>
      stage.comparisonType !== "aggregate_directional" &&
      stage.valueState !== "missing" &&
      (stage.health === "critical" || stage.health === "watch"),
  );

  // Earliest valid constraint wins rank 1; rank 1 is reserved for a confirmed
  // critical deterioration so downstream readiness can trust it.
  const confirmed = eligible.find((stage) => stage.health === "critical");

  if (confirmed) {
    addDiagnosisInsight({
      stage: confirmed,
      classification: classificationByStage.get(confirmed.id),
      rank: 1,
      kind: "Derived",
      evidence,
      insights,
      actionProposals,
      window,
    });
  }

  for (const stage of eligible) {
    if (insights.length >= THRESHOLDS.maxRankedInsights) break;
    if (confirmed && stage.id === confirmed.id) continue;
    addDiagnosisInsight({
      stage,
      classification: classificationByStage.get(stage.id),
      rank: Math.max(2, insights.length + 1),
      kind: "Observed",
      evidence,
      insights,
      actionProposals,
      window,
    });
  }

  const actionPlans = actionProposals.map((ap) => ap.actionPlan);
  const anyClassified = stages.some((stage) => stage.health !== "unknown");

  const status = !metrics.length || !anyClassified
    ? "not_ready"
    : confirmed
      ? "ready"
      : "no_confirmed_issue";

  return {
    version: DIAGNOSIS_VERSION,
    status,
    window,
    confidence,
    platform,
    stages,
    evidence,
    insights,
    actionProposals,
    actionPlans,
    inputHash: hash,
    limitations: [...new Set(limitations)],
    missingRequirements,
  };
}

function addDiagnosisInsight(params: {
  stage: DiagnosisStageResult;
  classification?: Classification;
  rank: number;
  kind: "Observed" | "Derived" | "Hypothesis";
  evidence: DiagnosisEvidenceItem[];
  insights: DiagnosisInsightItem[];
  actionProposals: DiagnosisActionProposalItem[];
  window: { from: string; to: string };
}) {
  const { stage, classification, rank, kind, evidence, insights, actionProposals, window } =
    params;

  const evId = `ev_${stage.id}_${rank}`;
  const insightId = `ins_${stage.id}_${rank}`;
  const proposalId = `prop_${stage.id}_${rank}`;

  const isRate = classification?.comparisonType !== "time_baseline";
  const format = (value: number | undefined) => {
    if (value === undefined) return "unavailable";
    return isRate ? formatRate(value) : compactNumber(value);
  };

  const recentText = format(classification?.recentValue);
  const baselineText = format(classification?.baselineValue);
  const dropText =
    classification?.deteriorationPercent !== undefined
      ? `${classification.deteriorationPercent.toFixed(1)}%`
      : "an unquantified amount";

  const intervalText = classification?.interval
    ? ` (95% interval ${formatRate(classification.interval.lower)} to ${formatRate(classification.interval.upper)})`
    : "";

  const baselineSourceText =
    classification?.baselineMethod === "explicit_target"
      ? "the target you set"
      : classification?.baselineMethod === "previous_window"
        ? "the previous comparable window"
        : "this product's own earlier history";

  evidence.push({
    id: evId,
    provider: stage.source,
    title: `${stage.label} declined against ${baselineSourceText}`,
    finding:
      `${stage.label} moved from ${baselineText} to ${recentText}, a ${dropText} decline against ` +
      `${baselineSourceText}. Measured from ${stage.source} over ` +
      `${stage.sampleSize ?? 0} observations${intervalText}.`,
    metricKeys: [stage.id],
    windowFrom: classification?.baselineWindow?.from ?? window.from,
    windowTo: window.to,
    confidence: stage.confidence,
    before: { label: classification?.baselineLabel ?? "Baseline", value: baselineText },
    after: { label: classification?.recentLabel ?? "Recent", value: recentText },
  });

  stage.evidenceIds.push(evId);

  const confirmed = rank === 1 && stage.health === "critical";

  insights.push({
    id: insightId,
    title: confirmed
      ? `Fix the ${stage.label.toLowerCase()} constraint`
      : `Watch the ${stage.label.toLowerCase()} stage`,
    summary: confirmed
      ? `Confirmed constraint at ${stage.label}: ${recentText} vs ${baselineText} from ${baselineSourceText}.`
      : `Early warning at ${stage.label}: ${recentText} vs ${baselineText} from ${baselineSourceText}. Not yet a confirmed bottleneck.`,
    kind,
    stageId: stage.id,
    evidenceIds: [evId],
    confidence: stage.confidence,
    impact: confirmed ? "high" : "medium",
    effort: "medium",
    rank,
  });

  const actionPlan = buildActionPlan({
    stageId: stage.id,
    stageLabel: stage.label,
    sourceProvider: stage.source,
    observedRate: classification?.recentValue ?? stage.conversionRate,
    benchmarkRate: classification?.baselineValue,
    evidenceIds: [evId],
    minimumSample: stage.sampleSize,
    minimumCompleteDays: THRESHOLDS.minCompleteDays,
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
