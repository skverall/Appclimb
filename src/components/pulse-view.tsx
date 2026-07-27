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
import { IOSDecisionWorkspace } from "@/components/decision-home/ios-decision-workspace";
import { WebDecisionWorkspace } from "@/components/decision-home/web-decision-workspace";
import type { DashboardSnapshot, SourceConnection } from "@/lib/contracts";

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

  const handleActionClick = (kind: string, provider?: string) => {
    if (kind === "connect_source" || kind === "retry_source") {
      onOpenSources();
    } else if (kind === "open_action_plan" || kind === "open_diagnosis") {
      const firstInsight = snapshot.insights[0];
      if (firstInsight) {
        onOpenInsight(firstInsight.id);
      }
    }
  };

  const renderSupportingAnalytics = () => (
    <div className="space-y-6">
      <ProductPulseWorkspace
        snapshot={snapshot}
        onOpenSources={onOpenSources}
      />
      <div className="supporting-grid">
        <RetentionHeatmap
          rows={snapshot.retention}
          mode={snapshot.mode}
        />
        <VoiceClusters
          clusters={snapshot.customerClusters}
          mode={snapshot.mode}
        />
      </div>
    </div>
  );

  const renderGrowthRiverComponent = () => (
    <div className="space-y-4">
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
    <section className="pulse-view space-y-6">
      {/* Top Filter Strip */}
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

      {/* Decision Home Primary Workspace */}
      {isWeb ? (
        <WebDecisionWorkspace
          snapshot={snapshot}
          onActionClick={handleActionClick}
          onOpenActionPlan={() => {
            const firstInsight = snapshot.insights[0];
            if (firstInsight) onOpenInsight(firstInsight.id);
          }}
          onOpenEvidence={() => {
            const firstInsight = snapshot.insights[0];
            if (firstInsight) onOpenInsight(firstInsight.id);
          }}
          renderAcquisitionAtlas={renderSupportingAnalytics}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <IOSDecisionWorkspace
              snapshot={snapshot}
              onActionClick={handleActionClick}
              onOpenActionPlan={() => {
                const firstInsight = snapshot.insights[0];
                if (firstInsight) onOpenInsight(firstInsight.id);
              }}
              onOpenEvidence={() => {
                const firstInsight = snapshot.insights[0];
                if (firstInsight) onOpenInsight(firstInsight.id);
              }}
              renderGrowthRiver={renderGrowthRiverComponent}
              renderSupportingAnalytics={renderSupportingAnalytics}
            />
          </div>

          <div className="lg:col-span-1">
            <InsightPanel
              insights={snapshot.insights}
              evidence={snapshot.evidence}
              actionProposals={snapshot.actionProposals}
              selectedInsightId={selectedInsightId}
              onSelectInsight={onSelectInsight}
              onOpenInsight={onOpenInsight}
            />
          </div>
        </div>
      )}
    </section>
  );
}
