"use client";

import { memo, useMemo, useState } from "react";
import { area, curveCatmullRom } from "d3-shape";
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

import type { GrowthStage, Insight, StageId } from "@/lib/contracts";

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

const REPLAY_WIDTH_FACTORS = [
  [1, 1, 0.94, 0.88, 0.84, 0.82, 0.78, 0.72],
  [1, 1.01, 0.98, 0.86, 0.83, 0.82, 0.79, 0.74],
  [1, 1.03, 1, 0.82, 0.82, 0.8, 0.77, 0.7],
  [1, 1.02, 0.99, 0.68, 0.72, 0.74, 0.73, 0.68],
  [1, 1, 1, 1, 1, 1, 1, 1],
];

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
        displayWidth:
          stage.flowWidth * (REPLAY_WIDTH_FACTORS[factorIndex]?.[index] ?? 1),
      })),
    [factorIndex, stages],
  );
  const path = useMemo(
    () =>
      area<(typeof stagePoints)[number]>()
        .x((_, index) => 62 + index * (932 / Math.max(stagePoints.length - 1, 1)))
        .y0((stage) => 210 + stage.displayWidth / 2)
        .y1((stage) => 210 - stage.displayWidth / 2)
        .curve(curveCatmullRom.alpha(0.56))(stagePoints) ?? "",
    [stagePoints],
  );

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
            <i className="legend-line bottleneck" /> Confirmed bottleneck
          </span>
        </div>
      </div>

      <div className="river-canvas">
        <svg
          className="river-svg"
          viewBox="0 0 1056 360"
          preserveAspectRatio="none"
          role="img"
          aria-label="Growth river from discovery to renewal, with a confirmed activation bottleneck"
        >
          <defs>
            <linearGradient id="riverGradient" x1="0%" x2="100%">
              <stop offset="0%" stopColor="#34c8b4" />
              <stop offset="21%" stopColor="#24b9bd" />
              <stop offset="34%" stopColor="#2aaec0" />
              <stop offset="41%" stopColor="#f39a82" />
              <stop offset="48%" stopColor="#e97767" />
              <stop offset="57%" stopColor="#4c9fd0" />
              <stop offset="76%" stopColor="#3aaec4" />
              <stop offset="100%" stopColor="#46beac" />
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
            <pattern
              id="riverTexture"
              width="28"
              height="28"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M-7 20 Q 0 14 7 20 T 21 20 T 35 20"
                fill="none"
                stroke="rgba(255,255,255,.2)"
                strokeWidth="1.5"
              />
            </pattern>
          </defs>
          <path
            className="river-path"
            d={path}
            fill="url(#riverGradient)"
            filter="url(#riverShadow)"
          />
          <path d={path} fill="url(#riverTexture)" opacity=".68" />
          <path
            d="M60 210 C190 190 288 227 412 208 C512 192 602 215 728 203 C846 192 926 212 1005 201"
            fill="none"
            stroke="rgba(255,255,255,.44)"
            strokeWidth="2"
            strokeDasharray="5 10"
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
                style={{ left: `${5.9 + index * (88.2 / 7)}%` }}
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

        <div className="bottleneck-callout">
          <span className="bottleneck-dot" />
          <div>
            <strong>First confirmed bottleneck</strong>
            <span>Activation · 16.2 pts below baseline</span>
          </div>
        </div>
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
