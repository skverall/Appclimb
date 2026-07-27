"use client";

import { area, curveCatmullRom, line } from "d3-shape";
import {
  AreaChart,
  BarChart3,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CloudCog,
  Code2,
  Filter,
  Globe2,
  Info,
  LineChart,
  LoaderCircle,
  MousePointerClick,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { BrandIcon, SourceBrandIcon } from "@/components/brand-icon";
import { TrackingVerificationGate } from "@/components/tracking-verification-gate";
import { TrackingInstallWizard } from "@/components/web-tracking/tracking-install-wizard";
import { TrackingStatusPill } from "@/components/web-tracking/tracking-status";
import { buildTrackingSnippet } from "@/components/web-tracking/tracking-snippet";
import { useWebInstallState } from "@/components/web-tracking/use-web-install-state";
import type {
  AcquisitionBreakdownRow,
  AcquisitionChannel,
  AcquisitionEnvelope,
  AcquisitionSeriesPoint,
  AcquisitionSnapshot,
  CrawlerCategory,
} from "@/lib/acquisition";
import { isAcquisitionEnvelope } from "@/lib/acquisition";
import {
  demoAcquisitionSnapshotForWindow,
  emptyAcquisitionSnapshot,
} from "@/lib/acquisition-demo";

const CHANNEL_COLORS: Record<AcquisitionChannel | "Referral", string> = {
  Direct: "#278f8a",
  "Organic Search": "#72ad5d",
  Social: "#5f82cb",
  "AI Referral": "#9485dc",
  Campaigns: "#d99a2b",
  Referral: "#8b9aa5",
};

const FLAG_EMOJI: Record<string, string> = {
  AU: "🇦🇺",
  BR: "🇧🇷",
  CA: "🇨🇦",
  DE: "🇩🇪",
  FR: "🇫🇷",
  GB: "🇬🇧",
  IN: "🇮🇳",
  JP: "🇯🇵",
  SG: "🇸🇬",
  US: "🇺🇸",
  UZ: "🇺🇿",
};

const CRAWLER_TAB_LABELS: Record<CrawlerCategory, string> = {
  ai_answer: "AI answers",
  search_index: "Indexing",
  model_training: "Training",
  other: "Other",
};

type BreakdownTab = "channel" | "referrer" | "campaign" | "utm";
type CrawlerChartShape = "area" | "bars" | "line";
type VisitorRange = "today" | "yesterday" | "7d" | "all";

/**
 * Yesterday needs at least this many visitors before a day-over-day figure is
 * expressed as a percentage rather than as two counts.
 */
const VISITOR_DELTA_MIN_BASE = 5;

/**
 * Today against yesterday, phrased so it cannot overstate its own precision.
 *
 * A percentage off a handful of visitors is false precision: 1 visitor
 * yesterday and 11 today is a truthful "+1000%" and a useless one. Below
 * `VISITOR_DELTA_MIN_BASE` the comparison is stated in whole visitors instead,
 * which is the same restraint the funnel applies to its own rates.
 */
export function describeDayOverDay(
  today: number,
  yesterday: number,
): { direction: "up" | "down"; label: string } | null {
  if (yesterday === 0 && today === 0) return null;
  const direction = today >= yesterday ? "up" : "down";
  if (yesterday < VISITOR_DELTA_MIN_BASE) {
    return {
      direction,
      label: `${formatNumber(today)} today vs ${formatNumber(yesterday)} yesterday`,
    };
  }
  return {
    direction,
    label: `${formatPercent(Math.abs((today - yesterday) / yesterday))} vs yesterday`,
  };
}

const VISITOR_RANGE_LABELS: Record<VisitorRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  all: "All",
};

/**
 * Whole days between a visit and the snapshot it belongs to. Days are counted
 * in UTC against the snapshot's own date so a row cannot drift into a
 * different bucket while the page sits open. Returns null for an unparseable
 * or future timestamp rather than guessing a bucket for it.
 */
export function visitorBucket(
  lastSeen: string,
  reference: number,
): number | null {
  const seen = Date.parse(lastSeen);
  if (Number.isNaN(seen) || Number.isNaN(reference)) return null;
  const startOfDay = (value: number) => {
    const date = new Date(value);
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );
  };
  const diff = startOfDay(reference) - startOfDay(seen);
  if (diff < 0) return 0;
  return Math.floor(diff / 86_400_000);
}

/** Sankey geometry. The funnel headings derive their position from these too. */
const FLOW = {
  viewWidth: 940,
  viewHeight: 220,
  bandTop: 70,
  bandHeight: 124,
  nodeWidth: 9,
  entryX: 8,
  // Channels enter across a taller, gapped span than they occupy at the
  // visitors node, so the ribbons visibly converge instead of running flat.
  entryTop: 46,
  entrySpan: 162,
  entryGap: 8,
  visitorsX: 352,
  engagedX: 654,
  convertedX: 872,
} as const;

const FLOW_BAND_CENTER = FLOW.bandTop + FLOW.bandHeight / 2;

/**
 * Below this many visitors the flow still draws to scale, but the rates it
 * implies are not yet stable — 9 of 11 engaged and 9 of 11000 engaged produce
 * the same ribbon while carrying very different confidence. The chart stays;
 * a caveat is shown alongside it so the shape is not read as a settled rate.
 */
const FLOW_MIN_VISITORS = 50;

/** How far a dropped-off band travels before it dissolves out of the plot. */
const FLOW_DROP_OFFSET = 26;

type FlowStageId = "visitors" | "engaged" | "converted";

interface FlowStage {
  id: FlowStageId;
  label: string;
  count: number;
  shareOfVisitors: number;
  /** Fraction of the previous stop that carried over. Null at the entry stop. */
  keptFromPrevious: number | null;
  lostFromPrevious: number | null;
  previousLabel: string | null;
  x: number;
  trend: { change: number; days: number } | null;
}

/**
 * A Sankey funnel has no innate "up is good" reading, so each stage carries an
 * explicit direction derived from the series: the most recent half of the
 * window against the half before it. This is the same period-over-period
 * comparison the crawler card uses, and it is the only one a single snapshot
 * supports. Below `minPoints` days the comparison is withheld rather than
 * shown at low confidence.
 */
function stageTrend(
  series: AcquisitionSeriesPoint[],
  pick: (point: AcquisitionSeriesPoint) => number,
  minPoints = 4,
): { change: number; days: number } | null {
  if (series.length < minPoints) return null;
  const ordered = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const half = Math.floor(ordered.length / 2);
  if (half === 0) return null;
  const previous = ordered.slice(0, half).reduce((sum, p) => sum + pick(p), 0);
  const recent = ordered
    .slice(ordered.length - half)
    .reduce((sum, p) => sum + pick(p), 0);
  if (previous === 0) return null;
  return { change: (recent - previous) / previous, days: half };
}

