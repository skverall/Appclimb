import { describe, expect, it } from "vitest";
import { DIAGNOSIS_VERSION, THRESHOLDS } from "./config";
import { inputHash, runDiagnosis } from "./engine";
import type { DiagnosisMetric, DiagnosisProvider } from "./types";

const NOW = new Date("2026-07-27T12:00:00Z");
/** Last complete UTC day before NOW. */
const END = "2026-07-26";

function dayList(count: number, endDate: string): string[] {
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Array.from({ length: count }, (_, index) =>
    new Date(end - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10),
  );
}

function series(params: {
  key: string;
  provider: DiagnosisProvider;
  values: number[];
  endDate?: string;
  completeness?: number | number[];
  unit?: DiagnosisMetric["unit"];
}): DiagnosisMetric[] {
  const days = dayList(params.values.length, params.endDate ?? END);
  return params.values.map((value, index) => ({
    provider: params.provider,
    key: params.key,
    occurredAt: `${days[index]}T00:00:00.000Z`,
    value,
    unit: params.unit ?? "count",
    freshnessHours: 1,
    completeness: Array.isArray(params.completeness)
      ? params.completeness[index]
      : (params.completeness ?? 1),
  }));
}

/** 28 complete days of App Store impressions at a steady 1,000/day. */
function steadyImpressions(count = 28, endDate = END): DiagnosisMetric[] {
  return series({
    key: "impressions",
    provider: "app-store-connect",
    values: Array(count).fill(1000),
    endDate,
  });
}

function stage(result: ReturnType<typeof runDiagnosis>, id: string) {
  const found = result.stages.find((item) => item.id === id);
  if (!found) throw new Error(`stage ${id} missing from result`);
  return found;
}

describe("diagnosis engine — readiness of the input", () => {
  it("reports not_ready with no metrics at all", () => {
    const result = runDiagnosis({ metrics: [], now: NOW });

    expect(result.status).toBe("not_ready");
    expect(result.insights).toHaveLength(0);
    expect(result.evidence).toHaveLength(0);
    expect(result.stages).toHaveLength(8);
  });

  it("treats a missing metric as unknown, never as zero", () => {
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: Array(28).fill(100),
        }),
      ],
      now: NOW,
    });

    const install = stage(result, "install");
    expect(install.valueState).toBe("missing");
    expect(install.formattedValue).toBe("—");
    expect(install.health).toBe("unknown");
    expect(install.readinessReason).toBe("metric_missing");
    expect(result.missingRequirements.join(" ")).toContain("Install");
  });

  it("distinguishes an explicit provider zero from a missing metric", () => {
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: Array(28).fill(0),
        }),
      ],
      now: NOW,
    });

    const store = stage(result, "store");
    expect(store.valueState).toBe("explicit_zero");
    expect(store.value).toBe(0);
    expect(store.formattedValue).toBe("0");
    // A genuine zero is data, but with a zero baseline there is nothing to
    // compare against, so it must not be reported as a deterioration.
    expect(store.health).toBe("unknown");
  });

  it("blocks a comparison when the two series cover different days", () => {
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(28, "2026-07-26"),
        // Page views only exist for an older, non-overlapping stretch.
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: Array(10).fill(100),
          endDate: "2026-06-20",
        }),
      ],
      now: NOW,
    });

    const store = stage(result, "store");
    expect(store.health).toBe("unknown");
    expect(store.readinessReason).toBe("window_mismatch");
  });

  it("excludes incomplete days from the comparison", () => {
    // 28 days present, but every day is only partially reported.
    const incomplete = Array(28).fill(0.4);
    const result = runDiagnosis({
      metrics: [
        ...series({
          key: "impressions",
          provider: "app-store-connect",
          values: Array(28).fill(1000),
          completeness: incomplete,
        }),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: [...Array(14).fill(100), ...Array(14).fill(20)],
          completeness: incomplete,
        }),
      ],
      now: NOW,
    });

    const store = stage(result, "store");
    expect(store.health).toBe("unknown");
    expect(store.readinessReason).toBe("insufficient_complete_days");
    expect(result.status).toBe("not_ready");
  });

  it("refuses to classify stale data", () => {
    // Newest point is 10 days old, well past the staleness threshold.
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(28, "2026-07-16"),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: [...Array(14).fill(100), ...Array(14).fill(20)],
          endDate: "2026-07-16",
        }),
      ],
      now: NOW,
    });

    expect(stage(result, "store").readinessReason).toBe("stale_data");
    expect(result.limitations.join(" ")).toContain("older than");
    expect(result.status).toBe("not_ready");
  });

  it("will not call a low-volume stage critical", () => {
    // A 50% relative drop, but only a handful of observations behind it.
    const result = runDiagnosis({
      metrics: [
        ...series({
          key: "impressions",
          provider: "app-store-connect",
          values: Array(28).fill(1),
        }),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: [...Array(14).fill(1), ...Array(14).fill(0)],
        }),
      ],
      now: NOW,
    });

    const store = stage(result, "store");
    expect(store.health).not.toBe("critical");
    expect(store.readinessReason).toBe("insufficient_sample");
  });

  it("enforces the minimum denominator for a rate comparison", () => {
    // 29 impressions per window: one short of the configured minimum of 30.
    const perWindow = THRESHOLDS.minSampleForRateComparison - 1;
    const daily = Array(28).fill(perWindow / 14);
    const result = runDiagnosis({
      metrics: [
        ...series({ key: "impressions", provider: "app-store-connect", values: daily }),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: daily.map((value, index) => (index < 14 ? value : value / 4)),
        }),
      ],
      now: NOW,
    });

    expect(stage(result, "store").readinessReason).toBe("insufficient_sample");
  });
});

