"use client";

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
  return (
    <section className="pulse-view">
      <ProductPulseWorkspace
        snapshot={snapshot}
        onOpenSources={onOpenSources}
      />
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

      <div className="pulse-grid">
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
        <InsightPanel
          insights={snapshot.insights}
          evidence={snapshot.evidence}
          actionProposals={snapshot.actionProposals}
          selectedInsightId={selectedInsightId}
          onSelectInsight={onSelectInsight}
          onOpenInsight={onOpenInsight}
        />
      </div>
    </section>
  );
}
