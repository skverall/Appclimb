"use me";
import React from "react";
import type { DashboardSnapshot } from "@/lib/contracts";
import { WorkspaceReadinessCard } from "./workspace-readiness-card";
import { PrimaryDiagnosisCard } from "./primary-diagnosis-card";
import { ActionPlanPreview } from "./action-plan-preview";
import { CollectingBaselineCard } from "./collecting-baseline-card";
import { NoConfirmedIssueCard } from "./no-confirmed-issue-card";
import { SetupChecklist } from "./setup-checklist";

interface WebDecisionWorkspaceProps {
  snapshot: DashboardSnapshot;
  onActionClick?: (kind: string, provider?: string) => void;
  onOpenActionPlan?: () => void;
  onOpenEvidence?: () => void;
  renderAcquisitionAtlas?: () => React.ReactNode;
}

export function WebDecisionWorkspace({
  snapshot,
  onActionClick,
  onOpenActionPlan,
  onOpenEvidence,
  renderAcquisitionAtlas,
}: WebDecisionWorkspaceProps) {
  const readiness = snapshot.readiness || {
    state: snapshot.insights.length > 0 ? "diagnosis_ready" : "installation_required",
    progress: snapshot.insights.length > 0 ? 100 : 20,
    primaryAction: {
      kind: snapshot.insights.length > 0 ? "open_action_plan" : "install_web_tracking",
      reasonCode: "web_readiness",
    },
    capabilities: {
      acquisition: { status: "ready" },
      activation: { status: "collecting" },
      monetization: { status: "blocked" },
      retention: { status: "blocked" },
    },
    blockers: [],
  };

  const primaryPlan = snapshot.actionPlans?.[0] || snapshot.actionProposals[0]?.actionPlan;

  return (
    <div className="space-y-6">
      {/* 1. Primary Readiness Header Card */}
      <WorkspaceReadinessCard readiness={readiness} onActionClick={onActionClick} />

      {/* 2. Setup Checklist (Collapsible) */}
      {readiness.state !== "diagnosis_ready" && (
        <SetupChecklist readiness={readiness} platform="Web" onActionClick={onActionClick} />
      )}

      {/* 3. Primary Hero Card (Diagnosis Ready vs Collecting vs No Bottleneck) */}
      {readiness.state === "diagnosis_ready" && snapshot.insights.length > 0 ? (
        <div className="space-y-6">
          <PrimaryDiagnosisCard
            snapshot={snapshot}
            onOpenActionPlan={onOpenActionPlan}
            onOpenEvidence={onOpenEvidence}
          />

          {primaryPlan && (
            <ActionPlanPreview
              plan={primaryPlan}
              onCreateExperiment={onOpenActionPlan}
            />
          )}
        </div>
      ) : readiness.state === "collecting" ? (
        <CollectingBaselineCard
          sampleSize={snapshot.confidence.score * 10}
          completeDays={snapshot.confidence.score > 70 ? 7 : 1}
        />
      ) : readiness.state === "no_confirmed_issue" ? (
        <NoConfirmedIssueCard snapshot={snapshot} />
      ) : null}

      {/* 4. Acquisition Atlas Web Analytics Surface */}
      {renderAcquisitionAtlas && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
            Acquisition Atlas & Visitor Current
          </h3>
          {renderAcquisitionAtlas()}
        </div>
      )}
    </div>
  );
}