describe("diagnosis engine — classification against the product's own baseline", () => {
  it("confirms a real deterioration against the previous comparable window", () => {
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          // 10% for two weeks, then 5%.
          values: [...Array(14).fill(100), ...Array(14).fill(50)],
        }),
      ],
      now: NOW,
    });

    const store = stage(result, "store");
    expect(store.health).toBe("critical");
    expect(store.comparisonType).toBe("same_source_funnel");
    expect(store.baselineMethod).toBe("previous_window");
    expect(store.benchmark).toBeCloseTo(0.1, 5);
    expect(store.sampleSize).toBe(14_000);
    expect(store.baselineWindow).not.toBeNull();

    expect(result.status).toBe("ready");
    expect(result.insights[0].rank).toBe(1);
    expect(result.insights[0].stageId).toBe("store");
    expect(result.evidence[0].finding).toContain("95% interval");
  });

  it("falls back to the product's own history when a full previous window is missing", () => {
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(11),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: [...Array(4).fill(200), ...Array(7).fill(50)],
        }),
      ],
      now: NOW,
    });

    const store = stage(result, "store");
    expect(store.baselineMethod).toBe("historical_average");
    expect(store.health).toBe("critical");
  });

  it("reports recovery as healthy rather than inventing a problem", () => {
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          // Improving: 5% then 10%.
          values: [...Array(14).fill(50), ...Array(14).fill(100)],
        }),
      ],
      now: NOW,
    });

    const store = stage(result, "store");
    expect(store.health).toBe("healthy");
    expect(result.status).toBe("no_confirmed_issue");
    expect(result.insights).toHaveLength(0);
  });

  it("uses an explicit user target only when no own-history comparison exists", () => {
    // Exactly 7 complete days: enough for a target check, not enough to split
    // into a recent and a previous window.
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(7),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: Array(7).fill(100),
        }),
      ],
      now: NOW,
      customTargets: { store: 0.5 },
    });

    const store = stage(result, "store");
    expect(store.baselineMethod).toBe("explicit_target");
    expect(store.benchmark).toBe(0.5);
    expect(store.health).toBe("critical");
    expect(result.status).toBe("ready");
  });

  it("classifies the top stage on its own volume over time", () => {
    const result = runDiagnosis({
      metrics: [
        ...series({
          key: "impressions",
          provider: "app-store-connect",
          values: [...Array(14).fill(1000), ...Array(14).fill(400)],
        }),
      ],
      now: NOW,
    });

    const discover = stage(result, "discover");
    expect(discover.comparisonType).toBe("time_baseline");
    expect(discover.health).toBe("critical");
    expect(result.insights[0].stageId).toBe("discover");
  });
});

