// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { EvidenceModal } from "./evidence-modal";
import { ExperimentCreationModal } from "./experiment-creation-modal";
import type { ActionPlan, DashboardSnapshot, Evidence } from "@/lib/contracts";

describe("Evidence & Experiment Modals", () => {
  const mockEvidence: Evidence = {
    id: "ev-1",
    title: "Store conversion drop",
    finding: "Store rate dropped to 10%",
    source: "app-store-connect",
    metricKeys: ["product_page_views"],
    window: { from: "2026-07-01", to: "2026-07-27" },
    confidence: "high",
    before: { label: "Target", value: "50%" },
    after: { label: "Observed", value: "10%" },
  };

  const mockSnapshot: DashboardSnapshot = {
    generatedAt: "2026-07-27T12:00:00Z",
    workspaceName: "Test Workspace",
    app: {
      id: "app-1",
      name: "Test App",
      platform: "iOS",
      storefront: "US",
      period: "Last 30 days",
    },
    confidence: { score: 85, level: "high", note: "Connected" },
    stages: [],
    events: [],
    evidence: [mockEvidence],
    insights: [],
    actionProposals: [],
    experiments: [],
    sources: [],
    retention: [],
    customerClusters: [],
  };

  const mockActionPlan: ActionPlan = {
    targetStageId: "store",
    problem: "Store conversion dropped",
    desiredOutcome: "Improve Store Screenshots",
    whyThisAction: "Screenshots drive first impression",
    steps: [
      {
        order: 1,
        title: "Redesign Hero Screenshot",
        instruction: "Add high-contrast callout",
        effort: "small",
      },
    ],
    prerequisites: [],
    instrumentation: [],
    primaryMetric: {
      key: "product_page_conversion_rate",
      label: "Product Page Conversion",
      targetDirection: "up",
    },
    guardrails: [
      {
        key: "app_downloads",
        label: "Total Downloads",
      },
    ],
    stopCondition: "If conversion drops > 10%",
  };

  it("renders EvidenceModal with finding and source details", () => {
    const handleClose = vi.fn();
    render(
      <EvidenceModal
        evidence={mockEvidence}
        snapshot={mockSnapshot}
        onClose={handleClose}
      />
    );

    expect(screen.getByText("Store conversion drop")).toBeInTheDocument();
    expect(screen.getByText("Store rate dropped to 10%")).toBeInTheDocument();
    expect(screen.getByText("Same-Source Funnel")).toBeInTheDocument();
  });

  it("renders ExperimentCreationModal and submits new experiment", () => {
    const handleClose = vi.fn();
    const handleCreate = vi.fn();

    render(
      <ExperimentCreationModal
        plan={mockActionPlan}
        onClose={handleClose}
        onCreateExperiment={handleCreate}
      />
    );

    expect(screen.getByText("Create New Experiment")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Improve Store Screenshots")).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /Launch Experiment/i });
    fireEvent.click(submitBtn);

    expect(handleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Improve Store Screenshots",
        stageId: "store",
        primaryMetric: "Product Page Conversion",
      })
    );
  });
});
