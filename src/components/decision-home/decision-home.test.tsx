// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";

import { NoConfirmedIssueCard } from "./no-confirmed-issue-card";
import { PrimaryDiagnosisCard } from "./primary-diagnosis-card";
import { SetupChecklist } from "./setup-checklist";
import { WorkspaceReadinessCard } from "./workspace-readiness-card";
import type {
  DashboardSnapshot,
  GrowthStage,
  WorkspaceReadiness,
} from "@/lib/contracts";

afterEach(() => {
  cleanup();
});

function readiness(
  overrides: Partial<WorkspaceReadiness> = {},
): WorkspaceReadiness {
  return {
    state: "product_required",
    progress: 0,
    primaryAction: { kind: "add_product", reasonCode: "no_real_product" },
    capabilities: {
      acquisition: { status: "blocked", reasonCode: "setup_required" },
      activation: { status: "blocked", reasonCode: "setup_required" },
      monetization: { status: "blocked", reasonCode: "setup_required" },
      retention: { status: "blocked", reasonCode: "setup_required" },
    },
    blockers: [{ code: "product_missing", required: true }],
    ...overrides,
  };
}

function snapshot(overrides: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return {
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
    stages: [],
    events: [],
    evidence: [],
    insights: [],
    actionProposals: [],
    experiments: [],
    sources: [],
    retention: [],
    customerClusters: [],
    ...overrides,
  };
}

const criticalStage: GrowthStage = {
  id: "store",
  label: "Store",
  value: 100,
  formattedValue: "10%",
  conversionRate: 0.1,
  health: "critical",
  source: "app-store-connect",
  evidenceIds: ["ev-1"],
  flowWidth: 50,
  comparisonType: "same_source_funnel",
  sampleSize: 4210,
};

describe("WorkspaceReadinessCard", () => {
  it("renders state A with the plan's headline and CTA", () => {
    const onAction = vi.fn();
    render(
      <WorkspaceReadinessCard readiness={readiness()} onActionClick={onAction} />,
    );

    expect(
      screen.getByText("Add the product you want to improve"),
    ).toBeInTheDocument();
    expect(screen.getByText(/0% complete/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add iOS app or website/i }));
    expect(onAction).toHaveBeenCalledWith("add_product", undefined);
  });

  it("names the exact cause and fix for state G", () => {
    render(
      <WorkspaceReadinessCard
        readiness={readiness({
          state: "attention",
          progress: 40,
          primaryAction: {
            kind: "retry_source",
            provider: "posthog",
            reasonCode: "invalid_access_token",
          },
          blockers: [
            { code: "source_attention_posthog", provider: "posthog", required: true },
          ],
        })}
      />,
    );

    expect(screen.getByText("Authorization expired")).toBeInTheDocument();
    expect(screen.getByText(/PostHog revoked or expired/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Reconnect PostHog/i }),
    ).toBeInTheDocument();
  });

  it("surfaces an unknown error code verbatim instead of inventing copy", () => {
    render(
      <WorkspaceReadinessCard
        readiness={readiness({
          state: "attention",
          primaryAction: {
            kind: "retry_source",
            provider: "revenuecat",
            reasonCode: "teapot_overflow",
          },
          blockers: [],
        })}
      />,
    );

    expect(screen.getByText(/teapot_overflow/)).toBeInTheDocument();
  });

  it("renders a waiting status instead of a dead-end button for kind=wait", () => {
    render(
      <WorkspaceReadinessCard
        readiness={readiness({
          state: "collecting",
          progress: 60,
          primaryAction: { kind: "wait", reasonCode: "building_baseline" },
          blockers: [],
        })}
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/no action needed/i)).toBeInTheDocument();
  });
});

describe("SetupChecklist", () => {
  it("collapses completed steps into a done row while setup is unfinished", () => {
    render(
      <SetupChecklist
        readiness={readiness({
          state: "source_required",
          progress: 25,
          primaryAction: {
            kind: "connect_source",
            provider: "app-store-connect",
            reasonCode: "app_store_connect_required",
          },
          blockers: [],
        })}
        platform="iOS"
      />,
    );

    const doneRow = screen.getByLabelText("Completed steps");
    expect(within(doneRow).getByText("Add your iOS app")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Continue/i }),
    ).toBeInTheDocument();
  });

  it("degrades to a compact status strip once a diagnosis exists", () => {
    render(
      <SetupChecklist
        readiness={readiness({
          state: "diagnosis_ready",
          progress: 100,
          primaryAction: {
            kind: "open_action_plan",
            reasonCode: "bottleneck_diagnosed",
          },
          blockers: [],
        })}
      />,
    );

    expect(screen.getByText("Setup complete")).toBeInTheDocument();
    expect(screen.queryByText("Add your iOS app")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Show setup/i }));
    expect(screen.getByText("Add your iOS app")).toBeInTheDocument();
  });
});

