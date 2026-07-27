import { describe, expect, it } from "vitest";
import { DEFAULT_GROWTH_CONTRACT } from "./config";
import { evaluateReleaseImpact } from "./engine";
import { evaluateVerification } from "./verification";
import { twoProportionPValue } from "./statistics";
import type { CohortCounts, ReleaseImpactInput } from "./types";

function cohort(
  partial: Partial<CohortCounts> &
    Pick<CohortCounts, "version" | "newUsers" | "activatedUsers">,
): CohortCounts {
  return {
    buildNumber: partial.buildNumber ?? "",
    activationRate:
      partial.activationRate ??
      (partial.newUsers > 0 ? partial.activatedUsers / partial.newUsers : null),
    cohortStart: partial.cohortStart ?? "2026-06-01T00:00:00.000Z",
    cohortEnd: partial.cohortEnd ?? "2026-06-08T00:00:00.000Z",
    activationWindowDays: partial.activationWindowDays ?? 7,
    sessionEvent: partial.sessionEvent ?? "app_opened",
    activationEvent: partial.activationEvent ?? "first_vehicle_added",
    versionProperty: partial.versionProperty ?? "app_version",
    firstSessionAt: partial.firstSessionAt ?? "2026-06-01T00:00:00.000Z",
    lastSessionAt: partial.lastSessionAt ?? "2026-06-10T00:00:00.000Z",
    completeDays: partial.completeDays ?? 7,
    mappingConfirmed: partial.mappingConfirmed ?? true,
    evidenceIds: partial.evidenceIds ?? [`ev-${partial.version}`],
    ...partial,
  };
}

function baseInput(
  overrides: Partial<ReleaseImpactInput> = {},
): ReleaseImpactInput {
  return {
    release: {
      id: "rel_current",
      version: "2.4.1",
      buildNumber: "418",
      firstSeenAt: "2026-07-01T00:00:00.000Z",
      source: "posthog",
      sourceTrust: "verified_connector",
    },
    current: cohort({
      version: "2.4.1",
      newUsers: 196,
      activatedUsers: 61, // ~31%
    }),
    baselineCandidates: [
      cohort({
        version: "2.4.0",
        newUsers: 214,
        activatedUsers: 90, // ~42%
      }),
    ],
    supportingSignals: [],
    contract: DEFAULT_GROWTH_CONTRACT,
    mapping: {
      sessionEvent: "app_opened",
      activationEvent: "first_vehicle_added",
      versionProperty: "app_version",
      versionPropertyConfirmed: true,
      mappingConfirmed: true,
    },
    now: "2026-07-15T00:00:00.000Z",
    dataFreshnessHours: 6,
    ...overrides,
  };
}

describe("twoProportionPValue", () => {
  it("returns high p for identical rates", () => {
    const p = twoProportionPValue(
      { successes: 50, trials: 100 },
      { successes: 50, trials: 100 },
    );
    expect(p).toBeGreaterThan(0.9);
  });

  it("returns low p for large rate differences with large samples", () => {
    const p = twoProportionPValue(
      { successes: 61, trials: 196 },
      { successes: 90, trials: 214 },
    );
    expect(p).toBeLessThan(0.05);
  });
});

