// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";

import { EvidenceModal } from "./evidence-modal";
import { ExperimentCreationModal } from "./experiment-creation-modal";
import type { ActionPlan, Evidence } from "@/lib/contracts";

afterEach(() => {
  cleanup();
});

const mockEvidence: Evidence = {
  id: "ev-1",
  title: "Store conversion drop",
  finding: "Store rate dropped to 10%",
  source: "app-store-connect",
  metricKeys: ["product_page_views"],
  window: { from: "2026-07-01", to: "2026-07-27" },
  confidence: "high",
  before: { label: "Your baseline", value: "22%" },
  after: { label: "Observed", value: "10%" },
};

const mockActionPlan: ActionPlan = {
  targetStageId: "store",
  problem: "Store conversion dropped",
  desiredOutcome: "Improve store screenshots",
  whyThisAction: "Screenshots drive the first impression",
  steps: [
    {
      order: 1,
      title: "Redesign hero screenshot",
      instruction: "Add a high-contrast callout",
      effort: "small",
    },
  ],
  prerequisites: [],
  instrumentation: [],
  primaryMetric: {
    key: "product_page_conversion_rate",
    label: "Product page conversion",
    targetDirection: "up",
  },
  guardrails: [{ key: "app_downloads", label: "Total downloads" }],
  stopCondition: "If conversion drops more than 10%",
  sourceProviders: ["app-store-connect"],
};

describe("EvidenceModal", () => {
  it("renders the finding, source and window", () => {
    render(
      <EvidenceModal
        evidence={mockEvidence}
        comparisonType="same_source_funnel"
        sampleSize={4210}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Store conversion drop")).toBeInTheDocument();
    expect(screen.getByText("Store rate dropped to 10%")).toBeInTheDocument();
    expect(screen.getByText("App Store Connect")).toBeInTheDocument();
    expect(screen.getByText("4,210")).toBeInTheDocument();
    expect(screen.getByText(/Same-source funnel/)).toBeInTheDocument();
  });

  it("does not claim a comparison basis the backend never classified", () => {
    render(<EvidenceModal evidence={mockEvidence} onClose={vi.fn()} />);

    expect(screen.getByText(/Not classified by the diagnosis run/)).toBeInTheDocument();
    expect(screen.getByText("Not reported")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<EvidenceModal evidence={mockEvidence} onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("ExperimentCreationModal", () => {
  it("submits a draft experiment with stage, metric and guardrail", () => {
    const onClose = vi.fn();
    const onCreate = vi.fn();

    render(
      <ExperimentCreationModal
        plan={mockActionPlan}
        onClose={onClose}
        onCreateExperiment={onCreate}
      />,
    );

    expect(screen.getByText("Create new experiment")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Improve store screenshots")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save draft experiment/i }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Improve store screenshots",
        stageId: "store",
        primaryMetric: "Product page conversion",
        guardrailMetric: "Total downloads",
        status: "draft",
        source: "app-store-connect",
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("blocks saving when the plan has no stage or measuring source", () => {
    const onCreate = vi.fn();

    render(
      <ExperimentCreationModal
        plan={{
          ...mockActionPlan,
          targetStageId: undefined,
          sourceProviders: undefined,
        }}
        onClose={vi.fn()}
        onCreateExperiment={onCreate}
      />,
    );

    const submit = screen.getByRole("button", { name: /Save draft experiment/i });
    expect(submit).toBeDisabled();
    expect(
      screen.getByText(/not attached to a stage and a measuring source/i),
    ).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
