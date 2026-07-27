"use client";

import { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Database,
  MapPin,
} from "lucide-react";

import { GrowthReplay } from "@/components/growth-replay";
import { GrowthRiver } from "@/components/growth-river";
import { InsightPanel } from "@/components/insight-panel";
import { ProductPulseWorkspace } from "@/components/product-pulse-workspace";
import { RetentionHeatmap } from "@/components/retention-heatmap";
import { VoiceClusters } from "@/components/voice-clusters";
import { EvidenceModal } from "@/components/decision-home/evidence-modal";
import { IOSDecisionWorkspace } from "@/components/decision-home/ios-decision-workspace";
import { WebDecisionWorkspace } from "@/components/decision-home/web-decision-workspace";
import {
  evidenceForInsight,
  selectPrimaryInsight,
} from "@/components/decision-home/primary-selection";
import type {
  DashboardSnapshot,
  SourceConnection,
  SourceProvider,
  WorkspaceReadiness,
} from "@/lib/contracts";

type ActionKind = WorkspaceReadiness["primaryAction"]["kind"];

const WEB_INSTALL_ANCHOR = "decision-web-install";

export function PulseView({
  snapshot,
  selectedInsightId,
  onSelectInsight,
  onOpenInsight,
  replayIndex,
  onReplayIndexChange,
  sources,
  onOpenSources,
}: {
  snapshot: DashboardSnapshot;
  selectedInsightId: string;
  onSelectInsight: (insightId: string) => void;
  onOpenInsight: (insightId: string) => void;
  replayIndex: number;
  onReplayIndexChange: (index: number) => void;
  sources: SourceConnection[];
  onOpenSources: () => void;
}) {
  const isWeb = snapshot.app.platform === "Web";
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const primaryInsight = selectPrimaryInsight(snapshot);
  const primaryEvidence = evidenceForInsight(snapshot, primaryInsight)[0];
  const primaryStage = snapshot.stages.find(
    (stage) => stage.id === primaryInsight?.stageId,
  );

  const openPrimaryInsight = () => {
    if (primaryInsight) onOpenInsight(primaryInsight.id);
    else onOpenSources();
  };

  /**
   * Every readiness action kind has to land somewhere real — the plan forbids a
   * primary CTA that does nothing. `wait` is the only kind with no destination,
   * and the readiness card renders it as a status line, not a button.
   */
  const handleActionClick = (kind: ActionKind, provider?: SourceProvider) => {
    switch (kind) {
      case "add_product":
        if (!focusElement('[aria-label="Add app"]')) onOpenSources();
        return;

      case "install_web_tracking":
        if (!focusElement(`#${WEB_INSTALL_ANCHOR}`)) onOpenSources();
        return;

      case "connect_source":
      case "retry_source":
      case "confirm_posthog_mapping":
        // Source setup, mapping confirmation and retries all live in Sources,
        // which deep-links to the provider panel.
        void provider;
        onOpenSources();
        return;

      case "open_action_plan":
      case "open_diagnosis":
        openPrimaryInsight();
        return;

      case "wait":
      default:
        return;
    }
  };

  const renderSupportingAnalytics = () => (
    <div className="decision-supporting-stack">
      <ProductPulseWorkspace snapshot={snapshot} onOpenSources={onOpenSources} />
      <div className="supporting-grid">
        <RetentionHeatmap rows={snapshot.retention} mode={snapshot.mode} />
        <VoiceClusters clusters={snapshot.customerClusters} mode={snapshot.mode} />
      </div>
    </div>
  );

  const renderWebJourney = () => (
    <div id={WEB_INSTALL_ANCHOR} tabIndex={-1}>
      {renderSupportingAnalytics()}
    </div>
  );

  const renderGrowthRiverComponent = () => (
    <div className="river-column">
      <GrowthRiver
        stages={snapshot.stages}
        insights={snapshot.insights}
        activeInsightId={selectedInsightId}
        replayIndex={replayIndex}
        eventCount={snapshot.events.length}
        onSelectInsight={onSelectInsight}
        illustrativeReplay={snapshot.mode === "demo"}
        sources={sources}
      />
      <GrowthReplay
        events={snapshot.events}
        replayIndex={replayIndex}
        onReplayIndexChange={onReplayIndexChange}
        mode={snapshot.mode}
      />
    </div>
  );

  return (
    <section className="pulse-view">
      <div className="filter-row">
        <div
          className="filter-control"
          aria-label={`Selected storefront: ${snapshot.app.storefront}`}
        >
          <MapPin size={16} />
          <span>{snapshot.app.storefront}</span>
        </div>
        <div
          className="filter-control"
          aria-label={`Selected period: ${snapshot.app.period}`}
        >
          <CalendarDays size={16} />
          <span>{snapshot.app.period}</span>
        </div>
        <div className="confidence-control">
          <span className="confidence-orbit">
            <Database size={15} />
          </span>
          <div>
            <span>Data confidence</span>
            <strong>{snapshot.confidence.score}%</strong>
          </div>
          <span
            className={`confidence-good confidence-${snapshot.confidence.level}`}
          >
            {snapshot.mode === "demo" ? (
              <>
                <Database size={14} /> Sample data
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />{" "}
                {snapshot.confidence.level[0].toUpperCase() +
                  snapshot.confidence.level.slice(1)}
              </>
            )}
          </span>
        </div>
      </div>

      {isWeb ? (
        <WebDecisionWorkspace
          snapshot={snapshot}
          onActionClick={handleActionClick}
          onOpenActionPlan={openPrimaryInsight}
          onOpenEvidence={
            primaryEvidence ? () => setEvidenceOpen(true) : openPrimaryInsight
          }
          renderAcquisitionAtlas={renderWebJourney}
        />
      ) : (
        <div className="pulse-grid">
          <IOSDecisionWorkspace
            snapshot={snapshot}
            onActionClick={handleActionClick}
            onOpenActionPlan={openPrimaryInsight}
            onOpenEvidence={
              primaryEvidence ? () => setEvidenceOpen(true) : openPrimaryInsight
            }
            renderGrowthRiver={renderGrowthRiverComponent}
            renderSupportingAnalytics={renderSupportingAnalytics}
          />

          <InsightPanel
            insights={snapshot.insights}
            evidence={snapshot.evidence}
            actionProposals={snapshot.actionProposals}
            selectedInsightId={selectedInsightId}
            onSelectInsight={onSelectInsight}
            onOpenInsight={onOpenInsight}
          />
        </div>
      )}

      {evidenceOpen && primaryEvidence && (
        <EvidenceModal
          evidence={primaryEvidence}
          comparisonType={primaryStage?.comparisonType}
          sampleSize={primaryStage?.sampleSize}
          onClose={() => setEvidenceOpen(false)}
          onOpenActionPlan={openPrimaryInsight}
        />
      )}
    </section>
  );
}

/** Scrolls an on-page target into view and activates it. Returns false when absent. */
function focusElement(selector: string): boolean {
  if (typeof document === "undefined") return false;
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  if (target instanceof HTMLButtonElement) target.click();
  else target.focus({ preventScroll: true });
  return true;
}