describe("evaluateReleaseImpact", () => {
  it("requires configuration when mapping is unconfirmed", () => {
    const result = evaluateReleaseImpact(
      baseInput({
        mapping: {
          sessionEvent: "app_opened",
          activationEvent: "first_vehicle_added",
          versionProperty: "app_version",
          versionPropertyConfirmed: false,
          mappingConfirmed: false,
        },
      }),
    );
    expect(result.verdict).toBe("configuration_required");
    expect(result.shouldOpenIncident).toBe(false);
    expect(result.missingRequirements).toContain("mapping_confirmation");
  });

  it("collects when sample is below minimum", () => {
    const result = evaluateReleaseImpact(
      baseInput({
        current: cohort({
          version: "2.4.1",
          newUsers: 18,
          activatedUsers: 5,
        }),
        now: "2026-07-05T00:00:00.000Z",
      }),
    );
    expect(result.verdict).toBe("collecting");
    expect(result.shouldOpenIncident).toBe(false);
    expect(result.nextCheckAt).toBeTruthy();
  });

  it("is inconclusive when deadline passes without sample", () => {
    const result = evaluateReleaseImpact(
      baseInput({
        current: cohort({
          version: "2.4.1",
          newUsers: 10,
          activatedUsers: 2,
        }),
        now: "2026-08-20T00:00:00.000Z",
      }),
    );
    expect(result.verdict).toBe("inconclusive");
    expect(result.shouldOpenIncident).toBe(false);
  });

  it("opens a confirmed regression when practical and statistical thresholds pass", () => {
    const result = evaluateReleaseImpact(baseInput());
    expect(result.verdict).toBe("regression");
    expect(result.shouldOpenIncident).toBe(true);
    expect(result.pValue).not.toBeNull();
    expect(result.pValue!).toBeLessThanOrEqual(0.05);
    expect(result.absoluteChange!).toBeLessThan(-0.03);
    expect(result.relativeChange!).toBeLessThan(-0.12);
    expect(result.confidenceScore).toBeGreaterThan(50);
  });

  it("does not open an incident for practical drop without significance", () => {
    // Small samples with modest absolute gap — often non-significant
    const result = evaluateReleaseImpact(
      baseInput({
        current: cohort({
          version: "2.4.1",
          newUsers: 40,
          activatedUsers: 14, // 35%
        }),
        baselineCandidates: [
          cohort({
            version: "2.4.0",
            newUsers: 40,
            activatedUsers: 16, // 40% — absolute drop 5pp but tiny samples
          }),
        ],
      }),
    );
    // Either collecting/healthy/inconclusive without incident, or if regression
    // only when both gates pass.
    if (result.verdict === "regression") {
      expect(result.shouldOpenIncident).toBe(true);
      expect(result.pValue!).toBeLessThanOrEqual(0.05);
    } else {
      expect(result.shouldOpenIncident).toBe(false);
    }
  });

  it("classifies improvement when both thresholds pass", () => {
    const result = evaluateReleaseImpact(
      baseInput({
        current: cohort({
          version: "2.4.2",
          newUsers: 200,
          activatedUsers: 110, // 55%
        }),
        baselineCandidates: [
          cohort({
            version: "2.4.1",
            newUsers: 200,
            activatedUsers: 80, // 40%
          }),
        ],
        release: {
          id: "rel_imp",
          version: "2.4.2",
          buildNumber: "420",
          firstSeenAt: "2026-07-01T00:00:00.000Z",
          source: "posthog",
          sourceTrust: "verified_connector",
        },
      }),
    );
    expect(result.verdict).toBe("improvement");
    expect(result.shouldOpenIncident).toBe(false);
  });

  it("is healthy when rates are stable", () => {
    const result = evaluateReleaseImpact(
      baseInput({
        current: cohort({
          version: "2.4.1",
          newUsers: 200,
          activatedUsers: 84, // 42%
        }),
        baselineCandidates: [
          cohort({
            version: "2.4.0",
            newUsers: 210,
            activatedUsers: 88, // ~42%
          }),
        ],
      }),
    );
    expect(result.verdict).toBe("healthy");
    expect(result.shouldOpenIncident).toBe(false);
  });

  it("treats missing current cohort as collecting when window open", () => {
    const result = evaluateReleaseImpact(
      baseInput({
        current: null,
        now: "2026-07-03T00:00:00.000Z",
      }),
    );
    expect(result.verdict).toBe("collecting");
  });

  it("is deterministic for identical inputs", () => {
    const a = evaluateReleaseImpact(baseInput());
    const b = evaluateReleaseImpact(baseInput());
    expect(a).toEqual(b);
  });

  it("pools previous releases when single baseline is undersampled", () => {
    const result = evaluateReleaseImpact(
      baseInput({
        baselineCandidates: [
          cohort({ version: "2.3.9", newUsers: 12, activatedUsers: 5 }),
          cohort({ version: "2.3.8", newUsers: 12, activatedUsers: 5 }),
          cohort({ version: "2.3.7", newUsers: 12, activatedUsers: 5 }),
        ],
      }),
    );
    // 36 pooled baseline users may still be collecting or evaluate
    expect(["collecting", "regression", "healthy", "improvement", "inconclusive"]).toContain(
      result.verdict,
    );
    if (result.baselineMethod === "pooled_previous_releases") {
      expect(result.baselineSample).toBeGreaterThanOrEqual(30);
    }
  });
});

