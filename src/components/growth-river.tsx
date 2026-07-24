"use client";

import { memo, useMemo, useState } from "react";
import { area, curveCatmullRom, line } from "d3-shape";
import {
  ArrowDownToLine,
  Compass,
  CreditCard,
  PanelTop,
  RefreshCw,
  Sparkles,
  Store,
  X,
  Zap,
} from "lucide-react";

import type { GrowthStage, Insight, StageHealth, StageId } from "@/lib/contracts";

const ICONS = {
  discover: Compass,
  store: Store,
  install: ArrowDownToLine,
  activate: Zap,
  paywall: PanelTop,
  trial: Sparkles,
  paid: CreditCard,
  renew: RefreshCw,
} satisfies Record<StageId, typeof Compass>;

/** Color encodes stage health only — never decoration. */
const HEALTH_COLORS: Record<StageHealth, string> = {
  healthy: "#3bc0af",
  watch: "#eeb765",
  critical: "#e97361",
  unknown: "#b9c6c4",
};

const VIEW_W = 1056;
const VIEW_H = 360;
const CENTER_Y = 210;
const X_START = 62;
const X_END = 994;
const RIVER_CURVE = curveCatmullRom.alpha(0.56);

const REPLAY_WIDTH_FACTORS = [
  [1, 1, 0.94, 0.88, 0.84, 0.82, 0.78, 0.72],
  [1, 1.01, 0.98, 0.86, 0.83, 0.82, 0.79, 0.74],
  [1, 1.03, 1, 0.82, 0.82, 0.8, 0.77, 0.7],
  [1, 1.02, 0.99, 0.68, 0.72, 0.74, 0.73, 0.68],
  [1, 1, 1, 1, 1, 1, 1, 1],
];

function stageLeftPct(index: number, count: number): number {
  return 5.9 + index * (88.2 / Math.max(count - 1, 1));
}

