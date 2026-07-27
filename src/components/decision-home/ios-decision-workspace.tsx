"use client";

import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import type { DashboardSnapshot, SourceProvider } from "@/lib/contracts";

import { KeywordTerrain } from "@/components/product-pulse-workspace";
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

interface IOSDecisionWorkspaceProps {
  snapshot: DashboardSnapshot;
  onActionClick?: (kind: ActionKind, provider?: SourceProvider) => void;
  onOpenActionPlan?: () => void;
  onOpenEvidence?: () => void;
  renderGrowthRiver?: () => ReactNode;
  renderSupportingAnalytics?: () => ReactNode;
}

export function IOSDecisionWorkspace({
  snapshot,
  onActionClick,
  onOpenActionPlan,
  onOpenEvidence,
  renderGrowthRiver,
  renderSupportingAnalytics,
}: IOSDecisionWorkspaceProps) {
  const readiness = readinessFor(snapshot);
  const diagnosisReady = readiness.state === "diagnosis_ready";
  const primaryInsight = selectPrimaryInsight(snapshot);
  const primaryPlan = planForInsight(snapshot, primaryInsight);
  const baseline = baselineProgress(readiness);

  const hasAppStoreConnect =
    snapshot.sources.some(
      (source) =>
        source.provider === "app-store-connect" &&
        source.status === "connected",
    ) || snapshot.mode === "demo";

  const failingSource = snapshot.sources.find(
    (source) =>
      source.status === "needs-attention" &&
      source.lastErrorCode !== "no_data_in_window",
  );
  const pendingSource = snapshot.sources.find(
    (source) =>
      source.provider === "app-store-connect" &&
      source.lastErrorCode === "no_data_in_window",
  );

  return (
    <div className="decision-workspace">
      {!hasAppStoreConnect ? (
        <>
          <section className="store-visibility-section">
            <KeywordTerrain snapshot={snapshot} />

            <div className="optional-enrichment-banner" aria-label="Optional source enrichment">
              <div className="enrichment-copy">
                <Sparkles size={16} className="enrichment-icon" />
                <div>
                  <strong>Private source enrichment</strong>
                  <p>
                    App Store Connect is an optional connector for private downloads, sales, subscriptions, and full-funnel bottleneck diagnosis. Connect in Sources when you are ready.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="secondary-action"
                onClick={() => onActionClick?.("connect_source", "app-store-connect")}
              >
                Connect in Sources
              </button>
            </div>
          </section>

          {renderGrowthRiver && (
            <section className="decision-panel">
              <h3 className="decision-panel-title">Growth River</h3>
              {renderGrowthRiver()}
            </section>
          )}

          <div className="setup-progress-lower">
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

            {pendingSource && readiness.state === "source_pending" && (
              <SourceBlockerCard
                provider="app-store-connect"
                errorCode="no_data_in_window"
                lastCheckedAt={pendingSource.lastSyncAt}
                nextCheckAt={pendingSource.nextSyncAt}
                fixLabel="Check Apple status now"
                onFix={() => onActionClick?.("retry_source", "app-store-connect")}
              />
            )}

            <SetupChecklist
              readiness={readiness}
              platform="iOS"
              onActionClick={onActionClick}
            />
          </div>

          {renderSupportingAnalytics && (
            <section className="decision-supporting is-demoted">
              <div className="decision-supporting-head">
                <h4>Supporting analytics</h4>
                <p>Available to browse.</p>
              </div>
              {renderSupportingAnalytics()}
            </section>
          )}
        </>
      ) : (
        <>
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

          {pendingSource && readiness.state === "source_pending" && (
            <SourceBlockerCard
              provider="app-store-connect"
              errorCode="no_data_in_window"
              lastCheckedAt={pendingSource.lastSyncAt}
              nextCheckAt={pendingSource.nextSyncAt}
              fixLabel="Check Apple status now"
              onFix={() => onActionClick?.("retry_source", "app-store-connect")}
            />
          )}

          <SetupChecklist
            readiness={readiness}
            platform="iOS"
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
                "Daily App Store Connect values exactly as Apple reported them",
                "Which sources are live and when each last delivered data",
              ]}
              notYetClaimable={[
                "Which stage is the bottleneck — that needs a full baseline",
                "Whether a release or metadata change helped, since there is no stable comparison period yet",
              ]}
            />
          )}

          {readiness.state === "no_confirmed_issue" && (
            <NoConfirmedIssueCard
              snapshot={snapshot}
              nextStepLabel="Connect the missing sources"
              onNextStep={() => onActionClick?.("connect_source")}
            />
          )}

          {renderGrowthRiver && (
            <section className="decision-panel">
              <h3 className="decision-panel-title">Growth River</h3>
              {renderGrowthRiver()}
            </section>
          )}

          {diagnosisReady && primaryPlan && (
            <ActionPlanPreview plan={primaryPlan} onCreateExperiment={onOpenActionPlan} />
          )}

          <section className="store-visibility-section">
            <KeywordTerrain snapshot={snapshot} />
          </section>

          {renderSupportingAnalytics && (
            <section
              className={
                diagnosisReady
                  ? "decision-supporting"
                  : "decision-supporting is-demoted"
              }
            >
              <div className="decision-supporting-head">
                <h4>Supporting analytics</h4>
                <p>
                  {diagnosisReady
                    ? "Context behind the diagnosis. None of these panels is the recommended next step."
                    : "Available to browse."}
                </p>
              </div>
              {renderSupportingAnalytics()}
            </section>
          )}
        </>
      )}
    </div>
  );
}