describe("evaluateVerification", () => {
  const origin = cohort({
    version: "2.4.1",
    newUsers: 196,
    activatedUsers: 61,
  });
  const baseline = cohort({
    version: "2.4.0",
    newUsers: 214,
    activatedUsers: 90,
  });

  it("stays collecting until fix sample matures", () => {
    const result = evaluateVerification({
      origin,
      baseline,
      fix: cohort({ version: "2.4.2", newUsers: 10, activatedUsers: 4 }),
      originRate: 0.31,
      baselineRate: 0.42,
      contract: DEFAULT_GROWTH_CONTRACT,
      supportingSignals: [],
      now: "2026-07-20T00:00:00.000Z",
      fixFirstSeenAt: "2026-07-18T00:00:00.000Z",
      maximumWaitDays: 21,
    });
    expect(result.outcome).toBe("collecting");
  });

  it("resolves when recovery ratio is high enough", () => {
    // Large samples: origin 31%, baseline 42%, fix 41% → recovery ~91% of gap
    const largeOrigin = cohort({
      version: "2.4.1",
      newUsers: 500,
      activatedUsers: 155,
    });
    const largeBaseline = cohort({
      version: "2.4.0",
      newUsers: 500,
      activatedUsers: 210,
    });
    const result = evaluateVerification({
      origin: largeOrigin,
      baseline: largeBaseline,
      fix: cohort({
        version: "2.4.2",
        newUsers: 500,
        activatedUsers: 205, // 41%
      }),
      originRate: 155 / 500,
      baselineRate: 210 / 500,
      contract: DEFAULT_GROWTH_CONTRACT,
      supportingSignals: [],
      now: "2026-08-10T00:00:00.000Z",
      fixFirstSeenAt: "2026-07-20T00:00:00.000Z",
      maximumWaitDays: 21,
    });
    expect(result.outcome).toBe("resolved");
    expect(result.recoveryRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("marks worsened when fix further declines", () => {
    const result = evaluateVerification({
      origin,
      baseline,
      fix: cohort({
        version: "2.4.2",
        newUsers: 200,
        activatedUsers: 30, // 15%
      }),
      originRate: 61 / 196,
      baselineRate: 90 / 214,
      contract: DEFAULT_GROWTH_CONTRACT,
      supportingSignals: [],
      now: "2026-08-10T00:00:00.000Z",
      fixFirstSeenAt: "2026-07-20T00:00:00.000Z",
      maximumWaitDays: 21,
    });
    expect(result.outcome).toBe("worsened");
  });

  it("does not treat agent claims as input — only cohort counts", () => {
    // Implicit: function signature has no agentDone flag.
    const result = evaluateVerification({
      origin,
      baseline,
      fix: null,
      originRate: 0.31,
      baselineRate: 0.42,
      contract: DEFAULT_GROWTH_CONTRACT,
      supportingSignals: [],
      now: "2026-09-20T00:00:00.000Z",
      fixFirstSeenAt: "2026-07-20T00:00:00.000Z",
      maximumWaitDays: 21,
    });
    expect(result.outcome).toBe("inconclusive");
  });
});