function channelColor(label: string) {
  return (
    CHANNEL_COLORS[label as AcquisitionChannel] ?? CHANNEL_COLORS.Referral
  );
}

function flowNodeCenterPercent(x: number) {
  return `${(((x + FLOW.nodeWidth / 2) / FLOW.viewWidth) * 100).toFixed(2)}%`;
}

/** Closed path between two vertical edges, eased so channels read as ribbons. */
function ribbonPath(
  startX: number,
  startTop: number,
  startBottom: number,
  endX: number,
  endTop: number,
  endBottom: number,
) {
  const span = endX - startX;
  const control = startX + span * 0.44;
  const controlEnd = startX + span * 0.56;
  return [
    `M ${startX},${startTop}`,
    `C ${control},${startTop} ${controlEnd},${endTop} ${endX},${endTop}`,
    `L ${endX},${endBottom}`,
    `C ${controlEnd},${endBottom} ${control},${startBottom} ${startX},${startBottom}`,
    "Z",
  ].join(" ");
}

export function AcquisitionAtlas({
  authenticated,
  demo,
  defaultWindowDays = 30,
  appId = "",
}: {
  authenticated: boolean;
  demo: boolean;
  /**
   * Keeps the Atlas on the same reporting window as the Growth River
   * projection it shares the Pulse screen with.
   */
  defaultWindowDays?: 7 | 30 | 90;
  /** Active workspace app — scopes multi-property Acquisition data. */
  appId?: string;
}) {
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(defaultWindowDays);
  const [snapshot, setSnapshot] = useState<AcquisitionSnapshot>(
    demo
      ? demoAcquisitionSnapshotForWindow(defaultWindowDays)
      : emptyAcquisitionSnapshot(),
  );
  const [loading, setLoading] = useState(authenticated && !demo);
  const [error, setError] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyAttempted, setVerifyAttempted] = useState(false);
  /** Lets a user with a stale install skip past the reconnect card. */
  const [dismissStaleGate, setDismissStaleGate] = useState(false);
  const collectorOrigin =
    typeof window === "undefined"
      ? "https://appclimb.app"
      : window.location.origin;
  /**
   * Task P0.27 — setup position is server-derived, so the Atlas never replaces
   * an unfinished install with empty charts, and a reload resumes in place.
   */
  const install = useWebInstallState({
    appId,
    enabled: authenticated && !demo,
  });

  const loadSnapshot = useCallback(async () => {
    if (!authenticated || demo) {
      setSnapshot(demoAcquisitionSnapshotForWindow(windowDays));
      return null;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ days: String(windowDays) });
      if (appId) params.set("appId", appId);
      const response = await fetch(`/api/acquisition?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          response.status === 402 ? "plan_required" : "load_failed",
        );
      }
      const payload = (await response.json()) as unknown;
      if (!isAcquisitionEnvelope(payload)) {
        throw new Error("invalid_snapshot");
      }
      const envelope = payload as AcquisitionEnvelope;
      const next: AcquisitionSnapshot = {
        ...(envelope.data as Omit<
          AcquisitionSnapshot,
          "mode" | "windowDays"
        >),
        mode: envelope.meta?.mode ?? "empty",
        windowDays: envelope.meta?.windowDays ?? windowDays,
      };
      setSnapshot(next);
      return next;
    } catch (loadError) {
      setError(
        loadError instanceof Error && loadError.message === "plan_required"
          ? "Acquisition Atlas is available while your workspace access is active."
          : "Acquisition data could not be loaded. Your Growth River data is unchanged.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, [authenticated, demo, windowDays, appId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSnapshot(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSnapshot]);

  const property = snapshot.property;
  const trackingSnippet = property?.trackingToken
    ? buildTrackingSnippet({
        domain: property.domain,
        trackingToken: property.trackingToken,
        collectorOrigin,
      })
    : "";

  const workspaceView = authenticated && !demo;
  /**
   * The wizard owns every pre-verification state. A saved domain is never
   * replaced by empty charts, and `Tracking installed` requires a real event.
   */
  const setupIncomplete =
    workspaceView && install.loaded && !install.state.trackingInstalled;
  const showWizard = workspaceView && (setupOpen || setupIncomplete);
  /** Previously verified, then the events stopped: reconnect, do not pretend. */
  const showStaleGate =
    workspaceView &&
    !showWizard &&
    install.state.status === "stale" &&
    !dismissStaleGate;

  const verifyConnection = async () => {
    setVerifying(true);
    setVerifyAttempted(true);
    try {
      await Promise.all([loadSnapshot(), install.refresh()]);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <section
      className="acquisition-atlas"
      aria-labelledby="acquisition-atlas-title"
    >
      <div className="atlas-heading-row">
        <div>
          <div className="atlas-title-line">
            <h2 id="acquisition-atlas-title">Acquisition Atlas</h2>
            <Code2 size={17} aria-hidden="true" />
          </div>
          <p>
            Human referrals and server-side crawler requests, kept separate.
          </p>
        </div>
        <div className="atlas-actions">
          <label className="atlas-select">
            <CalendarDays size={15} aria-hidden="true" />
            <span className="sr-only">Analytics window</span>
            <select
              value={windowDays}
              onChange={(event) =>
                setWindowDays(Number(event.target.value) as 7 | 30 | 90)
              }
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <span
            className={`atlas-data-state atlas-data-${snapshot.mode}`}
            title={
              snapshot.mode === "demo"
                ? "Synthetic sample data"
                : "Collected by AppClimb"
            }
          >
            <span />
            {snapshot.mode === "demo"
              ? "Demo data"
              : snapshot.mode === "live"
                ? "Live data"
                : "Waiting for data"}
          </span>
          <button
            className="atlas-refresh"
            type="button"
            onClick={() => void loadSnapshot()}
            disabled={loading}
            aria-label="Refresh acquisition data"
          >
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            <span>
              {snapshot.mode === "demo"
                ? "Sample snapshot"
                : `Updated ${relativeTime(snapshot.generatedAt)}`}
            </span>
          </button>
          <div className="atlas-filter-wrap">
            <button
              className="atlas-filter-button"
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
            >
              <Filter size={15} /> Filters
            </button>
            {filtersOpen && (
              <div className="atlas-filter-popover">
                <strong>Scope</strong>
                <span>All countries</span>
                <span>All devices</span>
                <span>All sources</span>
                <small>
                  Advanced filters will appear once the property has live
                  traffic.
                </small>
              </div>
            )}
          </div>
          {workspaceView && install.loaded && install.snapshot.property && (
            <TrackingStatusPill state={install.state} />
          )}
          {property?.trackingToken && (
            <button
              className="atlas-setup-button"
              type="button"
              onClick={() => setSetupOpen((current) => !current)}
            >
              <Code2 size={15} />{" "}
              {install.state.trackingInstalled ? "Install" : "Continue setup"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="atlas-error" role="alert">
          <CircleHelp size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => void loadSnapshot()}>
            Retry
          </button>
        </div>
      )}

      {showWizard ? (
        <TrackingInstallWizard
          appId={appId}
          collectorOrigin={collectorOrigin}
          finishLabel="Open live Acquisition Atlas"
          onPropertyCreated={(created) => {
            setSnapshot((current) => ({
              ...current,
              property: {
                id: created.id,
                name: created.name,
                domain: created.domain,
                trackingToken: created.trackingToken,
                tokenVersion: created.tokenVersion ?? 1,
                retentionDays: 90,
                createdAt: created.createdAt ?? new Date().toISOString(),
              },
            }));
          }}
          onFinish={() => {
            setSetupOpen(false);
            void loadSnapshot();
          }}
        />
      ) : showStaleGate && property ? (
        <TrackingVerificationGate
          property={property}
          snippet={trackingSnippet}
          collectorOrigin={collectorOrigin}
          checking={verifying || loading}
          lastCheckFailed={verifyAttempted && !install.state.live}
          verified={install.state.live}
          onCheck={() => void verifyConnection()}
          onVerifiedContinue={() => setDismissStaleGate(true)}
        />
      ) : (
        <>
          <AcquisitionFlow snapshot={snapshot} loading={loading} />
          <div className="atlas-grid">
            <div className="atlas-left-stack">
              <div className="atlas-summary-grid">
                <BreakdownCard snapshot={snapshot} />
                <LandingPagesCard snapshot={snapshot} />
              </div>
              <VisitorJourneys snapshot={snapshot} />
            </div>
            <CrawlerCurrent snapshot={snapshot} />
          </div>
        </>
      )}

      {snapshot.mode === "demo" && (
        <p className="atlas-demo-disclaimer">
          Demo data for illustration only · Not production traffic
        </p>
      )}
    </section>
  );
}

function AcquisitionFlow({
  snapshot,
  loading,
}: {
  snapshot: AcquisitionSnapshot;
  loading: boolean;
}) {
  const channels = snapshot.channels.slice(0, 6);
  const total = Math.max(
    snapshot.totals.visitors,
    channels.reduce((sum, channel) => sum + channel.visitors, 0),
    1,
  );
  const engagedRate =
    snapshot.totals.visitors > 0
      ? snapshot.totals.engaged / snapshot.totals.visitors
      : 0;
  const convertedRate =
    snapshot.totals.visitors > 0
      ? snapshot.totals.converted / snapshot.totals.visitors
      : 0;

  const engagedHeight = Math.max(1, engagedRate * FLOW.bandHeight);
  const convertedHeight = Math.max(1, convertedRate * FLOW.bandHeight);
  const smallSample =
    snapshot.totals.visitors > 0 &&
    snapshot.totals.visitors < FLOW_MIN_VISITORS;

  const [hoveredStage, setHoveredStage] = useState<FlowStageId | null>(null);

  /**
   * The three funnel stops, each with the two things a first-time reader needs
   * and the chart alone cannot convey: how many of the previous stop carried
   * over, and whether that is better or worse than the previous period.
   */
  const stages = useMemo<FlowStage[]>(() => {
    const { visitors, engaged, converted } = snapshot.totals;
    return [
      {
        id: "visitors",
        label: "Visitors",
        count: visitors,
        shareOfVisitors: visitors > 0 ? 1 : 0,
        keptFromPrevious: null,
        lostFromPrevious: null,
        previousLabel: null,
        x: FLOW.visitorsX,
        trend: stageTrend(snapshot.series, (p) => p.visitors),
      },
      {
        id: "engaged",
        label: "Engaged",
        count: engaged,
        shareOfVisitors: engagedRate,
        keptFromPrevious: visitors > 0 ? engaged / visitors : null,
        lostFromPrevious: Math.max(0, visitors - engaged),
        previousLabel: "Visitors",
        x: FLOW.engagedX,
        trend: stageTrend(snapshot.series, (p) => p.engaged),
      },
      {
        id: "converted",
        label: "Converted",
        count: converted,
        shareOfVisitors: convertedRate,
        keptFromPrevious: engaged > 0 ? converted / engaged : null,
        lostFromPrevious: Math.max(0, engaged - converted),
        previousLabel: "Engaged",
        x: FLOW.convertedX,
        trend: stageTrend(snapshot.series, (p) => p.converted),
      },
    ];
  }, [snapshot.totals, snapshot.series, engagedRate, convertedRate]);

  /**
   * Each channel enters as its own band and lands stacked against the visitors
   * node, so ribbon thickness stays proportional to visitors on both edges.
   */
  const ribbons = useMemo(() => {
    const entryTotalGap = FLOW.entryGap * Math.max(channels.length - 1, 0);
    const entryHeight = Math.max(FLOW.entrySpan - entryTotalGap, 24);
    let entryCursor = FLOW.entryTop;
    let stackCursor = FLOW.bandTop;

    return channels.map((channel) => {
      const share = channel.visitors / total;
      // Floors only exist to keep a band clickable, so they are kept just
      // under a pixel of visible weight. At 2.5px any channel below ~2% of
      // traffic was drawn thicker than its share.
      const entrySpan = Math.max(1, share * entryHeight);
      const stackSpan = Math.max(1, share * FLOW.bandHeight);
      const entryTop = entryCursor;
      const stackTop = stackCursor;
      entryCursor += entrySpan + FLOW.entryGap;
      stackCursor += stackSpan;

      return {
        key: channel.key,
        title: `${channel.label}: ${formatNumber(
          channel.visitors,
        )} visitors (${formatPercent(share)})`,
        path: ribbonPath(
          FLOW.entryX,
          entryTop,
          entryTop + entrySpan,
          FLOW.visitorsX,
          stackTop,
          stackTop + stackSpan,
        ),
      };
    });
  }, [channels, total]);

  const engagedRibbon = ribbonPath(
    FLOW.visitorsX + FLOW.nodeWidth,
    FLOW.bandTop,
    FLOW.bandTop + FLOW.bandHeight,
    FLOW.engagedX,
    FLOW_BAND_CENTER - engagedHeight / 2,
    FLOW_BAND_CENTER + engagedHeight / 2,
  );
  const convertedRibbon = ribbonPath(
    FLOW.engagedX + FLOW.nodeWidth,
    FLOW_BAND_CENTER - engagedHeight / 2,
    FLOW_BAND_CENTER + engagedHeight / 2,
    FLOW.convertedX,
    FLOW_BAND_CENTER - convertedHeight / 2,
    FLOW_BAND_CENTER + convertedHeight / 2,
  );

  /**
   * The people who did not carry over.
   *
   * Convergence alone reads as "the line got thinner", not as "these many
   * people left" — the single most common misreading of a Sankey by someone
   * who has not seen one before. Each loss is therefore drawn as its own band
   * that spills away from the flow and dissolves, so the narrowing has a
   * visible cause. The spills open outward while the kept ribbon converges
   * inward, so the two never overlap.
   */
  const spills = useMemo(() => {
    function spillPair(
      fromX: number,
      inflowTop: number,
      inflowBottom: number,
      toX: number,
      keptTop: number,
      keptBottom: number,
      lostCount: number,
      id: string,
    ) {
      const lost = inflowBottom - inflowTop - (keptBottom - keptTop);
      if (lost <= 0.5 || lostCount <= 0) return [];
      const half = lost / 2;
      return [
        {
          id: `${id}-top`,
          path: ribbonPath(
            fromX,
            inflowTop,
            inflowTop,
            toX,
            keptTop - FLOW_DROP_OFFSET - half,
            keptTop - FLOW_DROP_OFFSET,
          ),
        },
        {
          id: `${id}-bottom`,
          path: ribbonPath(
            fromX,
            inflowBottom,
            inflowBottom,
            toX,
            keptBottom + FLOW_DROP_OFFSET,
            keptBottom + FLOW_DROP_OFFSET + half,
          ),
        },
      ];
    }

    return [
      ...spillPair(
        FLOW.visitorsX + FLOW.nodeWidth,
        FLOW.bandTop,
        FLOW.bandTop + FLOW.bandHeight,
        FLOW.engagedX,
        FLOW_BAND_CENTER - engagedHeight / 2,
        FLOW_BAND_CENTER + engagedHeight / 2,
        Math.max(0, snapshot.totals.visitors - snapshot.totals.engaged),
        "engaged",
      ),
      ...spillPair(
        FLOW.engagedX + FLOW.nodeWidth,
        FLOW_BAND_CENTER - engagedHeight / 2,
        FLOW_BAND_CENTER + engagedHeight / 2,
        FLOW.convertedX,
        FLOW_BAND_CENTER - convertedHeight / 2,
        FLOW_BAND_CENTER + convertedHeight / 2,
        Math.max(0, snapshot.totals.engaged - snapshot.totals.converted),
        "converted",
      ),
    ];
  }, [
    engagedHeight,
    convertedHeight,
    snapshot.totals.visitors,
    snapshot.totals.engaged,
    snapshot.totals.converted,
  ]);

  const hovered = stages.find((stage) => stage.id === hoveredStage) ?? null;

  return (
    <article className={`atlas-flow-card ${loading ? "atlas-loading" : ""}`}>
      {loading && (
        <div className="atlas-loading-layer">
          <LoaderCircle className="spin" size={22} />
          <span>Loading acquisition flow…</span>
        </div>
      )}
      <div className="atlas-channel-list">
        <span className="atlas-column-label">Channels</span>
        {channels.length > 0 ? (
          channels.map((channel) => (
            <div className="atlas-channel-row" key={channel.key}>
              <span
                className="atlas-channel-dot"
                style={{
                  background:
                    CHANNEL_COLORS[
                      channel.label as AcquisitionChannel
                    ] ?? CHANNEL_COLORS.Referral,
                }}
              />
              <SourceBrandIcon
                channel={channel.label}
                detail={channel.detail}
                size={16}
                className="atlas-channel-icon"
              />
              <div>
                <strong>{channel.label}</strong>
                <small>{channel.detail || channel.key}</small>
              </div>
              <div>
                <strong>{formatNumber(channel.visitors)}</strong>
                <small>{formatPercent(channel.visitors / total)}</small>
              </div>
            </div>
          ))
        ) : (
          <div className="atlas-channel-empty">
            <Globe2 size={22} />
            <span>Sources will appear after the first visit.</span>
          </div>
        )}
        {/*
         * Read as: how to read it, then what is good, then the caveat. A first
         * time reader has no prior for a Sankey, so the direction of "better"
         * is stated outright rather than implied by the shape.
         */}
        <div className="atlas-flow-legend">
          <strong>Read left to right</strong>
          <span>
            Each band is people. It narrows where they drop off, and the faded
            bands are the ones who left.
          </span>
          <span className="atlas-flow-legend-good">
            Wider on the right is better — more visitors reaching the end.
          </span>
          <span>Human traffic only — crawlers are charted separately</span>
        </div>
      </div>
      <div className="atlas-sankey-wrap">
        {smallSample && (
          <p className="atlas-small-sample-note" role="note">
            <Info size={13} />
            {`Only ${formatNumber(snapshot.totals.visitors)} visitors in this window — the bands are to scale, but the rates they imply are not yet stable.`}
          </p>
        )}
        {/**
         * The headings are absolutely positioned over the plot, so they need a
         * containing block that starts below the caveat — otherwise anything
         * added above them in flow overlaps them instead of pushing them down.
         */}
        <div className="atlas-sankey-plot">
        <div className="atlas-funnel-headings" aria-hidden="true">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className={hoveredStage === stage.id ? "is-hovered" : ""}
              style={{ left: flowNodeCenterPercent(stage.x) }}
            >
              <span>{stage.label}</span>
              <strong>{formatNumber(stage.count)}</strong>
              <small>
                {stage.id === "visitors"
                  ? "100% of total"
                  : `${formatPercent(stage.shareOfVisitors)} of visitors`}
              </small>
              {stage.trend && (
                <em
                  className={`atlas-stage-trend ${
                    stage.trend.change >= 0 ? "up" : "down"
                  }`}
                >
                  {stage.trend.change >= 0 ? (
                    <TrendingUp size={11} />
                  ) : (
                    <TrendingDown size={11} />
                  )}
                  {formatPercent(Math.abs(stage.trend.change))}
                </em>
              )}
            </div>
          ))}
        </div>
        <svg
          className="atlas-sankey"
          viewBox={`0 0 ${FLOW.viewWidth} ${FLOW.viewHeight}`}
          role="img"
          aria-label={`${snapshot.totals.visitors} visitors, ${snapshot.totals.engaged} engaged, ${snapshot.totals.converted} converted`}
        >
          <defs>
            {channels.map((channel) => (
              <linearGradient
                key={channel.key}
                id={`atlas-ribbon-${channel.key}`}
                x1="0"
                x2="1"
              >
                <stop
                  offset="0%"
                  stopColor={channelColor(channel.label)}
                  stopOpacity=".9"
                />
                <stop
                  offset="100%"
                  stopColor={channelColor(channel.label)}
                  stopOpacity=".45"
                />
              </linearGradient>
            ))}
            <linearGradient id="atlas-engaged-gradient" x1="0" x2="1">
              <stop offset="0%" stopColor="#2b978f" stopOpacity=".55" />
              <stop offset="100%" stopColor="#54a9a1" stopOpacity=".72" />
            </linearGradient>
            <linearGradient id="atlas-converted-gradient" x1="0" x2="1">
              <stop offset="0%" stopColor="#2f9a92" stopOpacity=".72" />
              <stop offset="100%" stopColor="#1c7f79" stopOpacity=".92" />
            </linearGradient>
            {/* Loss dissolves rather than ending in a hard edge, so it reads
                as leaving the funnel instead of arriving somewhere. */}
            <linearGradient id="atlas-spill-gradient" x1="0" x2="1">
              <stop offset="0%" stopColor="#bc584b" stopOpacity=".42" />
              <stop offset="100%" stopColor="#bc584b" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ribbons.map((ribbon) => (
            <path
              key={ribbon.key}
              d={ribbon.path}
              fill={`url(#atlas-ribbon-${ribbon.key})`}
            >
              <title>{ribbon.title}</title>
            </path>
          ))}

          {spills.map((spill) => (
            <path
              key={spill.id}
              d={spill.path}
              fill="url(#atlas-spill-gradient)"
              className="atlas-spill"
            />
          ))}

          <path d={engagedRibbon} fill="url(#atlas-engaged-gradient)" />
          <path d={convertedRibbon} fill="url(#atlas-converted-gradient)" />

          <rect
            x={FLOW.visitorsX}
            y={FLOW.bandTop}
            width={FLOW.nodeWidth}
            height={FLOW.bandHeight}
            rx={FLOW.nodeWidth / 2}
            fill="#278f8a"
          />
          <rect
            x={FLOW.engagedX}
            y={FLOW_BAND_CENTER - engagedHeight / 2}
            width={FLOW.nodeWidth}
            height={engagedHeight}
            rx={FLOW.nodeWidth / 2}
            fill="#278f8a"
          />
          <rect
            x={FLOW.convertedX}
            y={FLOW_BAND_CENTER - convertedHeight / 2}
            width={FLOW.nodeWidth}
            height={convertedHeight}
            rx={FLOW.nodeWidth / 2}
            fill="#1c7f79"
          />

          {/* The loss labelled in words, so the spill does not have to be
              decoded. Only drawn where something was actually lost. */}
          {stages.map((stage) =>
            stage.lostFromPrevious && stage.lostFromPrevious > 0 ? (
              <text
                key={`${stage.id}-loss`}
                className="atlas-spill-label"
                x={stage.x - 6}
                y={FLOW.bandTop + FLOW.bandHeight + 30}
                textAnchor="end"
              >
                {`−${formatNumber(stage.lostFromPrevious)} left`}
              </text>
            ) : null,
          )}

          {/* Full-height hover targets. Pointer areas are kept off the ribbons
              themselves so a thin band is still easy to hit. */}
          {stages.map((stage, index) => {
            const previousX =
              index === 0 ? 0 : (stages[index - 1].x + stage.x) / 2;
            const nextX =
              index === stages.length - 1
                ? FLOW.viewWidth
                : (stages[index + 1].x + stage.x) / 2;
            return (
              <rect
                key={`${stage.id}-hit`}
                className="atlas-stage-hit"
                x={previousX}
                y={0}
                width={Math.max(1, nextX - previousX)}
                height={FLOW.viewHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredStage(stage.id)}
                onMouseLeave={() =>
                  setHoveredStage((current) =>
                    current === stage.id ? null : current,
                  )
                }
              />
            );
          })}
        </svg>

        {hovered && (
          <div
            className="atlas-flow-tooltip"
            role="status"
            style={{ left: flowNodeCenterPercent(hovered.x) }}
          >
            <strong>{hovered.label}</strong>
            <span className="atlas-flow-tooltip-value">
              {formatNumber(hovered.count)}
            </span>
            {hovered.keptFromPrevious !== null && hovered.previousLabel ? (
              <span>
                {formatPercent(hovered.keptFromPrevious)} of{" "}
                {hovered.previousLabel.toLowerCase()} continued here
              </span>
            ) : (
              <span>Everyone who reached the site in this window</span>
            )}
            {hovered.lostFromPrevious ? (
              <span className="atlas-flow-tooltip-loss">
                {formatNumber(hovered.lostFromPrevious)} did not continue
              </span>
            ) : null}
            {hovered.trend ? (
              <span
                className={
                  hovered.trend.change >= 0
                    ? "atlas-flow-tooltip-trend up"
                    : "atlas-flow-tooltip-trend down"
                }
              >
                {hovered.trend.change >= 0 ? "Up" : "Down"}{" "}
                {formatPercent(Math.abs(hovered.trend.change))} vs the previous{" "}
                {hovered.trend.days} days
              </span>
            ) : (
              <span className="atlas-flow-tooltip-muted">
                Not enough days yet to compare with the previous period
              </span>
            )}
          </div>
        )}
        </div>
        <div className="atlas-flow-footer">
          <span>
            {formatNumber(snapshot.totals.pageviews)} pageviews ·{" "}
            {formatNumber(snapshot.totals.sessions)} sessions
          </span>
          <span>
            <i /> {snapshot.totals.online} online
          </span>
        </div>
      </div>
    </article>
  );
}