describe("diagnosis engine — what may become an insight", () => {
  it("never confirms a cross-source aggregate ratio as critical", () => {
    // Downloads collapse relative to PostHog activations, but the two come
    // from different providers, so the ratio is directional only.
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: Array(28).fill(500),
        }),
        ...series({
          key: "downloads",
          provider: "app-store-connect",
          values: Array(28).fill(250),
        }),
        ...series({
          key: "activated_users",
          provider: "posthog",
          values: [...Array(14).fill(200), ...Array(14).fill(10)],
        }),
      ],
      now: NOW,
    });

    const activate = stage(result, "activate");
    // The cross-source ratio is still drawn, and is labelled for what it is.
    expect(activate.conversionRate).not.toBeNull();
    expect(activate.ratioComparisonType).toBe("aggregate_directional");
    expect(result.limitations).toContain(
      "Activate ratio mixes sources and is directional only",
    );

    // Nothing may be *classified through* a cross-source ratio, so no insight
    // may rest on one. The verdict here comes from PostHog's own activation
    // volume over time, which is a single-source signal and stays admissible.
    expect(activate.comparisonType).toBe("time_baseline");
    for (const insight of result.insights) {
      const source = stage(result, insight.stageId);
      expect(source.comparisonType).not.toBe("aggregate_directional");
    }
  });

  it("fabricates no insight when nothing deteriorated", () => {
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: Array(28).fill(100),
        }),
        ...series({
          key: "downloads",
          provider: "app-store-connect",
          values: Array(28).fill(50),
        }),
        // Renewals exist and are perfectly stable. The previous engine emitted
        // "Confirmed bottleneck at Renew stage" for exactly this input.
        ...series({
          key: "paid_new",
          provider: "revenuecat",
          values: Array(28).fill(20),
        }),
        ...series({
          key: "renewals",
          provider: "revenuecat",
          values: Array(28).fill(18),
        }),
      ],
      now: NOW,
    });

    expect(result.status).toBe("no_confirmed_issue");
    expect(result.insights).toHaveLength(0);
    expect(result.actionProposals).toHaveLength(0);
    expect(
      result.evidence.some((item) => item.finding.includes("Confirmed bottleneck")),
    ).toBe(false);
  });

  it("selects the earliest valid constraint for rank 1", () => {
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(),
        // Store deteriorates...
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: [...Array(14).fill(200), ...Array(14).fill(80)],
        }),
        // ...and so does Install, later in the funnel.
        ...series({
          key: "downloads",
          provider: "app-store-connect",
          values: [...Array(14).fill(100), ...Array(14).fill(16)],
        }),
      ],
      now: NOW,
    });

    expect(result.insights[0].rank).toBe(1);
    expect(result.insights[0].stageId).toBe("store");
    expect(result.insights.map((insight) => insight.stageId)).toContain("install");
  });

  it("caps the ranked insight list at three", () => {
    const declining = (high: number, low: number) => [
      ...Array(14).fill(high),
      ...Array(14).fill(low),
    ];
    const result = runDiagnosis({
      metrics: [
        ...series({
          key: "impressions",
          provider: "app-store-connect",
          values: declining(4000, 1500),
        }),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: declining(2000, 300),
        }),
        ...series({
          key: "downloads",
          provider: "app-store-connect",
          values: declining(1000, 40),
        }),
        ...series({
          key: "trials_new",
          provider: "revenuecat",
          values: declining(500, 100),
        }),
        ...series({
          key: "paid_new",
          provider: "revenuecat",
          values: declining(250, 10),
        }),
      ],
      now: NOW,
    });

    expect(result.insights.length).toBeLessThanOrEqual(THRESHOLDS.maxRankedInsights);
    expect(result.insights.length).toBeGreaterThan(1);
    expect(new Set(result.insights.map((i) => i.rank)).size).toBe(
      result.insights.length,
    );
  });

  it("emits an early-warning insight without claiming a confirmed bottleneck", () => {
    // ~13% relative decline: watch territory, not critical.
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: [...Array(14).fill(300), ...Array(14).fill(261)],
        }),
      ],
      now: NOW,
    });

    const store = stage(result, "store");
    expect(store.health).toBe("watch");
    expect(result.status).toBe("no_confirmed_issue");
    expect(result.insights.every((insight) => insight.rank > 1)).toBe(true);
    expect(result.insights[0]?.summary).toContain("Not yet a confirmed bottleneck");
  });

  it("attaches a complete action plan to every insight", () => {
    const result = runDiagnosis({
      metrics: [
        ...steadyImpressions(),
        ...series({
          key: "product_page_views",
          provider: "app-store-connect",
          values: [...Array(14).fill(100), ...Array(14).fill(50)],
        }),
      ],
      now: NOW,
    });

    expect(result.actionPlans.length).toBe(result.insights.length);
    for (const plan of result.actionPlans) {
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.primaryMetric.key).toBeTruthy();
      expect(plan.guardrails.length).toBeGreaterThan(0);
      expect(plan.stopCondition).toBeTruthy();
      expect(plan.evidenceIds?.length).toBeGreaterThan(0);
      expect(plan.minimumCompleteDays).toBe(THRESHOLDS.minCompleteDays);
    }
    for (const proposal of result.actionProposals) {
      expect(proposal.externalMutationAllowed).toBe(false);
      expect(
        result.insights.some((insight) => insight.id === proposal.insightId),
      ).toBe(true);
    }
    for (const insight of result.insights) {
      for (const evidenceId of insight.evidenceIds) {
        expect(result.evidence.some((item) => item.id === evidenceId)).toBe(true);
      }
    }
  });
});