export const GrowthRiver = memo(function GrowthRiver({
  stages,
  insights,
  activeInsightId,
  replayIndex,
  eventCount,
  onSelectInsight,
}: {
  stages: GrowthStage[];
  insights: Insight[];
  activeInsightId: string;
  replayIndex: number;
  eventCount: number;
  onSelectInsight: (insightId: string) => void;
}) {
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const activeInsight = insights.find(
    (insight) => insight.id === activeInsightId,
  );
  const factorIndex = Math.min(
    REPLAY_WIDTH_FACTORS.length - 1,
    Math.round((replayIndex / Math.max(eventCount, 1)) * 4),
  );
  const stagePoints = useMemo(
    () =>
      stages.map((stage, index) => ({
        ...stage,
        x:
          X_START +
          index * ((X_END - X_START) / Math.max(stages.length - 1, 1)),
        displayWidth:
          stage.flowWidth * (REPLAY_WIDTH_FACTORS[factorIndex]?.[index] ?? 1),
      })),
    [factorIndex, stages],
  );

  const riverPath = useMemo(
    () =>
      area<(typeof stagePoints)[number]>()
        .x((stage) => stage.x)
        .y0((stage) => CENTER_Y + stage.displayWidth / 2)
        .y1((stage) => CENTER_Y - stage.displayWidth / 2)
        .curve(RIVER_CURVE)(stagePoints) ?? "",
    [stagePoints],
  );

  /** True center of the river, derived from the same points and curve. */
  const currentPath = useMemo(
    () =>
      line<(typeof stagePoints)[number]>()
        .x((stage) => stage.x)
        .y(() => CENTER_Y)
        .curve(RIVER_CURVE)(stagePoints) ?? "",
    [stagePoints],
  );

  /** Soft rim light along the top edge of the river. */
  const rimPath = useMemo(
    () =>
      line<(typeof stagePoints)[number]>()
        .x((stage) => stage.x)
        .y((stage) => CENTER_Y - stage.displayWidth / 2 + 2)
        .curve(RIVER_CURVE)(stagePoints) ?? "",
    [stagePoints],
  );

  /**
   * Gradient stops are computed from stage health, so color stays truthful
   * when data changes. Transitions are blended inside a narrow band between
   * neighbouring stages.
   */
  const gradientStops = useMemo(() => {
    const count = stagePoints.length;
    if (count === 0) return [];
    const pctAt = (index: number) =>
      (index / Math.max(count - 1, 1)) * 100;
    const stops: { offset: number; color: string }[] = [
      { offset: 0, color: HEALTH_COLORS[stagePoints[0].health] },
    ];
    for (let index = 1; index < count; index += 1) {
      const prev = pctAt(index - 1);
      const next = pctAt(index);
      const halfBand = (next - prev) * 0.24;
      const mid = (prev + next) / 2;
      stops.push({
        offset: mid - halfBand,
        color: HEALTH_COLORS[stagePoints[index - 1].health],
      });
      stops.push({
        offset: mid + halfBand,
        color: HEALTH_COLORS[stagePoints[index].health],
      });
    }
    stops.push({
      offset: 100,
      color: HEALTH_COLORS[stagePoints[count - 1].health],
    });
    return stops;
  }, [stagePoints]);

  const bottleneckIndex = useMemo(() => {
    const critical = stagePoints.findIndex(
      (stage) => stage.health === "critical",
    );
    if (critical >= 0) return critical;
    return stagePoints.findIndex((stage) => stage.health === "watch");
  }, [stagePoints]);
  const bottleneckStage =
    bottleneckIndex >= 0 ? stagePoints[bottleneckIndex] : undefined;

  return (
    <section className="river-card" aria-labelledby="growth-river-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Observe</span>
          <h2 id="growth-river-title">Growth River</h2>
        </div>
        <div className="river-legend" aria-label="River legend">
          <span>
            <i className="legend-line healthy" /> Healthy flow
          </span>
          <span>
            <i className="legend-line watch" /> Watch
          </span>
          <span>
            <i className="legend-line bottleneck" /> Confirmed bottleneck
          </span>
        </div>
      </div>

      <div className="river-canvas">
        <svg
          className="river-svg"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Growth river from discovery to renewal, with a confirmed activation bottleneck"
        >
          <defs>
            <linearGradient id="riverGradient" x1="0%" x2="100%">
              {gradientStops.map((stop) => (
                <stop
                  key={`${stop.offset}-${stop.color}`}
                  offset={`${stop.offset}%`}
                  stopColor={stop.color}
                />
              ))}
            </linearGradient>
            <filter id="riverShadow" x="-10%" y="-30%" width="120%" height="160%">
              <feDropShadow
                dx="0"
                dy="8"
                stdDeviation="12"
                floodColor="#1b766f"
                floodOpacity=".14"
              />
            </filter>
          </defs>
          <path
            className="river-path"
            d={riverPath}
            fill="url(#riverGradient)"
            filter="url(#riverShadow)"
          />
          <path
            className="river-rim"
            d={rimPath}
            fill="none"
            stroke="rgba(255,255,255,.3)"
            strokeWidth="1.6"
            pointerEvents="none"
          />
          <path
            className="river-current"
            d={currentPath}
            fill="none"
            stroke="rgba(255,255,255,.55)"
            strokeWidth="2"
            strokeDasharray="0.1 9"
            strokeLinecap="round"
            pointerEvents="none"
          />
        </svg>

        <div className="stage-overlay">
          {stages.map((stage, index) => {
            const Icon = ICONS[stage.id];
            const stageInsight = insights.find(
              (insight) => insight.stageId === stage.id,
            );
            const isSelected = activeInsight?.stageId === stage.id;

            return (
              <button
                type="button"
                key={stage.id}
                className={[
                  "stage-node",
                  `stage-${stage.health}`,
                  isSelected ? "selected" : "",
                ].join(" ")}
                style={{ left: `${stageLeftPct(index, stages.length)}%` }}
                onClick={() =>
                  stageInsight && onSelectInsight(stageInsight.id)
                }
                aria-label={`${stage.label}: ${stage.formattedValue}${
                  stage.conversionRate === null
                    ? ""
                    : `, ${(stage.conversionRate * 100).toFixed(1)}% conversion`
                }`}
              >
                <span className="stage-label">{stage.label}</span>
                <span className="stage-icon">
                  <Icon size={18} strokeWidth={2} />
                </span>
                <span className="stage-value">{stage.formattedValue}</span>
                <span className="stage-rate">
                  {stage.conversionRate === null
                    ? "Entry volume"
                    : `${(stage.conversionRate * 100).toFixed(1)}%`}
                </span>
              </button>
            );
          })}
        </div>

        {bottleneckStage && (
          <div
            className={`bottleneck-callout callout-${bottleneckStage.health}`}
            style={{
              left: `${stageLeftPct(bottleneckIndex, stagePoints.length)}%`,
            }}
          >
            <span className="bottleneck-dot" />
            <div>
              <strong>
                {bottleneckStage.health === "critical"
                  ? "First confirmed bottleneck"
                  : "Stage to watch"}
              </strong>
              <span>
                {bottleneckStage.label}
                {bottleneckStage.conversionRate === null
                  ? ""
                  : ` · ${(bottleneckStage.conversionRate * 100).toFixed(1)}% conversion`}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="river-footer">
        <span>
          Width = people moving forward
          <i>•</i>
          Color = stage health
        </span>
        <span>
          Source of truth changes by stage
          <button type="button" onClick={() => setMethodologyOpen(true)}>
            View methodology
          </button>
        </span>
      </div>

      {methodologyOpen && (
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setMethodologyOpen(false);
            }
          }}
        >
          <section
            className="settings-dialog methodology-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="methodology-title"
          >
            <button
              className="settings-close"
              type="button"
              aria-label="Close methodology"
              onClick={() => setMethodologyOpen(false)}
            >
              <X size={18} />
            </button>
            <span className="eyebrow">How River Atlas works</span>
            <h2 id="methodology-title">Evidence before advice</h2>
            <div className="methodology-grid">
              <div>
                <strong>1 · Follow the flow</strong>
                <p>
                  Width represents observed volume moving from discovery to
                  renewal. Stage conversion uses the preceding stage as its
                  denominator.
                </p>
              </div>
              <div>
                <strong>2 · Respect source ownership</strong>
                <p>
                  Apple owns store metrics, PostHog product behavior,
                  Superwall paywalls, and RevenueCat subscription lifecycle.
                </p>
              </div>
              <div>
                <strong>3 · Break ties upstream</strong>
                <p>
                  AppClimb surfaces the earliest material loss with sufficient
                  freshness and volume so downstream symptoms are not blamed.
                </p>
              </div>
              <div>
                <strong>4 · Keep uncertainty visible</strong>
                <p>
                  Every diagnosis is Observed, Derived, or Hypothesis and keeps
                  its evidence window and confidence attached.
                </p>
              </div>
            </div>
            <div className="settings-security-note">
              <p>
                AppClimb creates read-only action proposals. It never changes
                metadata, paywalls, ads, or experiments for you.
              </p>
            </div>
          </section>
        </div>
      )}
    </section>
  );
});
