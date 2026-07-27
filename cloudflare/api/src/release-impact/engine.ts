import { PRIMARY_METRIC_KEY } from "./config";
import { selectBaseline } from "./baseline";
import {
  absoluteChange,
  relativeChange,
  twoProportionPValue,
  wilsonInterval,
} from "./statistics";
import type {
  ConfidenceLevel,
  IncidentSeverity,
  ReleaseImpactInput,
  ReleaseImpactResult,
  ReleaseVerdict,
} from "./types";

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, (to - from) / (24 * 60 * 60 * 1000));
}

function addDays(iso: string, days: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString();
}

function confidenceLevel(score: number): ConfidenceLevel {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

function computeConfidenceScore(input: {
  mappingConfirmed: boolean;
  versionConfirmed: boolean;
  currentSample: number;
  baselineSample: number;
  minimumSample: number;
  pValue: number | null;
  practicalMet: boolean;
  statisticalMet: boolean;
  freshnessHours: number | null;
  sameSource: boolean;
}): number {
  let score = 0;
  if (input.mappingConfirmed) score += 18;
  if (input.versionConfirmed) score += 18;
  if (input.sameSource) score += 12;

  const sampleRatio = Math.min(
    1,
    Math.min(input.currentSample, input.baselineSample) /
      Math.max(1, input.minimumSample),
  );
  score += Math.round(sampleRatio * 22);

  if (input.freshnessHours !== null) {
    if (input.freshnessHours <= 12) score += 10;
    else if (input.freshnessHours <= 36) score += 6;
    else if (input.freshnessHours <= 72) score += 3;
  }

  if (input.practicalMet && input.statisticalMet) score += 15;
  else if (input.practicalMet || input.statisticalMet) score += 6;

  if (input.pValue !== null) {
    if (input.pValue <= 0.01) score += 5;
    else if (input.pValue <= 0.05) score += 3;
  }

  return Math.max(0, Math.min(100, score));
}

function severityFor(
  absolute: number,
  relative: number,
  confidence: number,
): IncidentSeverity {
  const abs = Math.abs(absolute);
  const rel = Math.abs(relative);
  if ((abs >= 0.1 || rel >= 0.3) && confidence >= 70) return "critical";
  if ((abs >= 0.05 || rel >= 0.18) && confidence >= 55) return "important";
  return "watch";
}

function formatPct(rate: number | null): string {
  if (rate === null) return "n/a";
  return `${Math.round(rate * 1000) / 10}%`;
}

/**
 * Pure release-impact engine. Deterministic for identical inputs.
 */
export function evaluateReleaseImpact(
  input: ReleaseImpactInput,
): ReleaseImpactResult {
  const limitations: string[] = [];
  const missingRequirements: string[] = [];
  const evidence: Array<Record<string, unknown>> = [];

  const mappingOk =
    Boolean(input.mapping.sessionEvent) &&
    Boolean(input.mapping.activationEvent) &&
    input.mapping.mappingConfirmed;
  const versionOk =
    Boolean(input.mapping.versionProperty) &&
    input.mapping.versionPropertyConfirmed;

  if (!mappingOk || !versionOk) {
    if (!input.mapping.sessionEvent) {
      missingRequirements.push("session_event");
    }
    if (!input.mapping.activationEvent) {
      missingRequirements.push("activation_event");
    }
    if (!input.mapping.mappingConfirmed) {
      missingRequirements.push("mapping_confirmation");
    }
    if (!input.mapping.versionProperty) {
      missingRequirements.push("version_property");
    }
    if (!input.mapping.versionPropertyConfirmed) {
      missingRequirements.push("version_property_confirmation");
    }
    return {
      verdict: "configuration_required",
      primaryMetricKey: PRIMARY_METRIC_KEY,
      baselineMethod: "none",
      baseline: null,
      current: input.current,
      baselineValue: null,
      currentValue: null,
      absoluteChange: null,
      relativeChange: null,
      baselineSample: 0,
      currentSample: input.current?.newUsers ?? 0,
      pValue: null,
      confidenceScore: 0,
      confidenceLevel: "low",
      evidence,
      supportingSignals: input.supportingSignals,
      limitations: [
        "Required session, activation, or version mapping is missing or unconfirmed.",
      ],
      missingRequirements,
      nextCheckAt: null,
      severity: null,
      shouldOpenIncident: false,
      stageId: "activate",
      title: "Measurement configuration required",
      summary:
        "AppClimb cannot evaluate this release until session, activation, and version mappings are confirmed.",
    };
  }

  const current = input.current;
  const collectionDeadline = addDays(
    input.release.firstSeenAt,
    input.contract.maximumCollectionDays + input.contract.activationWindowDays,
  );
  const collectionOpen = Date.parse(input.now) < Date.parse(collectionDeadline);
  const minSample = input.contract.minimumNewUsers;

  if (!current || current.newUsers < minSample) {
    const sample = current?.newUsers ?? 0;
    if (collectionOpen) {
      return {
        verdict: "collecting",
        primaryMetricKey: PRIMARY_METRIC_KEY,
        baselineMethod: "none",
        baseline: null,
        current,
        baselineValue: null,
        currentValue: current?.activationRate ?? null,
        absoluteChange: null,
        relativeChange: null,
        baselineSample: 0,
        currentSample: sample,
        pValue: null,
        confidenceScore: computeConfidenceScore({
          mappingConfirmed: true,
          versionConfirmed: true,
          currentSample: sample,
          baselineSample: 0,
          minimumSample: minSample,
          pValue: null,
          practicalMet: false,
          statisticalMet: false,
          freshnessHours: input.dataFreshnessHours,
          sameSource: true,
        }),
        confidenceLevel: "low",
        evidence: [
          {
            kind: "sample_progress",
            currentSample: sample,
            minimumSample: minSample,
          },
        ],
        supportingSignals: input.supportingSignals,
        limitations: [
          `Need ${minSample} mature new users; collected ${sample}.`,
          "Missing cohort counts are missing evidence, not zero.",
        ],
        missingRequirements: [],
        nextCheckAt: addDays(input.now, 1),
        severity: null,
        shouldOpenIncident: false,
        stageId: "activate",
        title: `Evaluating ${input.release.version}`,
        summary: `${sample} of ${minSample} mature new users collected. Next check after the activation window matures.`,
      };
    }

    return {
      verdict: "inconclusive",
      primaryMetricKey: PRIMARY_METRIC_KEY,
      baselineMethod: "none",
      baseline: null,
      current,
      baselineValue: null,
      currentValue: current?.activationRate ?? null,
      absoluteChange: null,
      relativeChange: null,
      baselineSample: 0,
      currentSample: sample,
      pValue: null,
      confidenceScore: 25,
      confidenceLevel: "low",
      evidence: [],
      supportingSignals: input.supportingSignals,
      limitations: [
        "Collection deadline passed without enough mature new users.",
      ],
      missingRequirements: [],
      nextCheckAt: null,
      severity: null,
      shouldOpenIncident: false,
      stageId: "activate",
      title: `Not enough evidence for ${input.release.version}`,
      summary:
        "Not enough mature users to evaluate this release reliably.",
    };
  }

  if (current.completeDays < input.contract.minimumCompleteDays && collectionOpen) {
    limitations.push(
      `Fewer than ${input.contract.minimumCompleteDays} complete UTC days observed.`,
    );
    return {
      verdict: "collecting",
      primaryMetricKey: PRIMARY_METRIC_KEY,
      baselineMethod: "none",
      baseline: null,
      current,
      baselineValue: null,
      currentValue: current.activationRate,
      absoluteChange: null,
      relativeChange: null,
      baselineSample: 0,
      currentSample: current.newUsers,
      pValue: null,
      confidenceScore: 35,
      confidenceLevel: "low",
      evidence: [],
      supportingSignals: input.supportingSignals,
      limitations,
      missingRequirements: [],
      nextCheckAt: addDays(input.now, 1),
      severity: null,
      shouldOpenIncident: false,
      stageId: "activate",
      title: `Evaluating ${input.release.version}`,
      summary: "Waiting for enough complete days in the mature cohort window.",
    };
  }

  const baselineSelection = selectBaseline(
    current,
    input.baselineCandidates,
    input.contract,
  );
  limitations.push(...baselineSelection.limitations);
  const baseline = baselineSelection.baseline;

  if (!baseline || baseline.newUsers < minSample) {
    if (collectionOpen) {
      return {
        verdict: "collecting",
        primaryMetricKey: PRIMARY_METRIC_KEY,
        baselineMethod: baselineSelection.method,
        baseline,
        current,
        baselineValue: baseline?.activationRate ?? null,
        currentValue: current.activationRate,
        absoluteChange: null,
        relativeChange: null,
        baselineSample: baseline?.newUsers ?? 0,
        currentSample: current.newUsers,
        pValue: null,
        confidenceScore: 40,
        confidenceLevel: "low",
        evidence: [],
        supportingSignals: input.supportingSignals,
        limitations: [
          ...limitations,
          "Compatible baseline sample is still below the minimum.",
        ],
        missingRequirements: [],
        nextCheckAt: addDays(input.now, 1),
        severity: null,
        shouldOpenIncident: false,
        stageId: "activate",
        title: `Evaluating ${input.release.version}`,
        summary: "Waiting for a compatible baseline cohort with enough sample.",
      };
    }
    return {
      verdict: "inconclusive",
      primaryMetricKey: PRIMARY_METRIC_KEY,
      baselineMethod: baselineSelection.method,
      baseline,
      current,
      baselineValue: baseline?.activationRate ?? null,
      currentValue: current.activationRate,
      absoluteChange: null,
      relativeChange: null,
      baselineSample: baseline?.newUsers ?? 0,
      currentSample: current.newUsers,
      pValue: null,
      confidenceScore: 30,
      confidenceLevel: "low",
      evidence: [],
      supportingSignals: input.supportingSignals,
      limitations: [
        ...limitations,
        "No compatible baseline with enough sample before the collection deadline.",
      ],
      missingRequirements: [],
      nextCheckAt: null,
      severity: null,
      shouldOpenIncident: false,
      stageId: "activate",
      title: `Inconclusive release ${input.release.version}`,
      summary: "Could not form a reliable baseline for this release.",
    };
  }

  const currentRate = current.activationRate;
  const baselineRate = baseline.activationRate;
  const abs = absoluteChange(currentRate, baselineRate);
  const rel = relativeChange(currentRate, baselineRate);
  const pValue = twoProportionPValue(
    { successes: current.activatedUsers, trials: current.newUsers },
    { successes: baseline.activatedUsers, trials: baseline.newUsers },
  );
  const wilsonCurrent = wilsonInterval({
    successes: current.activatedUsers,
    trials: current.newUsers,
  });
  const wilsonBaseline = wilsonInterval({
    successes: baseline.activatedUsers,
    trials: baseline.newUsers,
  });

  evidence.push({
    kind: "activation_rate_comparison",
    trust: "verified_connector",
    baselineRate,
    currentRate,
    absoluteChange: abs,
    relativeChange: rel,
    pValue,
    wilsonCurrent,
    wilsonBaseline,
    baselineMethod: baselineSelection.method,
    evidenceIds: [...current.evidenceIds, ...baseline.evidenceIds],
  });

  const reg = input.contract.regression;
  const imp = input.contract.improvement;

  const practicalRegression =
    abs !== null &&
    rel !== null &&
    abs <= -reg.minimumAbsoluteDrop &&
    rel <= -reg.minimumRelativeDrop;
  const statisticalRegression = pValue <= reg.pValueThreshold;

  const practicalImprovement =
    abs !== null &&
    rel !== null &&
    abs >= imp.minimumAbsoluteGain &&
    rel >= imp.minimumRelativeGain;
  const statisticalImprovement = pValue <= imp.pValueThreshold;

  let verdict: ReleaseVerdict = "healthy";
  let shouldOpenIncident = false;
  let title = `No material regression detected in ${input.release.version}`;
  let summary = `Activation ${formatPct(baselineRate)} → ${formatPct(currentRate)} with no confirmed material regression.`;

  if (practicalRegression && statisticalRegression) {
    // Confirmed regression requires verified connector trust on the primary cohort.
    if (input.release.sourceTrust === "verified_connector" || current.mappingConfirmed) {
      verdict = "regression";
      shouldOpenIncident = true;
      title = `Activation regressed after ${input.release.version}`;
      summary = `${formatPct(baselineRate)} → ${formatPct(currentRate)} · ${baseline.newUsers} vs ${current.newUsers} users`;
    } else {
      limitations.push(
        "Observed decline did not meet verified_connector trust for a confirmed incident.",
      );
      verdict = "healthy";
    }
  } else if (practicalImprovement && statisticalImprovement) {
    verdict = "improvement";
    title = `Activation improved after ${input.release.version}`;
    summary = `${formatPct(baselineRate)} → ${formatPct(currentRate)} · ${baseline.newUsers} vs ${current.newUsers} users`;
  } else {
    if (practicalRegression && !statisticalRegression) {
      limitations.push(
        "Practical decline observed but not statistically significant at the configured threshold.",
      );
    }
    if (statisticalRegression && !practicalRegression) {
      limitations.push(
        "Statistical difference observed but absolute/relative change is below the practical threshold.",
      );
    }
  }

  for (const signal of input.supportingSignals) {
    if (signal.direction === "supports_regression" && verdict === "regression") {
      limitations.push(signal.note);
    } else if (signal.key.startsWith("revenuecat")) {
      limitations.push(
        "RevenueCat trends are temporally aligned when shown; they do not establish release-level causality.",
      );
    }
  }

  // Deduplicate limitations
  const uniqueLimitations = [...new Set(limitations)];

  const confScore = computeConfidenceScore({
    mappingConfirmed: true,
    versionConfirmed: true,
    currentSample: current.newUsers,
    baselineSample: baseline.newUsers,
    minimumSample: minSample,
    pValue,
    practicalMet: practicalRegression || practicalImprovement,
    statisticalMet: statisticalRegression || statisticalImprovement,
    freshnessHours: input.dataFreshnessHours,
    sameSource: true,
  });

  const severity =
    verdict === "regression"
      ? severityFor(abs ?? 0, rel ?? 0, confScore)
      : null;

  // Age of release only used for optional note
  void daysBetween(input.release.firstSeenAt, input.now);

  return {
    verdict,
    primaryMetricKey: PRIMARY_METRIC_KEY,
    baselineMethod: baselineSelection.method,
    baseline,
    current,
    baselineValue: baselineRate,
    currentValue: currentRate,
    absoluteChange: abs,
    relativeChange: rel,
    baselineSample: baseline.newUsers,
    currentSample: current.newUsers,
    pValue,
    confidenceScore: confScore,
    confidenceLevel: confidenceLevel(confScore),
    evidence,
    supportingSignals: input.supportingSignals,
    limitations: uniqueLimitations,
    missingRequirements: [],
    nextCheckAt: null,
    severity,
    shouldOpenIncident,
    stageId: "activate",
    title,
    summary,
  };
}