describe("PrimaryDiagnosisCard", () => {
  const diagnosisSnapshot = snapshot({
    diagnosis: {
      status: "ready",
      generatedAt: "2026-07-27T11:00:00Z",
      version: "v2",
      primaryInsightId: "ins-2",
      limitations: ["Paywall stage is not covered by any connected source."],
    },
    stages: [criticalStage],
    evidence: [
      {
        id: "ev-1",
        title: "Store conversion drop",
        finding: "Store rate dropped to 10%",
        source: "app-store-connect",
        metricKeys: ["product_page_views"],
        window: { from: "2026-07-01", to: "2026-07-27" },
        confidence: "high",
        before: { label: "Your 30-day baseline", value: "22%" },
        after: { label: "Observed", value: "10%" },
      },
    ],
    insights: [
      {
        id: "ins-1",
        title: "Lower ranked insight",
        summary: "Should not be promoted",
        kind: "Derived",
        stageId: "install",
        evidenceIds: [],
        confidence: "low",
        impact: "low",
        effort: "low",
        rank: 1,
      },
      {
        id: "ins-2",
        title: "Fix store bottleneck",
        summary: "Store conversion dropped significantly",
        kind: "Derived",
        stageId: "store",
        evidenceIds: ["ev-1"],
        confidence: "high",
        impact: "high",
        effort: "medium",
        rank: 2,
      },
    ],
  });

  it("promotes the insight named by the diagnosis run, not insights[0]", () => {
    render(<PrimaryDiagnosisCard snapshot={diagnosisSnapshot} />);

    expect(screen.getByText("Fix store bottleneck")).toBeInTheDocument();
    expect(screen.queryByText("Lower ranked insight")).toBeNull();
  });

  it("shows evidence window, sample size, source and limitations", () => {
    render(<PrimaryDiagnosisCard snapshot={diagnosisSnapshot} />);

    expect(screen.getByText("4,210")).toBeInTheDocument();
    expect(screen.getByText("App Store Connect")).toBeInTheDocument();
    expect(screen.getByText(/Jul 1, 2026/)).toBeInTheDocument();
    expect(
      screen.getByText(/Paywall stage is not covered/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Same-source funnel/)).toBeInTheDocument();
  });

  it("says a missing field is not reported instead of inventing one", () => {
    const bare = snapshot({
      stages: [{ ...criticalStage, sampleSize: undefined, comparisonType: undefined }],
      insights: [
        {
          id: "ins-1",
          title: "Store bottleneck",
          summary: "Store conversion is low",
          kind: "Derived",
          stageId: "store",
          evidenceIds: [],
          confidence: "medium",
          impact: "high",
          effort: "medium",
          rank: 1,
        },
      ],
    });

    render(<PrimaryDiagnosisCard snapshot={bare} />);
    expect(screen.getAllByText("Not reported").length).toBeGreaterThan(0);
  });
});

describe("NoConfirmedIssueCard", () => {
  it("lists covered stages, unknown stages and the strongest watch signal", () => {
    const onNext = vi.fn();
    render(
      <NoConfirmedIssueCard
        snapshot={snapshot({
          stages: [
            { ...criticalStage, id: "store", label: "Store", health: "healthy" },
            {
              ...criticalStage,
              id: "activate",
              label: "Activate",
              health: "watch",
              conversionRate: 0.12,
              formattedValue: "12%",
            },
            {
              ...criticalStage,
              id: "paywall",
              label: "Paywall",
              health: "unknown",
              readinessReason: "No monetization source connected.",
            },
          ],
        })}
        onNextStep={onNext}
        nextStepLabel="Connect the missing sources"
      />,
    );

    expect(
      screen.getByText("No confirmed bottleneck in the current window"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Covered stages \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Still unknown \(1\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/No monetization source connected./),
    ).toBeInTheDocument();
    expect(screen.getByText(/closest to breaking it/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Connect the missing sources/i }),
    );
    expect(onNext).toHaveBeenCalled();
  });

  it("never claims a watch signal when there is none", () => {
    render(
      <NoConfirmedIssueCard
        snapshot={snapshot({
          stages: [{ ...criticalStage, health: "healthy" }],
        })}
      />,
    );

    expect(
      screen.getByText(/not flagging one just to fill the space/i),
    ).toBeInTheDocument();
  });
});
