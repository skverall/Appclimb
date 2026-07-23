import { describe, expect, it } from "vitest";

import {
  alignUtcDay,
  assessConfidence,
  canJoinAtUserLevel,
  conversionRate,
  preferredSource,
  selectEarliestBrokenStage,
} from "@/lib/diagnosis";
import { demoSnapshot } from "@/lib/demo-data";
import type { MetricPoint } from "@/lib/contracts";

describe("growth diagnosis", () => {
  it("calculates bounded conversion rates", () => {
    expect(conversionRate(25, 100)).toBe(0.25);
    expect(conversionRate(120, 100)).toBe(1);
    expect(conversionRate(10, 0)).toBeNull();
  });

  it("selects the earliest confirmed broken stage", () => {
    expect(selectEarliestBrokenStage(demoSnapshot.stages)?.id).toBe("activate");
  });

  it("keeps source precedence deterministic", () => {
    expect(preferredSource("downloads")).toBe("app-store-connect");
    expect(preferredSource("activation_24h")).toBe("posthog");
    expect(preferredSource("paywall_conversion")).toBe("superwall");
    expect(preferredSource("renewal_rate")).toBe("revenuecat");
  });

  it("aligns temporal comparisons to UTC day boundaries", () => {
    expect(alignUtcDay("2026-07-23T23:42:01-07:00")).toBe(
      "2026-07-24T00:00:00.000Z",
    );
  });

  it("requires explicit shared identity before a user-level join", () => {
    expect(
      canJoinAtUserLevel({
        sharedAppUserIdConfirmed: false,
        sources: ["posthog", "revenuecat"],
      }),
    ).toBe(false);
    expect(
      canJoinAtUserLevel({
        sharedAppUserIdConfirmed: true,
        sources: ["posthog", "revenuecat"],
      }),
    ).toBe(true);
  });

  it("combines freshness and completeness into confidence", () => {
    const points: MetricPoint[] = [
      {
        id: "1",
        workspaceId: "w",
        appId: "a",
        source: "posthog",
        metricKey: "activation_24h",
        occurredAt: "2026-07-23T00:00:00.000Z",
        value: 0.31,
        unit: "ratio",
        dimensions: {},
        freshnessHours: 2,
        completeness: 0.98,
      },
    ];
    expect(assessConfidence(points)).toEqual({ score: 98, level: "high" });
    expect(assessConfidence([])).toEqual({ score: 0, level: "low" });
  });
});