const COLLAPSED_ROWS = 6;

/** Footer control that reveals the rows a card hides behind its top slice. */
function ExpandRows({
  expanded,
  hidden,
  label,
  onToggle,
}: {
  expanded: boolean;
  hidden: number;
  label: string;
  onToggle: () => void;
}) {
  if (hidden <= 0 && !expanded) return null;
  return (
    <button className="atlas-expand" type="button" onClick={onToggle}>
      {expanded ? "Show fewer" : `View all ${label}`}
      {!expanded && <em>{hidden}</em>}
      <ChevronRight size={13} className={expanded ? "flip" : ""} />
    </button>
  );
}

function BreakdownCard({ snapshot }: { snapshot: AcquisitionSnapshot }) {
  const [tab, setTab] = useState<BreakdownTab>("channel");
  const [expanded, setExpanded] = useState(false);
  const rows: Record<BreakdownTab, AcquisitionBreakdownRow[]> = {
    channel: snapshot.channels,
    referrer: snapshot.referrers,
    campaign: snapshot.campaigns,
    utm: snapshot.utmSources,
  };
  const allRows = rows[tab];
  const activeRows = expanded ? allRows : allRows.slice(0, COLLAPSED_ROWS);
  const maxVisitors = Math.max(
    ...activeRows.map((row) => row.visitors),
    1,
  );

  return (
    <article className="atlas-card atlas-breakdown-card">
      <div className="atlas-tabs" role="tablist" aria-label="Source breakdown">
        {(
          [
            ["channel", "Channel"],
            ["referrer", "Referrer"],
            ["campaign", "Campaign"],
            ["utm", "UTM"],
          ] as [BreakdownTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => {
              setTab(id);
              setExpanded(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="atlas-table-head">
        <span>Source</span>
        <span>Visitors</span>
        <span>Engaged rate</span>
      </div>
      <div className="atlas-table-body">
        {activeRows.length > 0 ? (
          activeRows.map((row) => (
            <div className="atlas-source-row" key={row.key}>
              <div className="atlas-source-label-wrap">
                <SourceBrandIcon
                  channel={row.label}
                  detail={row.detail}
                  size={16}
                  className="atlas-source-icon"
                />
                <div>
                  <strong>{row.label}</strong>
                  {row.detail && <small>{row.detail}</small>}
                </div>
              </div>
              <div>
                <span
                  style={{
                    width: `${Math.max(
                      10,
                      (row.visitors / maxVisitors) * 100,
                    )}%`,
                    // Referrers and campaigns carry their channel in `detail`,
                    // so a row keeps its channel colour on every tab.
                    background:
                      CHANNEL_COLORS[row.label as AcquisitionChannel] ??
                      CHANNEL_COLORS[row.detail as AcquisitionChannel] ??
                      "#5ca8a1",
                  }}
                />
                <strong>{formatNumber(row.visitors)}</strong>
              </div>
              <strong>{formatPercent(row.engagedRate)}</strong>
            </div>
          ))
        ) : (
          <CardEmpty label={`No ${tab} data yet`} />
        )}
      </div>
      <ExpandRows
        expanded={expanded}
        hidden={allRows.length - COLLAPSED_ROWS}
        label={tab === "utm" ? "UTM sources" : `${tab}s`}
        onToggle={() => setExpanded((current) => !current)}
      />
    </article>
  );
}

function LandingPagesCard({ snapshot }: { snapshot: AcquisitionSnapshot }) {
  const [expanded, setExpanded] = useState(false);
  const visiblePages = expanded
    ? snapshot.landingPages
    : snapshot.landingPages.slice(0, COLLAPSED_ROWS);
  const maxVisitors = Math.max(
    ...snapshot.landingPages.map((page) => page.visitors),
    1,
  );
  return (
    <article className="atlas-card atlas-pages-card">
      <div className="atlas-tabs" role="tablist" aria-label="Page breakdown">
        <button className="active" type="button" role="tab">
          Landing pages
        </button>
        <button type="button" role="tab" disabled>
          Pages
        </button>
        <button type="button" role="tab" disabled>
          Exit pages
        </button>
      </div>
      <div className="atlas-table-head">
        <span>Page</span>
        <span>Visitors</span>
        <span>Conversion rate</span>
      </div>
      <div className="atlas-table-body">
        {visiblePages.length > 0 ? (
          visiblePages.map((page) => (
            <div className="atlas-page-row" key={page.path}>
              <strong title={page.path}>{page.path}</strong>
              <strong>{formatNumber(page.visitors)}</strong>
              <div>
                <strong>{formatPercent(page.conversionRate)}</strong>
                <span>
                  <i
                    style={{
                      width: `${Math.max(
                        8,
                        (page.visitors / maxVisitors) * 100,
                      )}%`,
                    }}
                  />
                </span>
              </div>
            </div>
          ))
        ) : (
          <CardEmpty label="Landing pages will appear after the first visit" />
        )}
      </div>
      <ExpandRows
        expanded={expanded}
        hidden={snapshot.landingPages.length - COLLAPSED_ROWS}
        label="landing pages"
        onToggle={() => setExpanded((current) => !current)}
      />
    </article>
  );
}

const COLLAPSED_VISITORS = 6;

function VisitorJourneys({ snapshot }: { snapshot: AcquisitionSnapshot }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [range, setRange] = useState<VisitorRange>("all");
  // Rows age against the snapshot they belong to, not wall-clock time: the
  // figures beside them are frozen at `generatedAt`, and the header already
  // reports how stale the snapshot itself is.
  const reference = Date.parse(snapshot.generatedAt);

  /**
   * Counts are computed before the search filter so the range chips keep
   * reporting the size of each period rather than the size of the current
   * search, and a chip that would show nothing says so up front.
   */
  const rangeCounts = useMemo(() => {
    const counts = { today: 0, yesterday: 0, "7d": 0, all: 0 };
    for (const visitor of snapshot.visitors) {
      counts.all += 1;
      const bucket = visitorBucket(visitor.lastSeen, reference);
      if (bucket === null) continue;
      if (bucket === 0) counts.today += 1;
      if (bucket === 1) counts.yesterday += 1;
      if (bucket < 7) counts["7d"] += 1;
    }
    return counts;
  }, [snapshot.visitors, reference]);

  const visitors = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return snapshot.visitors.filter((visitor) => {
      if (range !== "all") {
        const bucket = visitorBucket(visitor.lastSeen, reference);
        if (bucket === null) return false;
        if (range === "today" && bucket !== 0) return false;
        if (range === "yesterday" && bucket !== 1) return false;
        if (range === "7d" && bucket >= 7) return false;
      }
      if (!normalized) return true;
      return [
        visitor.alias,
        visitor.source,
        visitor.channel,
        visitor.countryCode ?? "",
      ].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [query, range, snapshot.visitors, reference]);

  /**
   * Today against yesterday. The list shows who came; this answers the question
   * the card is actually opened with — is traffic going up or down.
   *
   * A percentage off a handful of visitors is false precision: 1 visitor
   * yesterday and 11 today is a truthful "+1000%" and a useless one. Below the
   * threshold the comparison is stated in whole visitors instead, which is
   * the same restraint the flow applies to its own rates.
   */
  const dayOverDay = useMemo(
    () => describeDayOverDay(rangeCounts.today, rangeCounts.yesterday),
    [rangeCounts],
  );

  return (
    <article className="atlas-card atlas-visitors-card">
      <div className="atlas-card-heading">
        <div>
          <h3>Visitor journeys</h3>
          <CircleHelp
            size={14}
            aria-label="Anonymous first-party visitor sessions"
          />
        </div>
        <label className="atlas-search">
          <Search size={14} />
          <span className="sr-only">Search visitors</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search visitors…"
          />
        </label>
      </div>
      <div className="atlas-visitor-ranges">
        <div className="atlas-range-chips" role="tablist">
          {(["today", "yesterday", "7d", "all"] as VisitorRange[]).map(
            (option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={range === option}
                className={range === option ? "active" : ""}
                onClick={() => {
                  setRange(option);
                  setExpanded(false);
                }}
              >
                {VISITOR_RANGE_LABELS[option]}
                <small>{formatNumber(rangeCounts[option])}</small>
              </button>
            ),
          )}
        </div>
        {dayOverDay && (
          <span className={`atlas-visitor-delta ${dayOverDay.direction}`}>
            {dayOverDay.direction === "up" ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {dayOverDay.label}
          </span>
        )}
      </div>
      <div className="atlas-visitor-head" aria-hidden="true">
        <span>Visitor</span>
        <span>Country</span>
        <span>Device / browser</span>
        <span>Source</span>
        <span>Last seen</span>
        <span>Journey</span>
      </div>
      <div className="atlas-visitor-list">
        {visitors.length > 0 ? (
          (expanded ? visitors : visitors.slice(0, COLLAPSED_VISITORS)).map(
            (visitor) => (
            <div className="atlas-visitor-row" key={visitor.id}>
              <div className="atlas-visitor-name">
                <span className="atlas-anonymous-avatar">
                  {visitor.alias
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div>
                  <strong>{visitor.alias}</strong>
                  <small>Anonymous</small>
                </div>
              </div>
              <span>
                <i>{FLAG_EMOJI[visitor.countryCode ?? ""] ?? "🌐"}</i>{" "}
                {visitor.countryCode || "Unknown"}
              </span>
              <span>
                <BrandIcon name={visitor.os} size={14} className="atlas-os-icon" />
                <BrandIcon name={visitor.browser} size={14} className="atlas-browser-icon" />
                {visitor.os} / {visitor.browser}
              </span>
              <span className="atlas-visitor-source">
                <SourceBrandIcon
                  channel={visitor.channel}
                  detail={visitor.source}
                  size={16}
                  className="atlas-visitor-source-icon"
                />
                <span>
                  <strong>{visitor.channel}</strong>
                  <small>{visitor.source}</small>
                </span>
              </span>
              <span>{relativeTime(visitor.lastSeen, reference)}</span>
              <span
                className="atlas-journey-dots"
                title={visitor.journey.join(" → ")}
              >
                {Array.from({ length: 7 }).map((_, index) => (
                  <i
                    key={index}
                    className={
                      index < visitor.journey.length
                        ? visitor.converted &&
                          index === visitor.journey.length - 1
                          ? "converted"
                          : "visited"
                        : ""
                    }
                  />
                ))}
              </span>
            </div>
            ),
          )
        ) : (
          <CardEmpty
            label={
              range === "all"
                ? "No matching visitor journeys"
                : `No visitors in ${VISITOR_RANGE_LABELS[range].toLowerCase()}`
            }
          />
        )}
      </div>
      <div className="atlas-card-footer">
        <span>
          Session-scoped IDs by default · no IP addresses are stored
        </span>
        <ExpandRows
          expanded={expanded}
          hidden={visitors.length - COLLAPSED_VISITORS}
          label="visitors"
          onToggle={() => setExpanded((current) => !current)}
        />
      </div>
    </article>
  );
}

function CrawlerCurrent({ snapshot }: { snapshot: AcquisitionSnapshot }) {
  const availableCategories = snapshot.crawlers.categories;
  const [tab, setTab] = useState<CrawlerCategory>("search_index");
  const [shape, setShape] = useState<CrawlerChartShape>("area");
  const [pagesExpanded, setPagesExpanded] = useState(false);
  const activeCount =
    availableCategories.find((item) => item.category === tab)?.requests ?? 0;
  const activeSeries = useMemo(
    () =>
      snapshot.crawlers.series
        .filter((item) => item.category === tab)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [snapshot.crawlers.series, tab],
  );

  /**
   * An API released before the category-scoped rollups returns these two lists
   * aggregated across every category. Filtering them by tab would then hide
   * most rows and imply a scope the numbers do not have, so the card only
   * scopes them once the data carries a category, and says so either way.
   */
  const scopedRollups = snapshot.crawlers.providers.every(
    (provider) => provider.category !== undefined,
  );
  const providers = scopedRollups
    ? snapshot.crawlers.providers.filter(
        (provider) => provider.category === tab,
      )
    : snapshot.crawlers.providers;
  const crawlerPages = snapshot.crawlers.pages.every(
    (page) => page.category !== undefined,
  )
    ? snapshot.crawlers.pages.filter((page) => page.category === tab)
    : snapshot.crawlers.pages;
  const rollupScopeLabel = scopedRollups
    ? CRAWLER_TAB_LABELS[tab].toLowerCase()
    : "all categories";

  /**
   * Trend compares the most recent half of the window with the half before it,
   * which is the only period-over-period comparison this snapshot can support
   * without a second request.
   */
  const trend = useMemo(() => {
    if (activeSeries.length < 4) return null;
    const half = Math.floor(activeSeries.length / 2);
    const previous = activeSeries
      .slice(0, half)
      .reduce((sum, item) => sum + item.requests, 0);
    const recent = activeSeries
      .slice(activeSeries.length - half)
      .reduce((sum, item) => sum + item.requests, 0);
    if (previous === 0) return null;
    return {
      change: (recent - previous) / previous,
      days: half,
    };
  }, [activeSeries]);

  return (
    <article className="atlas-card atlas-crawler-card">
      <div className="atlas-card-heading">
        <div>
          <h3>Crawler Current</h3>
          <CircleHelp
            size={14}
            aria-label="Server-side crawler request analytics"
          />
        </div>
        <span
          className={
            snapshot.crawlers.verified > 0
              ? "atlas-verification verified"
              : "atlas-verification"
          }
        >
          {snapshot.crawlers.verified > 0 ? (
            <ShieldCheck size={13} />
          ) : (
            <CloudCog size={13} />
          )}
          {snapshot.crawlers.verified > 0
            ? `${snapshot.crawlers.verified} verified`
            : snapshot.crawlers.detectionLabel}
        </span>
      </div>
      <div className="atlas-tabs crawler-tabs" role="tablist">
        {/*
         * Indexing leads because it is the category that decides whether the
         * site can be found at all, and in practice it carries the most
         * requests by a wide margin. AI answers sits second.
         */}
        {(
          ["search_index", "ai_answer", "model_training"] as CrawlerCategory[]
        ).map((category) => (
          <button
            key={category}
            className={tab === category ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === category}
            onClick={() => {
              setTab(category);
              setPagesExpanded(false);
            }}
          >
            {CRAWLER_TAB_LABELS[category]}
          </button>
        ))}
      </div>
      <div className="atlas-crawler-metric">
        <div>
          <span>{CRAWLER_TAB_LABELS[tab]} requests</span>
          <strong>{formatNumber(activeCount)}</strong>
          <small>
            {formatNumber(snapshot.crawlers.requests)} total crawler requests
          </small>
        </div>
        {trend && (
          <span
            className={`atlas-trend ${trend.change >= 0 ? "up" : "down"}`}
            title={`Last ${trend.days} days compared with the ${trend.days} days before`}
          >
            {trend.change >= 0 ? (
              <TrendingUp size={12} />
            ) : (
              <TrendingDown size={12} />
            )}
            {`${trend.change >= 0 ? "+" : ""}${formatPercent(trend.change)}`}
            <small>{`vs prev ${trend.days}d`}</small>
          </span>
        )}
      </div>
      <div className="atlas-chart-shapes" role="group" aria-label="Chart style">
        {(
          [
            ["area", "Area", AreaChart],
            ["bars", "Bars", BarChart3],
            ["line", "Line", LineChart],
          ] as [CrawlerChartShape, string, typeof AreaChart][]
        ).map(([id, label, Glyph]) => (
          <button
            key={id}
            type="button"
            className={shape === id ? "active" : ""}
            aria-pressed={shape === id}
            title={`${label} chart`}
            onClick={() => setShape(id)}
          >
            <Glyph size={13} />
            <span className="sr-only">{label} chart</span>
          </button>
        ))}
      </div>
      {activeSeries.length > 1 ? (
        <CrawlerChart series={activeSeries} shape={shape} />
      ) : (
        /**
         * A trend needs at least two dated buckets. Having too few points to
         * plot is not the same as having no requests, and saying "none" while
         * the counter above reads a non-zero number would make the card lie
         * about its own data.
         */
        <div className="atlas-crawler-chart-empty">
          <Bot size={24} />
          {activeCount > 0 ? (
            <span>
              {`Not enough dated requests to plot a trend — ${formatNumber(activeCount)} so far`}
            </span>
          ) : (
            <span>
              {`No ${CRAWLER_TAB_LABELS[tab].toLowerCase()} requests in this window`}
            </span>
          )}
        </div>
      )}
      <div className="atlas-crawler-details">
        <div>
          <span>{`By provider · ${rollupScopeLabel}`}</span>
          {providers.length > 0 ? (
            providers.slice(0, 6).map((provider) => (
              <div
                className="atlas-provider-row"
                key={`${provider.category ?? "all"}-${provider.provider}`}
              >
                <ProviderGlyph name={provider.provider} />
                <strong>{provider.provider}</strong>
                <span>{provider.requests}</span>
                <small>{formatPercent(provider.share)}</small>
              </div>
            ))
          ) : (
            <CardEmpty label="No crawler providers yet" />
          )}
        </div>
        <div>
          <span>{`Top requested public pages · ${rollupScopeLabel}`}</span>
          {crawlerPages.length > 0 ? (
            <>
              {(pagesExpanded
                ? crawlerPages
                : crawlerPages.slice(0, COLLAPSED_ROWS)
              ).map((page) => (
                <div
                  className="atlas-crawler-page"
                  key={`${page.category ?? "all"}-${page.path}`}
                >
                  <strong title={page.path}>{page.path}</strong>
                  <span>{page.requests}</span>
                </div>
              ))}
              <ExpandRows
                expanded={pagesExpanded}
                hidden={crawlerPages.length - COLLAPSED_ROWS}
                label="requested pages"
                onToggle={() => setPagesExpanded((current) => !current)}
              />
            </>
          ) : (
            <CardEmpty label="No requested pages yet" />
          )}
        </div>
      </div>
      <div className="atlas-detection-note">
        <ShieldCheck size={16} />
        <div>
          <strong>
            {snapshot.crawlers.verified > 0
              ? "Verified crawler requests"
              : "Transparent confidence"}
          </strong>
          <span>
            {snapshot.crawlers.verified > 0
              ? "Known crawler identity was verified server-side."
              : "Current classification uses declared user agents. IP verification is not claimed."}
          </span>
        </div>
      </div>
      <div className="atlas-crawler-separation">
        <Sparkles size={16} />
        <span>Crawler requests are not counted as human visitors.</span>
      </div>
    </article>
  );
}

/**
 * Crawler requests per day, drawn as an area, bars or a plain line.
 *
 * The plot stretches to whatever width the card gets (`preserveAspectRatio`
 * is off, so the SVG uses a flat 0–100 space on both axes), while gridlines
 * and axis labels live in HTML around it — that keeps type at a fixed size
 * and correctly proportioned at every card width.
 */
function CrawlerChart({
  series,
  shape,
}: {
  series: { date: string; requests: number }[];
  shape: CrawlerChartShape;
}) {
  const peak = Math.max(...series.map((item) => item.requests), 1);
  const ceiling = niceCeiling(peak);

  const points = series.map((item, index) => ({
    x: (index / (series.length - 1)) * 100,
    y: 100 - (item.requests / ceiling) * 100,
    item,
  }));

  const curve = curveCatmullRom.alpha(0.5);
  const linePath =
    line<(typeof points)[number]>()
      .x((point) => point.x)
      .y((point) => point.y)
      .curve(curve)(points) ?? "";
  const areaPath =
    area<(typeof points)[number]>()
      .x((point) => point.x)
      .y0(100)
      .y1((point) => point.y)
      .curve(curve)(points) ?? "";

  const labelIndexes = [
    0,
    Math.floor((series.length - 1) / 2),
    series.length - 1,
  ];
  const barWidth = Math.min(4.2, (100 / series.length) * 0.6);

  return (
    <div className="atlas-crawler-chart">
      <div className="atlas-chart-scale" aria-hidden="true">
        <span>{formatNumber(ceiling)}</span>
        <span>{formatNumber(Math.round(ceiling / 2))}</span>
        <span>0</span>
      </div>
      <div className="atlas-chart-plot">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Crawler requests per day across ${series.length} days, peaking at ${peak}`}
        >
          <defs>
            <linearGradient id="crawler-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#278f8a" stopOpacity=".28" />
              <stop offset="100%" stopColor="#278f8a" stopOpacity="0" />
            </linearGradient>
          </defs>

          {shape === "bars" ? (
            points.map((point) => (
              <rect
                key={point.item.date}
                x={Math.min(
                  100 - barWidth,
                  Math.max(0, point.x - barWidth / 2),
                )}
                y={point.y}
                width={barWidth}
                height={Math.max(0.8, 100 - point.y)}
                fill="#2f9a92"
                fillOpacity=".82"
              >
                <title>{`${point.item.date}: ${point.item.requests}`}</title>
              </rect>
            ))
          ) : (
            <>
              {shape === "area" && (
                <path d={areaPath} fill="url(#crawler-area)" />
              )}
              <path
                d={linePath}
                fill="none"
                stroke="#18877f"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
      </div>
      <div className="atlas-chart-dates" aria-hidden="true">
        {labelIndexes.map((index) => (
          <span key={series[index].date}>{shortDate(series[index].date)}</span>
        ))}
      </div>
    </div>
  );
}

/** Rounds an axis maximum up to a readable step. */
function niceCeiling(value: number) {
  if (value <= 5) return 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

function shortDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function ProviderGlyph({ name }: { name: string }) {
  return (
    <BrandIcon
      name={name}
      size={16}
      className="atlas-provider-icon"
      fallbackToDefault={true}
    />
  );
}

function CardEmpty({ label }: { label: string }) {
  return (
    <div className="atlas-card-empty">
      <MousePointerClick size={18} />
      <span>{label}</span>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0);
}

/**
 * `reference` lets the demo snapshot age its rows against its own frozen
 * `generatedAt` instead of wall-clock time, so authored sample journeys do not
 * drift to "31d ago" inside a seven-day window as the months pass.
 */
function relativeTime(value: string, reference = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "just now";
  const minutes = Math.max(0, Math.floor((reference - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
