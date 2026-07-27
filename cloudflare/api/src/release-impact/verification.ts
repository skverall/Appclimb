import {
  absoluteChange,
  relativeChange,
  twoProportionPValue,
} from "./statistics";
import type { VerificationInput, VerificationResult } from "./types";

function addDays(iso: string, days: number): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString();
}

function confidenceLevel(score: number): VerificationResult["confidenceLevel"] {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

/**
 * Compare a fix release against the broken origin (and original baseline).
 * Agent "done" claims never call this — only mature cohort evidence does.
 */
export function evaluateVerification(
  input: VerificationInput,
): VerificationResult {
  const limitations: string[] = [];
  const minSample = input.contract.minimumNewUsers;
  const deadline = addDays(input.fixFirstSeenAt, input.maximumWaitDays);
  const open = Date.parse(input.now) < Date.parse(deadline);

  const fix = input.fix;
  if (!fix || fix.newUsers < minSample) {
    if (open) {
      return {
        outcome: "collecting",
        fixRate: fix?.activationRate ?? null,
        originRate: input.originRate,
        baselineRate: input.baselineRate,
        absoluteChangeVsOrigin: null,
        relativeChangeVsOrigin: null,
        recoveryRatio: null,
        pValueVsOrigin: null,
        currentSample: fix?.newUsers ?? 0,
        confidenceScore: 30,
        confidenceLevel: "low",
        limitations: [
          `Need ${minSample} mature new users on the fix release; collected ${fix?.newUsers ?? 0}.`,
        ],
        guardrailBreached: false,
        nextCheckAt: addDays(input.now, 1),
        summary: "Collecting mature fix-release cohort for verification.",
      };
    }
    return {
      outcome: "inconclusive",
      fixRate: fix?.activationRate ?? null,
      originRate: input.originRate,
      baselineRate: input.baselineRate,
      absoluteChangeVsOrigin: null,
      relativeChangeVsOrigin: null,
      recoveryRatio: null,
      pValueVsOrigin: null,
      currentSample: fix?.newUsers ?? 0,
      confidenceScore: 25,
      confidenceLevel: "low",
      limitations: ["Verification deadline passed without enough sample."],
      guardrailBreached: false,
      nextCheckAt: null,
      summary: "Not enough evidence to verify the fix release.",
    };
  }

  const fixRate = fix.activationRate;
  const abs = absoluteChange(fixRate, input.originRate);
  const rel = relativeChange(fixRate, input.originRate);
  const pValue = twoProportionPValue(
    { successes: fix.activatedUsers, trials: fix.newUsers },
    {
      successes: input.origin.activatedUsers,
      trials: input.origin.newUsers,
    },
  );

  const lostGap =
    input.baselineRate !== null
      ? Math.max(0, input.baselineRate - input.originRate)
      : null;
  const recovered =
    fixRate !== null && input.baselineRate !== null
      ? fixRate - input.originRate
      : null;
  const recoveryRatio =
    lostGap !== null && lostGap > 0 && recovered !== null
      ? recovered / lostGap
      : null;

  let guardrailBreached = false;
  for (const signal of input.supportingSignals) {
    if (
      signal.relativeChange !== null &&
      signal.relativeChange <=
        -input.contract.guardrails.trialToPaid.maximumRelativeDrop &&
      (signal.key.includes("trial") || signal.key.includes("renewal"))
    ) {
      guardrailBreached = true;
      limitations.push(
        `Guardrail ${signal.key} regressed beyond the allowed relative drop.`,
      );
    }
  }

  const practicalGain =
    abs !== null &&
    abs >= input.contract.improvement.minimumAbsoluteGain &&
    rel !== null &&
    rel >= input.contract.improvement.minimumRelativeGain;
  const statistical =
    pValue <= input.contract.improvement.pValueThreshold;

  const worsened =
    abs !== null &&
    rel !== null &&
    abs <= -input.contract.regression.minimumAbsoluteDrop &&
    rel <= -input.contract.regression.minimumRelativeDrop &&
    pValue <= input.contract.regression.pValueThreshold;

  let outcome: VerificationResult["outcome"] = "no_effect";
  let summary = "Fix release showed no meaningful improvement versus the broken release.";

  if (worsened) {
    outcome = "worsened";
    summary = "Fix release further deteriorated the primary metric.";
  } else if (practicalGain && statistical && !guardrailBreached) {
    if (
      recoveryRatio !== null &&
      recoveryRatio >= input.contract.verificationRecoveryRatio
    ) {
      outcome = "resolved";
      summary =
        "Fix release recovered at least 80% of the lost activation gap with no material guardrail regression.";
    } else {
      outcome = "partial";
      summary =
        "Fix release improved activation versus the broken release but did not fully recover the lost gap.";
      if (recoveryRatio === null) {
        limitations.push(
          "Could not compute recovery ratio without a stable original baseline rate.",
        );
      }
    }
  } else if (practicalGain && statistical && guardrailBreached) {
    outcome = "partial";
    summary =
      "Primary metric improved but a guardrail regressed, so the incident is not fully resolved.";
  } else {
    if (practicalGain && !statistical) {
      limitations.push(
        "Observed improvement did not meet the statistical significance threshold.",
      );
    }
    outcome = "no_effect";
  }

  const confScore = Math.min(
    100,
    40 +
      Math.min(30, Math.floor(fix.newUsers / 5)) +
      (statistical ? 15 : 0) +
      (practicalGain ? 15 : 0),
  );

  return {
    outcome,
    fixRate,
    originRate: input.originRate,
    baselineRate: input.baselineRate,
    absoluteChangeVsOrigin: abs,
    relativeChangeVsOrigin: rel,
    recoveryRatio,
    pValueVsOrigin: pValue,
    currentSample: fix.newUsers,
    confidenceScore: confScore,
    confidenceLevel: confidenceLevel(confScore),
    limitations: [...new Set(limitations)],
    guardrailBreached,
    nextCheckAt: null,
    summary,
  };
}
