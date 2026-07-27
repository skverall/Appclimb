"use me";
import React from "react";
import type { DashboardSnapshot } from "@/lib/contracts";
import { WorkspaceReadinessCard } from "./workspace-readiness-card";
import { PrimaryDiagnosisCard } from "./primary-diagnosis-card";
import { ActionPlanPreview } from "./action-plan-preview";
import { CollectingBaselineCard } from "./collecting-baseline-card";
import { NoConfirmedIssueCard } from "./no-confirmed-issue-card";
import { SourceBlockerCard } from "./source-blocker-card";
import { SetupChecklist } from "./setup-checklist";

interface IOSDecisionWorkspaceProps {
  snapshot: DashboardSnapshot;
  onActionClick?: (kind: string, provider?: string) => void;
  onOpenActionPlan?: () => void;
  onOpenEvidence?: () => void;
  renderGrowthRiver?: () => React.ReactNode;
  renderSupportingAnalytics?: () => React.ReactNode;
}

export function IOSDecisionWorkspace({
  snapshot,
  onActionClick,
  onOpenActionPlan,
  onOpenEvidence,
  renderGrowthRiver,
  renderSupportingAnalytics,
}: IOSDecisionWorkspaceProps) {
  const readiness = snapshot.readiness || {
    state: snapshot.insights.length > 0 ? "diagnosis_ready" : "collecting",
    progress: snapshot.insights.length > 0 ? 100 : 60,
    primaryAction: {
      kind: snapshot.insights.length > 0 ? "open_action_plan" : "wait",
      reasonCode: "baseline_derived",
    },
    capabilities: {
      acquisition: { status: "ready" },
      activation: { status: "ready" },
      monetization: { status: "ready" },
      retention: { status: "ready" },
    },
    blockers: [],
  };

  const primaryPlan = snapshot.actionPlans?.[0] || snapshot.actionProposals[0]?.actionPlan;
  const failingSource = snapshot.sources.find((s) => s.status === "needs-attention" && s.lastErrorCode !== "no_data_in_window");
  const pendingSource = snapshot.sources.find((s) => s.provider === "app-store-connect" && s.lastErrorCode === "no_data_in_window");

  return (
    <div className="space-y-6">
      {/* 1. Primary Readiness Header Card */}
      <WorkspaceReadinessCard readiness={readiness} onActionClick={onActionClick} />

      {/* 2. Source Attention or Pending Blockers */}
      {failingSource && (
        <SourceBlockerCard
          provider={failingSource.provider}
          errorCode={failingSource.lastErrorCode || "connection_error"}
          onFix={() => onActionClick?.("retry_source", failingSource.provider)}
        />
      )}

      {pendingSource && readiness.state === "source_pending" && (
        <SourceBlockerCard
          provider="app-store-connect"
          errorCode="no_data_in_window"
          onFix={() => onActionClick?.("connect_source", "posthog")}
        />
      )}

      {/* 3. Setup Checklist (Collapsible) */}
      {readiness.state !== "diagnosis_ready" && (
        <SetupChecklist readiness={readiness} platform="iOS" onActionClick={onActionClick} />
      )}

      {/* 4. Primary Hero Card (Diagnosis Ready vs Collecting vs No Bottleneck) */}
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
          completeDays={snapshot.confidence.score > 70 ? 7 : 2}
        />
      ) : readiness.state === "no_confirmed_issue" ? (
        <NoConfirmedIssueCard snapshot={snapshot} />
      ) : null}

      {/* 5. Growth River Funnel Visualization */}
      {renderGrowthRiver && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
            iOS Growth River Journey
          </h3>
          {renderGrowthRiver()}
        </div>
      )}

      {/* 6. Supporting Analytics (PostHog Pulse, Keyword Terrain below decision cards) */}
      {renderSupportingAnalytics && (
        <div className="pt-4 border-t border-slate-800/80">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Supporting Diagnostics & Signals
          </h4>
          {renderSupportingAnalytics()}
        </div>
      )}
    </div>
  );
}
