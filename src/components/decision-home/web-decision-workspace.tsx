"use client";

import type { ReactNode } from "react";

import type { DashboardSnapshot, SourceProvider } from "@/lib/contracts";

import { ActionPlanPreview } from "./action-plan-preview";
import { CollectingBaselineCard } from "./collecting-baseline-card";
import { NoConfirmedIssueCard } from "./no-confirmed-issue-card";
import { PrimaryDiagnosisCard } from "./primary-diagnosis-card";
import { SetupChecklist } from "./setup-checklist";
import { SourceBlockerCard } from "./source-blocker-card";
import { WorkspaceReadinessCard } from "./workspace-readiness-card";
import { baselineProgress, readinessFor } from "./fallback-readiness";
import { planForInsight, selectPrimaryInsight } from "./primary-selection";

type ActionKind = NonNullable<DashboardSnapshot["readiness"]>["primaryAction"]["kind"];

interface WebDecisionWorkspaceProps {
  snapshot: DashboardSnapshot;
  onActionClick?: (kind: ActionKind, provider?: SourceProvider) => void;
  onOpenActionPlan?: () => void;
  onOpenEvidence?: () => void;
  renderAcquisitionAtlas?: () => ReactNode;
}

/**
 * Web workspace: installation and readiness first, then the visitor journey.
 * Deliberately never renders App Store Keyword Terrain (Task P0.13).
 */
export function WebDecisionWorkspace({
  snapshot,
  onActionClick,
  onOpenActionPlan,
  onOpenEvidence,
  renderAcquisitionAtlas,
}: WebDecisionWorkspaceProps) {
  const readiness = readinessFor(snapshot);
  const diagnosisReady = readiness.state === "diagnosis_ready";
  const primaryInsight = selectPrimaryInsight(snapshot);
  const primaryPlan = planForInsight(snapshot, primaryInsight);
  const baseline = baselineProgress(readiness);

  const failingSource = snapshot.sources.find(
    (source) =>
      source.status === "needs-attention" &&
      source.lastErrorCode !== "no_data_in_window",
  );

  return (
    <div className="decision-workspace">
      <WorkspaceReadinessCard readiness={readiness} onActionClick={onActionClick} />

      {failingSource && readiness.state === "attention" && (
        <SourceBlockerCard
          provider={failingSource.provider}
          errorCode={failingSource.lastErrorCode || "sync_failed"}
          lastCheckedAt={failingSource.lastSyncAt}
          nextCheckAt={failingSource.nextSyncAt}
          onFix={() => onActionClick?.("retry_source", failingSource.provider)}
        />
      )}

      <SetupChecklist
        readiness={readiness}
        platform="Web"
        onActionClick={onActionClick}
      />

      {diagnosisReady && primaryInsight && (
        <PrimaryDiagnosisCard
          snapshot={snapshot}
          onOpenActionPlan={onOpenActionPlan}
          onOpenEvidence={onOpenEvidence}
        />
      )}

      {readiness.state === "collecting" && (
        <CollectingBaselineCard
          completeDays={baseline.completeDays}
          minDaysRequired={baseline.minDaysRequired}
          nextCheckAt={baseline.nextCheckAt}
          availableNow={[
            "Verified visits, referrers and landing pages exactly as received",
            "Which crawlers reached the site and what they requested",
          ]}
          notYetClaimable={[
            "Which channel or landing page is the bottleneck — that needs a full baseline",
            "Conversion-goal comparisons, until a goal is configured and has collected data",
          ]}
        />
      )}

      {readiness.state === "no_confirmed_issue" && (
        <NoConfirmedIssueCard
          snapshot={snapshot}
          nextStepLabel="Configure a conversion goal"
          onNextStep={() => onActionClick?.("install_web_tracking")}
        />
      )}

      {renderAcquisitionAtlas && (
        <section
          className={
            diagnosisReady ? "decision-panel" : "decision-panel is-demoted"
          }
        >
          <h3 className="decision-panel-title">Visitor journey</h3>
          {!diagnosisReady && (
            <p className="decision-panel-note">
              Visits are shown as received. AppClimb has not confirmed a web
              bottleneck yet, so nothing here is a recommendation.
            </p>
          )}
          {renderAcquisitionAtlas()}
        </section>
      )}

      {diagnosisReady && primaryPlan && (
        <ActionPlanPreview plan={primaryPlan} onCreateExperiment={onOpenActionPlan} />
      )}
    </div>
  );
}
