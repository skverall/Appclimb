"use client";

import {
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clipboard,
  CloudCog,
  Code2,
  ExternalLink,
  Filter,
  Globe2,
  LoaderCircle,
  MousePointerClick,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
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
  demoAcquisitionSnapshot,
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

export function AcquisitionAtlas({
  authenticated,
  demo,
}: {
  authenticated: boolean;
  demo: boolean;
}) {
  const [snapshot, setSnapshot] = useState<AcquisitionSnapshot>(
    demo ? demoAcquisitionSnapshot : emptyAcquisitionSnapshot(),
  );
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(7);
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
      setSnapshot({
        ...demoAcquisitionSnapshot,
        windowDays,
      });
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
          <span>
            <i className="healthy" /> Human traffic
          </span>
          <span>
            <i className="ai" /> AI referral
          </span>
          <span>
            <i className="campaign" /> Campaign
          </span>
        </div>
      </div>
      <div className="atlas-sankey-wrap">
        <div className="atlas-funnel-headings" aria-hidden="true">
          <div>
            <span>Visitors</span>
            <strong>{formatNumber(snapshot.totals.visitors)}</strong>
            <small>100% of total</small>
          </div>
          <div>
            <span>Engaged</span>
            <strong>{formatNumber(snapshot.totals.engaged)}</strong>
            <small>{formatPercent(engagedRate)} of visitors</small>
          </div>
          <div>
            <span>Converted</span>
            <strong>{formatNumber(snapshot.totals.converted)}</strong>
            <small>{formatPercent(convertedRate)} of visitors</small>
          </div>
        </div>
        <svg
          className="atlas-sankey"
          viewBox="0 0 940 220"
          role="img"
          aria-label={`${snapshot.totals.visitors} visitors, ${snapshot.totals.engaged} engaged, ${snapshot.totals.converted} converted`}
        >
          <defs>
            <linearGradient id="atlas-engaged-gradient" x1="0" x2="1">
              <stop offset="0%" stopColor="#26928c" stopOpacity=".82" />
              <stop offset="100%" stopColor="#58a9a2" stopOpacity=".34" />
            </linearGradient>
          </defs>
          {channels.map((channel, index) => {
            const y = 78 + index * 22;
            const width = Math.max(3, (channel.visitors / total) * 54);
            const color =
              CHANNEL_COLORS[channel.label as AcquisitionChannel] ??
              CHANNEL_COLORS.Referral;
            return (
              <path
                key={channel.key}
                d={`M 10 ${y} C 150 ${y}, 225 ${108 + index * 2}, 365 ${
                  108 + index * 2
                }`}
                fill="none"
                stroke={color}
                strokeOpacity=".72"
                strokeWidth={width}
              />
            );
          })}
          <rect
            x="365"
            y="56"
            width="8"
            height="112"
            rx="4"
            fill="#278f8a"
          />
          <path
            d="M 373 112 C 510 112, 550 112, 672 112"
            fill="none"
            stroke="#53a49d"
            strokeOpacity=".52"
            strokeWidth={Math.max(6, engagedRate * 94)}
          />
          <rect
            x="672"
            y="82"
            width="8"
            height="60"
            rx="4"
            fill="#278f8a"
          />
          <path
            d="M 680 112 C 775 112, 825 112, 924 112"
            fill="none"
            stroke="#278f8a"
            strokeOpacity=".52"
            strokeWidth={Math.max(3, convertedRate * 95)}
          />
          <rect
            x="924"
            y="108"
            width="7"
            height="8"
            rx="2"
            fill="#278f8a"
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

function BreakdownCard({ snapshot }: { snapshot: AcquisitionSnapshot }) {
  const [tab, setTab] = useState<BreakdownTab>("channel");
  const rows: Record<BreakdownTab, AcquisitionBreakdownRow[]> = {
    channel: snapshot.channels,
    referrer: snapshot.referrers,
    campaign: snapshot.campaigns,
    utm: snapshot.utmSources,
  };
  const activeRows = rows[tab].slice(0, 6);
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
            onClick={() => setTab(id)}
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
                    background:
                      CHANNEL_COLORS[
                        row.label as AcquisitionChannel
                      ] ?? "#5ca8a1",
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
    </article>
  );
}

function LandingPagesCard({ snapshot }: { snapshot: AcquisitionSnapshot }) {
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
        {snapshot.landingPages.length > 0 ? (
          snapshot.landingPages.slice(0, 6).map((page) => (
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
    </article>
  );
}

function VisitorJourneys({ snapshot }: { snapshot: AcquisitionSnapshot }) {
  const [query, setQuery] = useState("");
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
          visitors.slice(0, 14).map((visitor) => (
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
              <span>{relativeTime(visitor.lastSeen)}</span>
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
          ))
        ) : (
          <CardEmpty label="No matching visitor journeys" />
        )}
      </div>
      <div className="atlas-card-footer">
        <span>
          Session-scoped IDs by default · no IP addresses are stored
        </span>
      </div>
    </article>
  );
}

function CrawlerCurrent({ snapshot }: { snapshot: AcquisitionSnapshot }) {
  const availableCategories = snapshot.crawlers.categories;
  const [tab, setTab] = useState<CrawlerCategory>("ai_answer");
  const activeCount =
    availableCategories.find((item) => item.category === tab)?.requests ?? 0;
  const activeSeries = snapshot.crawlers.series
    .filter((item) => item.category === tab)
    .sort((a, b) => a.date.localeCompare(b.date));
  const chartValues = activeSeries.map((item) => item.requests);
  const maxValue = Math.max(...chartValues, 1);
  const points = activeSeries
    .map((item, index, all) => {
      const x = all.length <= 1 ? 0 : (index / (all.length - 1)) * 100;
      const y = 52 - (item.requests / maxValue) * 44;
      return `${x},${y}`;
    })
    .join(" ");

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
        <span>{CRAWLER_TAB_LABELS[tab]} requests</span>
        <strong>{formatNumber(activeCount)}</strong>
        <small>
          {formatNumber(snapshot.crawlers.requests)} total crawler requests
        </small>
      </div>
      <div className="atlas-crawler-chart">
        {activeSeries.length > 1 ? (
          <svg viewBox="0 0 100 56" preserveAspectRatio="none">
            <defs>
              <linearGradient id="crawler-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#278f8a" stopOpacity=".2" />
                <stop offset="100%" stopColor="#278f8a" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline
              points={`0,54 ${points} 100,54`}
              fill="url(#crawler-area)"
              stroke="none"
            />
            <polyline
              points={points}
              fill="none"
              stroke="#18877f"
              strokeWidth="1.2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div className="atlas-crawler-chart-empty">
            <Bot size={24} />
            <span>No crawler requests in this window</span>
          </div>
        )}
      </div>
      <div className="atlas-crawler-details">
        <div>
          <span>By provider</span>
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
          <span>Top requested public pages</span>
          {snapshot.crawlers.pages.length > 0 ? (
            snapshot.crawlers.pages.slice(0, 6).map((page) => (
              <div className="atlas-crawler-page" key={page.path}>
                <strong title={page.path}>{page.path}</strong>
                <span>{page.requests}</span>
              </div>
            ))
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

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "just now";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
