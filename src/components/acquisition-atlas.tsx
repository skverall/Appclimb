"use client";

import { area, curveCatmullRom, line } from "d3-shape";
import {
  AreaChart,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clipboard,
  CloudCog,
  Code2,
  ExternalLink,
  Filter,
  Globe2,
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

import type {
  AcquisitionBreakdownRow,
  AcquisitionChannel,
  AcquisitionEnvelope,
  AcquisitionSnapshot,
  CrawlerCategory,
  WebProperty,
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
}: {
  authenticated: boolean;
  demo: boolean;
  /**
   * Keeps the Atlas on the same reporting window as the Growth River
   * projection it shares the Pulse screen with.
   */
  defaultWindowDays?: 7 | 30 | 90;
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
  const collectorOrigin =
    typeof window === "undefined"
      ? "https://appclimb.app"
      : window.location.origin;

  const loadSnapshot = useCallback(async () => {
    if (!authenticated || demo) {
      setSnapshot(demoAcquisitionSnapshotForWindow(windowDays));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/acquisition?days=${windowDays}`, {
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
      setSnapshot({
        ...(envelope.data as Omit<
          AcquisitionSnapshot,
          "mode" | "windowDays"
        >),
        mode: envelope.meta?.mode ?? "empty",
        windowDays: envelope.meta?.windowDays ?? windowDays,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error && loadError.message === "plan_required"
          ? "Acquisition Atlas is available while your workspace access is active."
          : "Acquisition data could not be loaded. Your Growth River data is unchanged.",
      );
    } finally {
      setLoading(false);
    }
  }, [authenticated, demo, windowDays]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSnapshot(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSnapshot]);

  const property = snapshot.property;
  const trackingSnippet = property?.trackingToken
    ? `<script\n  src="${collectorOrigin}/appclimb-analytics.js"\n  data-token="${property.trackingToken}"\n  data-storage="session"\n  defer\n></script>`
    : "";

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
          {property?.trackingToken && (
            <button
              className="atlas-setup-button"
              type="button"
              onClick={() => setSetupOpen((current) => !current)}
            >
              <Code2 size={15} /> Install
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

      {setupOpen && property?.trackingToken && (
        <TrackingSetup
          property={property}
          snippet={trackingSnippet}
          collectorOrigin={collectorOrigin}
          onClose={() => setSetupOpen(false)}
        />
      )}

      {!loading && authenticated && !demo && !property ? (
        <ConnectWebsite
          onConnected={(created) => {
            setSnapshot((current) => ({ ...current, property: created }));
            setSetupOpen(true);
          }}
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

  const engagedHeight = Math.max(5, engagedRate * FLOW.bandHeight);
  const convertedHeight = Math.max(3, convertedRate * FLOW.bandHeight);

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
      const entrySpan = Math.max(2.5, share * entryHeight);
      const stackSpan = Math.max(2.5, share * FLOW.bandHeight);
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
        <div className="atlas-flow-legend">
          <span>Band width = visitors · colour = channel above</span>
          <span>Human traffic only — crawlers are charted separately</span>
        </div>
      </div>
      <div className="atlas-sankey-wrap">
        <div className="atlas-funnel-headings" aria-hidden="true">
          <div style={{ left: flowNodeCenterPercent(FLOW.visitorsX) }}>
            <span>Visitors</span>
            <strong>{formatNumber(snapshot.totals.visitors)}</strong>
            <small>100% of total</small>
          </div>
          <div style={{ left: flowNodeCenterPercent(FLOW.engagedX) }}>
            <span>Engaged</span>
            <strong>{formatNumber(snapshot.totals.engaged)}</strong>
            <small>{formatPercent(engagedRate)} of visitors</small>
          </div>
          <div style={{ left: flowNodeCenterPercent(FLOW.convertedX) }}>
            <span>Converted</span>
            <strong>{formatNumber(snapshot.totals.converted)}</strong>
            <small>{formatPercent(convertedRate)} of visitors</small>
          </div>
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

          <path d={engagedRibbon} fill="url(#atlas-engaged-gradient)">
            <title>
              {`${formatNumber(snapshot.totals.engaged)} engaged visitors`}
            </title>
          </path>
          <path d={convertedRibbon} fill="url(#atlas-converted-gradient)">
            <title>
              {`${formatNumber(snapshot.totals.converted)} converted visitors`}
            </title>
          </path>

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
        </svg>
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
              <div>
                <strong>{row.label}</strong>
                {row.detail && <small>{row.detail}</small>}
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
  // Rows age against the snapshot they belong to, not wall-clock time: the
  // figures beside them are frozen at `generatedAt`, and the header already
  // reports how stale the snapshot itself is.
  const reference = Date.parse(snapshot.generatedAt);
  const visitors = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return snapshot.visitors;
    return snapshot.visitors.filter((visitor) =>
      [
        visitor.alias,
        visitor.source,
        visitor.channel,
        visitor.countryCode ?? "",
      ].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [query, snapshot.visitors]);

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
                <BrowserGlyph browser={visitor.browser} />
                {visitor.os} / {visitor.browser}
              </span>
              <span className="atlas-visitor-source">
                <i
                  style={{
                    background:
                      CHANNEL_COLORS[visitor.channel] ??
                      CHANNEL_COLORS.Referral,
                  }}
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
          <CardEmpty label="No matching visitor journeys" />
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
  const [tab, setTab] = useState<CrawlerCategory>("ai_answer");
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
        {(
          ["ai_answer", "search_index", "model_training"] as CrawlerCategory[]
        ).map((category) => (
          <button
            key={category}
            className={tab === category ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={tab === category}
            onClick={() => setTab(category)}
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
        <div className="atlas-crawler-chart-empty">
          <Bot size={24} />
          <span>No crawler requests in this window</span>
        </div>
      )}
      <div className="atlas-crawler-details">
        <div>
          <span>By provider · all categories</span>
          {snapshot.crawlers.providers.length > 0 ? (
            snapshot.crawlers.providers.slice(0, 6).map((provider) => (
              <div className="atlas-provider-row" key={provider.provider}>
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
          <span>Top requested public pages · all categories</span>
          {snapshot.crawlers.pages.length > 0 ? (
            <>
              {(pagesExpanded
                ? snapshot.crawlers.pages
                : snapshot.crawlers.pages.slice(0, COLLAPSED_ROWS)
              ).map((page) => (
                <div className="atlas-crawler-page" key={page.path}>
                  <strong title={page.path}>{page.path}</strong>
                  <span>{page.requests}</span>
                </div>
              ))}
              <ExpandRows
                expanded={pagesExpanded}
                hidden={snapshot.crawlers.pages.length - COLLAPSED_ROWS}
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

function ConnectWebsite({
  onConnected,
}: {
  onConnected: (property: WebProperty) => void;
}) {
  const [name, setName] = useState("Marketing website");
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/acquisition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, domain }),
      });
      const payload = (await response.json()) as {
        data?: WebProperty;
        error?: string;
      };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "connection_failed");
      }
      onConnected(payload.data);
    } catch (connectError) {
      setError(
        connectError instanceof Error &&
          connectError.message === "web_property_exists"
          ? "This workspace already has a web property."
          : "Use a valid hostname such as example.com.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="atlas-connect-card">
      <div className="atlas-connect-visual" aria-hidden="true">
        <span className="atlas-orbit orbit-one" />
        <span className="atlas-orbit orbit-two" />
        <Globe2 size={38} />
      </div>
      <div>
        <span className="eyebrow">First-party web analytics</span>
        <h3>Connect your website</h3>
        <p>
          AppClimb will collect anonymous page views, referrers, UTM campaigns
          and crawler requests. No DataFast account and no third-party analytics
          SDK are involved.
        </p>
        <ul>
          <li>
            <Check size={15} /> Session-scoped visitor IDs by default
          </li>
          <li>
            <Check size={15} /> No IP addresses stored
          </li>
          <li>
            <Check size={15} /> Signed site token and workspace RLS
          </li>
        </ul>
      </div>
      <form onSubmit={connect}>
        <label>
          Property name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </label>
        <label>
          Website domain
          <input
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? (
            <>
              <LoaderCircle className="spin" size={16} /> Connecting…
            </>
          ) : (
            <>
              Create property <ExternalLink size={15} />
            </>
          )}
        </button>
      </form>
    </article>
  );
}

function TrackingSetup({
  property,
  snippet,
  collectorOrigin,
  onClose,
}: {
  property: WebProperty;
  snippet: string;
  collectorOrigin: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copySnippet = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <article className="atlas-setup-panel">
      <div>
        <span className="eyebrow">Install on {property.domain}</span>
        <h3>One first-party script</h3>
        <p>
          Add this before the closing <code>&lt;/body&gt;</code>. It respects
          Do Not Track and uses session storage unless you explicitly switch to
          persistent mode after consent.
        </p>
      </div>
      <div className="atlas-code-block">
        <code>{snippet}</code>
        <button type="button" onClick={() => void copySnippet()}>
          {copied ? <Check size={15} /> : <Clipboard size={15} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="atlas-server-note">
        <Bot size={19} />
        <div>
          <strong>Crawler tracking is server-side</strong>
          <span>
            This AppClimb project captures known crawlers in Next.js Proxy when
            <code> APPCLIMB_TRACKING_TOKEN </code> is configured. Other stacks
            can forward the original user agent to{" "}
            <code>{collectorOrigin}/api/track/crawler</code>.
          </span>
        </div>
      </div>
      <button className="atlas-setup-close" type="button" onClick={onClose}>
        Done
      </button>
    </article>
  );
}

function ProviderGlyph({ name }: { name: string }) {
  if (
    name.toLowerCase().includes("openai") ||
    name.toLowerCase().includes("chatgpt")
  ) {
    return <Sparkles size={16} aria-hidden="true" />;
  }
  if (name.toLowerCase().includes("google")) {
    return <Search size={16} aria-hidden="true" />;
  }
  return <Bot size={16} aria-hidden="true" />;
}

function BrowserGlyph({ browser }: { browser: string }) {
  const className = `atlas-browser atlas-browser-${browser.toLowerCase()}`;
  return <i className={className} aria-hidden="true" />;
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