describe("diagnosis engine — idempotency and versioning", () => {
  it("produces a stable hash for identical input", () => {
    const metrics = steadyImpressions();
    expect(inputHash(metrics, NOW)).toBe(inputHash(metrics, NOW));
    expect(inputHash(metrics, NOW)).toHaveLength(32);
  });

  it("keeps the hash stable across the day, unlike the previous hourly hash", () => {
    const metrics = steadyImpressions();
    expect(inputHash(metrics, new Date("2026-07-27T01:00:00Z"))).toBe(
      inputHash(metrics, new Date("2026-07-27T23:00:00Z")),
    );
  });

  it("changes the hash when the data changes", () => {
    const base = steadyImpressions();
    const changed = [...base.slice(0, -1), { ...base[base.length - 1], value: 999 }];
    expect(inputHash(base, NOW)).not.toBe(inputHash(changed, NOW));
  });

  it("separates platforms and records the engine version", () => {
    const metrics = steadyImpressions();
    expect(inputHash(metrics, NOW, "iOS")).not.toBe(
      inputHash(metrics, NOW, "Web"),
    );
    expect(runDiagnosis({ metrics, now: NOW }).version).toBe(DIAGNOSIS_VERSION);
  });
});

describe("diagnosis engine — web properties", () => {
  it("diagnoses a web funnel from first-party collector metrics", () => {
    const result = runDiagnosis({
      platform: "Web",
      now: NOW,
      metrics: [
        ...series({
          key: "web_visitors",
          provider: "appclimb-web",
          values: Array(28).fill(500),
        }),
        ...series({
          key: "web_engaged_visitors",
          provider: "appclimb-web",
          values: [...Array(14).fill(250), ...Array(14).fill(100)],
        }),
        ...series({
          key: "web_converted_visitors",
          provider: "appclimb-web",
          values: Array(28).fill(50),
        }),
      ],
    });

    expect(result.platform).toBe("Web");
    expect(result.stages.map((item) => item.id)).toEqual([
      "web_visit",
      "web_engaged",
      "web_conversion",
    ]);

    const engaged = stage(result, "web_engaged");
    expect(engaged.comparisonType).toBe("same_source_funnel");
    expect(engaged.health).toBe("critical");
    expect(result.status).toBe("ready");
    expect(result.insights[0].stageId).toBe("web_engaged");

    const plan = result.actionPlans[0];
    expect(plan.primaryMetric.key).toBe("web_engagement_rate");
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.rollbackCondition).toBeTruthy();
  });
});
