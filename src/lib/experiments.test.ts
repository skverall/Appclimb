import { describe, expect, it } from "vitest";

import { demoSnapshot } from "@/lib/demo-data";
import {
  createExperimentDraft,
  experimentIdForInsight,
} from "@/lib/experiments";

describe("experiment drafts", () => {
  it("derives activation metrics and source from the selected evidence", () => {
    const insight = demoSnapshot.insights.find(
      (item) => item.id === "insight-activation",
    );
    expect(insight).toBeDefined();

    const draft = createExperimentDraft(demoSnapshot, insight!);

    expect(draft).toMatchObject({
      id: "draft-insight-activation",
      title: "Run a shorter onboarding experiment",
      stageId: "activate",
      primaryMetric: "First key action within 24h",
      guardrailMetric: "D7 retention",
      source: "posthog",
      status: "draft",
    });
  });

  it("uses Store evidence instead of hardcoded activation defaults", () => {
    const insight = demoSnapshot.insights.find(
      (item) => item.id === "insight-store",
    );
    expect(insight).toBeDefined();

    const draft = createExperimentDraft(demoSnapshot, insight!);

    expect(draft.primaryMetric).toBe("Product page conversion");
    expect(draft.guardrailMetric).toBe("Download volume");
    expect(draft.source).toBe("app-store-connect");
  });

  it("returns a stable id so repeated clicks do not duplicate a draft", () => {
    expect(experimentIdForInsight("insight-renewal")).toBe(
      "draft-insight-renewal",
    );
  });
});
