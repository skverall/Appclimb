// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { WorkspaceReadinessCard } from "./workspace-readiness-card";
import { PrimaryDiagnosisCard } from "./primary-diagnosis-card";
import type { DashboardSnapshot, WorkspaceReadiness } from "@/lib/contracts";

describe("Decision Home Components", () => {
  it("renders product_required state in WorkspaceReadinessCard", () => {
    const readiness: WorkspaceReadiness = {
      state: "product_required",
      progress: 0,
      primaryAction: {
        kind: "add_product",
        reasonCode: "no_real_product",
      },
      capabilities: {
        acquisition: { status: "blocked" },
        activation: { status: "blocked" },
        monetization: { status: "blocked" },
        retention: { status: "blocked" },
      },
      blockers: [{ code: "product_missing", required: true }],
    };

    render(<WorkspaceReadinessCard readiness={readiness} />);

    expect(screen.getByText("Add the product you want to improve")).toBeInTheDocument();
    expect(screen.getByText("Add product")).toBeInTheDocument();
    expect(screen.getByText(/0% Complete/)).toBeInTheDocument();
  });

  it("renders diagnosis_ready state in PrimaryDiagnosisCard", () => {
    const mockSnapshot: DashboardSnapshot = {
      generatedAt: "2026-07-27T12:00:00Z",
      workspaceName: "Test Workspace",
      app: {
        id: "app-1",
        name: "Test iOS App",
        platform: "iOS",
        storefront: "US",
        period: "Last 30 days",
      },
      confidence: { score: 85, level: "high", note: "Connected" },
      stages: [
        {
          id: "store",
          label: "Store",
          value: 100,
          formattedValue: "100",
          conversionRate: 0.1,
          health: "critical",
          source: "app-store-connect",
          evidenceIds: ["ev-1"],
          flowWidth: 50,
        },
      ],
      events: [],
      evidence: [
        {
          id: "ev-1",
          title: "Store conversion drop",
          finding: "Store rate dropped to 10%",
          source: "app-store-connect",
          metricKeys: ["product_page_views"],
          window: { from: "2026-07-01", to: "2026-07-27" },
          confidence: "high",
          before: { label: "Target", value: "50%" },
          after: { label: "Observed", value: "10%" },
        },
      ],
      insights: [
        {
          id: "ins-1",
          title: "Fix store bottleneck",
          summary: "Store conversion dropped significantly",
          kind: "Derived",
          stageId: "store",
          evidenceIds: ["ev-1"],
          confidence: "high",
          impact: "high",
          effort: "medium",
          rank: 1,
        },
      ],
      actionProposals: [
        {
          id: "prop-1",
          insightId: "ins-1",
          title: "Test Store Screenshots",
          rationale: "Improve store conversion",
          experimentTemplate: "store-screenshot",
          status: "proposed",
          externalMutationAllowed: false,
        },
      ],
      experiments: [],
      sources: [],
      retention: [],
      customerClusters: [],
    };

    render(<PrimaryDiagnosisCard snapshot={mockSnapshot} />);

    expect(screen.getByText("Fix store bottleneck")).toBeInTheDocument();
    expect(screen.getByText("Store conversion dropped significantly")).toBeInTheDocument();
    expect(screen.getByText("85% Confidence")).toBeInTheDocument();
  });
});
