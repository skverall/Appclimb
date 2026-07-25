"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Database,
  Info,
  MapPin,
} from "lucide-react";

import { GrowthReplay } from "@/components/growth-replay";
import { GrowthRiver } from "@/components/growth-river";
import { InsightPanel } from "@/components/insight-panel";
import { RetentionHeatmap } from "@/components/retention-heatmap";
import { VoiceClusters } from "@/components/voice-clusters";
import type { DashboardSnapshot } from "@/lib/contracts";

/**
 * The state badge in the confidence control. Mirrors the four snapshot modes:
 * demo (public landing), empty (no data yet), partial (stale or low volume),
 * and live (trustworthy). Calm tone per PRODUCT_DIRECTION §5 — no red/coral.
 */
function StateBadge({ snapshot }: { snapshot: DashboardSnapshot }) {
  if (snapshot.mode === "demo") {
    return (
      <span className="confidence-good confidence-demo">
        <Database size={14} /> Sample data
      </span>
    );
  }
  if (snapshot.mode === "empty") {
    return (
      <span className="confidence-good confidence-low">
        <Info size={14} /> No data yet
      </span>
    );
  }
  if (snapshot.mode === "partial") {
    return (
      <span className="confidence-good confidence-medium">
        <AlertTriangle size={14} /> Partial
      </span>
    );
  }
  return (
    <span className={`confidence-good confidence-${snapshot.confidence.level}`}>
      <CheckCircle2 size={14} />{" "}
      {snapshot.confidence.level[0].toUpperCase() +
        snapshot.confidence.level.slice(1)}
    </span>
  );
}

/**
 * A banner shown above the pulse grid when data is honest-but-incomplete. Empty
 * workspaces get a call-to-action; partial workspaces get the backend-supplied
 * reason (delayed or low volume). Live and demo modes render no banner.
 */
function StateBanner({ snapshot }: { snapshot: DashboardSnapshot }) {
  if (snapshot.mode === "empty") {
    return (
      <div className="state-banner state-banner-cta" role="status">
        <Info size={16} />
        <div>
          <strong>Connect a source to see your growth river.</strong>
          <span>
            Once a source syncs, AppClimb maps your funnel from discovery to
            renewal.
          </span>
        </div>
      </div>
    );
  }
  if (snapshot.mode === "partial" && snapshot.dataState?.reason) {
    return (
      <div className="state-banner state-banner-partial" role="status">
        <AlertTriangle size={16} />
        <div>
          <span>{snapshot.dataState.reason}</span>
        </div>
      </div>
    );
  }
  return null;
}

export function PulseView({
  snapshot,
  selectedInsightId,
  onSelectInsight,
  onOpenInsight,
  replayIndex,
  onReplayIndexChange,
}: {
  snapshot: DashboardSnapshot;
  selectedInsightId: string;
  onSelectInsight: (insightId: string) => void;
  onOpenInsight: (insightId: string) => void;
  replayIndex: number;
  onReplayIndexChange: (index: number) => void;
}) {
  return (
    <section className="pulse-view">
      <div className="filter-row">
        <div
          className="filter-control app-filter"
          aria-label={`Selected app: ${snapshot.app.name}`}
        >
          <span className="mini-app-icon">CD</span>
          <span>{snapshot.app.name}</span>
        </div>
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
          <StateBadge snapshot={snapshot} />
        </div>
      </div>

      <StateBanner snapshot={snapshot} />

      <div className="pulse-grid">
        <div className="river-column">
          <GrowthRiver
            stages={snapshot.stages}
            insights={snapshot.insights}
            activeInsightId={selectedInsightId}
            replayIndex={replayIndex}
            eventCount={snapshot.events.length}
            onSelectInsight={onSelectInsight}
          />
          <GrowthReplay
            events={snapshot.events}
            replayIndex={replayIndex}
            onReplayIndexChange={onReplayIndexChange}
          />
          <div className="supporting-grid">
            <RetentionHeatmap rows={snapshot.retention} />
            <VoiceClusters clusters={snapshot.customerClusters} />
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
