import { describe, expect, it } from "vitest";
import { runDiagnosis } from "./engine";
import type { DiagnosisMetric } from "./types";

describe("Diagnosis Engine", () => {
  it("returns not_ready status when metrics are empty", () => {
    const result = runDiagnosis({
      metrics: [],
      now: new Date("2026-07-27T12:00:00Z"),
    });

    expect(result.status).toBe("not_ready");
    expect(result.insights).toHaveLength(0);
    expect(result.evidence).toHaveLength(0);
    expect(result.stages).toHaveLength(8);
  });

  it("handles missing metric vs explicit zero correctly without fabricating insights", () => {
    const metrics: DiagnosisMetric[] = [
      {
        provider: "app-store-connect",
        key: "impressions",
        occurredAt: "2026-07-26T00:00:00Z",
        value: 1000,
        unit: "count",
        freshnessHours: 1,
        completeness: 1,
      },
      {
        provider: "app-store-connect",
        key: "product_page_views",
        occurredAt: "2026-07-26T00:00:00Z",
        value: 500,
        unit: "count",
        freshnessHours: 1,
        completeness: 1,
      },
    ];

    const result = runDiagnosis({
      metrics,
      now: new Date("2026-07-27T12:00:00Z"),
    });

    expect(result.status).toBe("no_confirmed_issue");
    expect(result.stages[0].value).toBe(1000);
    expect(result.stages[1].value).toBe(500);
    expect(result.stages[1].conversionRate).toBe(0.5);
    expect(result.stages[2].value).toBe(0);
    expect(result.stages[2].health).toBe("unknown"); // No target set
  });

  it("generates critical insight and structured action plan when custom target is deteriorated", () => {
    const metrics: DiagnosisMetric[] = [
      {
        provider: "app-store-connect",
        key: "impressions",
        occurredAt: "2026-07-26T00:00:00Z",
        value: 1000,
        unit: "count",
        freshnessHours: 1,
        completeness: 1,
      },
      {
        provider: "app-store-connect",
        key: "product_page_views",
        occurredAt: "2026-07-26T00:00:00Z",
        value: 100, // 10% rate vs 50% target = 20% of target -> critical (<80%)
        unit: "count",
        freshnessHours: 1,
        completeness: 1,
      },
    ];

    const result = runDiagnosis({
      metrics,
      now: new Date("2026-07-27T12:00:00Z"),
      customTargets: {
        store: 0.5,
      },
    });

    expect(result.status).toBe("ready");
    expect(result.insights).toHaveLength(1);
    expect(result.insights[0].stageId).toBe("store");
    expect(result.insights[0].rank).toBe(1);
    expect(result.actionProposals).toHaveLength(1);
    expect(result.actionPlans).toHaveLength(1);

    const plan = result.actionPlans[0];
    expect(plan.problem).toBeDefined();
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.primaryMetric.key).toBe("product_page_view_rate");
    expect(plan.guardrails.length).toBeGreaterThan(0);
    expect(plan.stopCondition).toBeDefined();
  });

  it("generates stable input hash for identical inputs", () => {
    const now = new Date("2026-07-27T12:00:00Z");
    const metrics: DiagnosisMetric[] = [
      {
        provider: "app-store-connect",
        key: "impressions",
        occurredAt: "2026-07-26T00:00:00Z",
        value: 100,
        unit: "count",
        freshnessHours: 1,
        completeness: 1,
      },
    ];

    const res1 = runDiagnosis({ metrics, now });
    const res2 = runDiagnosis({ metrics, now });

    expect(res1.inputHash).toBe(res2.inputHash);
    expect(res1.inputHash).toHaveLength(32);
  });
});
