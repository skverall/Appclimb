"use client";

import {
  AppWindow,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  Clipboard,
  Code2,
  ExternalLink,
  Globe,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Trash2,
  Waypoints,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ModalDialog } from "@/components/modal-dialog";
import { WebSiteIcon } from "@/components/web-site-icon";
import type { DashboardSnapshot, PostHogPulse } from "@/lib/contracts";
import {
  cleanSearchResult,
  deriveKeywordSuggestions,
  keywordRankPosition,
  lookupAppStoreApp,
  lookupAppStoreIcon,
  searchAppStoreCatalog,
  type CatalogApp,
} from "@/lib/itunes";
import { preferredWebFaviconUrl } from "@/lib/web-favicon";

interface WorkspaceApp {
  id: string;
  name: string;
  platform: "iOS" | "Web";
  bundleId: string;
  appStoreId: string;
  storefront: string;
  iconUrl?: string;
  configured: boolean;
}

interface KeywordTrack {
  id: string;
  keyword: string;
  storefront: string;
  rank: number | null;
  checked: boolean;
  checkedAt: string | null;
  trend: number | null;
  popularity: number | null;
  popularitySource: string;
  history: Array<{ date: string; rank: number | null }>;
}

interface Suggestion {
  keyword: string;
  reason: string;
}

const demoKeywordTracks: KeywordTrack[] = [
  {
    id: "demo-keyword-1",
    keyword: "car dealer tracker",
    storefront: "US",
    rank: 3,
    checked: true,
    checkedAt: "2026-07-23",
    trend: 4,
    popularity: null,
    popularitySource: "apple-ads-required",
    history: [
      { date: "2026-07-19", rank: 8 },
      { date: "2026-07-20", rank: 7 },
      { date: "2026-07-21", rank: 6 },
      { date: "2026-07-22", rank: 4 },
      { date: "2026-07-23", rank: 3 },
    ],
  },
  {
    id: "demo-keyword-2",
    keyword: "vehicle inventory",
    storefront: "US",
    rank: 18,
    checked: true,
    checkedAt: "2026-07-23",
    trend: 5,
    popularity: null,
    popularitySource: "apple-ads-required",
    history: [
      { date: "2026-07-19", rank: 29 },
      { date: "2026-07-20", rank: 25 },
      { date: "2026-07-21", rank: 24 },
      { date: "2026-07-22", rank: 23 },
      { date: "2026-07-23", rank: 18 },
    ],
  },
  {
    id: "demo-keyword-3",
    keyword: "dealer CRM",
    storefront: "US",
    rank: 41,
    checked: true,
    checkedAt: "2026-07-23",
    trend: -3,
    popularity: null,
    popularitySource: "apple-ads-required",
    history: [
      { date: "2026-07-19", rank: 34 },
      { date: "2026-07-20", rank: 36 },
      { date: "2026-07-21", rank: 37 },
      { date: "2026-07-22", rank: 38 },
      { date: "2026-07-23", rank: 41 },
    ],
  },
  {
    id: "demo-keyword-4",
    keyword: "VIN scanner",
    storefront: "US",
    rank: 62,
    checked: true,
    checkedAt: "2026-07-23",
    trend: 2,
    popularity: null,
    popularitySource: "apple-ads-required",
    history: [
      { date: "2026-07-19", rank: 66 },
      { date: "2026-07-20", rank: 65 },
      { date: "2026-07-21", rank: 64 },
      { date: "2026-07-22", rank: 64 },
      { date: "2026-07-23", rank: 62 },
    ],
  },
];

function compact(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function timeAgo(value: string | null) {
  if (!value) return "Awaiting first import";
  const difference = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "Updated now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

function Sparkline({
  values,
  invert = false,
}: {
  values: number[];
  invert?: boolean;
}) {
  if (values.length < 2) return <span className="sparkline-empty">New</span>;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(1, maximum - minimum);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const normalized = (value - minimum) / range;
      const y = 28 - (invert ? 1 - normalized : normalized) * 23;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      className="product-sparkline"
      viewBox="0 0 100 32"
      role="img"
      aria-label="Trend"
      preserveAspectRatio="none"
    >
      <polyline points={points} />
    </svg>
  );
}

function PostHogOverview({
  pulse,
  onOpenSources,
  demo,
}: {
  pulse?: PostHogPulse;
  onOpenSources: () => void;
  demo: boolean;
}) {
  const status = pulse?.status ?? "not-connected";
  const live = status === "live";
  const activeSeries = pulse?.dailyActive.map((point) => point.value) ?? [];
  const flowMaximum = Math.max(
    1,
    ...(pulse?.flow.map((step) => step.value) ?? []),
  );
  const activationRate = pulse?.activationRate ?? null;

  return (
    <section className="auto-pulse-section" aria-labelledby="product-pulse-title">
      <header className="auto-pulse-header">
        <div>
          <span className="eyebrow">PostHog · automatic</span>
          <h2 id="product-pulse-title">Your product pulse</h2>
        </div>
        <div className={`auto-map-status status-${status}`}>
          {status === "preparing" ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <BadgeCheck size={15} />
          )}
          <span>
            {status === "not-connected"
              ? "Connect PostHog"
              : `${pulse?.detectedEventCount ?? 0} events auto-mapped`}
          </span>
          <small>
            {demo ? "Synthetic sample" : timeAgo(pulse?.updatedAt ?? null)}
          </small>
        </div>
      </header>

      {!live ? (
        <div className="auto-pulse-empty">
          <span className="auto-pulse-empty-icon">
            {status === "preparing" ? (
              <LoaderCircle className="spin" size={24} />
            ) : (
              <Waypoints size={24} />
            )}
          </span>
          <div>
            <strong>
              {status === "preparing"
                ? "Your first product pulse is being prepared"
                : "Connect a project; AppClimb handles the event map"}
            </strong>
            <p>
              {status === "preparing"
                ? "The first bounded import may take a few minutes. You can keep using Pulse and return later."
                : "Choose only the PostHog project. AppClimb detects active use, first value, and meaningful milestones without a wall of event names."}
            </p>
          </div>
          <button className="secondary-action" type="button" onClick={onOpenSources}>
            {status === "preparing" ? "View sync status" : "Connect PostHog"}
          </button>
        </div>
      ) : (
        <>
          <div className="auto-pulse-metrics">
            <article className="auto-pulse-card active-trend-card">
              <div className="auto-pulse-card-label">
                <span>Active user-days</span>
                <BarChart3 size={15} />
              </div>
              <strong>{compact(pulse?.activeUserDays ?? 0)}</strong>
              <Sparkline values={activeSeries} />
              <small>Daily unique users summed across 30 days</small>
            </article>
            <article className="auto-pulse-card activation-rate-card">
              <div
                className="activation-ring"
                style={{
                  "--activation-rate": `${Math.round(
                    (activationRate ?? 0) * 100,
                  ) * 3.6}deg`,
                } as CSSProperties}
              >
                <span>
                  {activationRate === null
                    ? "—"
                    : `${Math.round(activationRate * 100)}%`}
                </span>
              </div>
              <div>
                <span>First value reach</span>
                <small>
                  {(pulse?.activationUserDays ?? 0).toLocaleString()} activated
                  user-days
                </small>
              </div>
            </article>
            <article className="auto-pulse-card mapping-card">
              <span className="mapping-card-icon">
                <Sparkles size={18} />
              </span>
              <div>
                <span>Smart mapping</span>
                <strong>{pulse?.flow.length ?? 0} milestones</strong>
                <small>One aggregate query per import</small>
              </div>
              <button type="button" onClick={onOpenSources}>
                Review
              </button>
            </article>
          </div>

          <article className="product-flow-card">
            <header>
              <div>
                <span>Product flow signals</span>
                <small>
                  Unique daily reach by auto-detected milestone; not an ordered
                  funnel
                </small>
              </div>
              <button type="button" onClick={onOpenSources}>
                Review mapping
              </button>
            </header>
            <div className="product-flow-steps">
              {pulse?.flow.map((step, index) => (
                <div className="product-flow-step" key={step.id}>
                  <div className="product-flow-step-heading">
                    <span>{index + 1}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{compact(step.value)} user-days</small>
                    </div>
                  </div>
                  <div className="product-flow-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.max(4, (step.value / flowMaximum) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </>
      )}
    </section>
  );
}

function DomainFavicon({ domain, name }: { domain: string; name: string }) {
  return (
    <WebSiteIcon
      className="catalog-app-icon"
      domain={domain}
      name={name}
      size={40}
      rounded={10}
      fallback="letter"
    />
  );
}

function TabAppIcon({
  name,
  iconUrl,
  isWeb,
  bundleId,
}: {
  name: string;
  iconUrl?: string;
  isWeb: boolean;
  bundleId?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .split(/\s+/u)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "A";

  if (isWeb) {
    return (
      <WebSiteIcon
        className="mini-app-icon"
        domain={bundleId || name}
        name={name}
        iconUrl={iconUrl}
        size={24}
        rounded={6}
        fallback="letter"
      />
    );
  }

  if (failed || !iconUrl) {
    return <span className="mini-app-icon">{initials}</span>;
  }

  return (
    <span className="mini-app-icon">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconUrl} alt="" onError={() => setFailed(true)} />
    </span>
  );
}

interface WebAddResult {
  id: string;
  name: string;
  domain: string;
  trackingToken?: string;
  propertyCreated?: boolean;
}

function AddAppDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (appId: string, options?: { openAtlas?: boolean }) => void;
}) {
  const [platform, setPlatform] = useState<"app-store" | "web" | "google-play">(
    "app-store",
  );
  const [query, setQuery] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [webName, setWebName] = useState("");
  const [results, setResults] = useState<CatalogApp[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [addingId, setAddingId] = useState("");
  const [webError, setWebError] = useState("");
  const [webSuccess, setWebSuccess] = useState<WebAddResult | null>(null);
  const [installTab, setInstallTab] = useState<"agent" | "html">("agent");
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const parsedId = useMemo(() => {
    if (platform !== "app-store") return null;
    const match = query.match(/id(\d{5,15})/i) || query.trim().match(/^(\d{5,15})$/);
    return match ? match[1] : null;
  }, [query, platform]);

  const searchActive = platform === "app-store" && query.trim().length >= 2;

  useEffect(() => {
    if (!searchActive) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading");

      if (parsedId) {
        lookupAppStoreApp(parsedId, "US", { signal: controller.signal })
          .then((raw) => {
            const app = raw ? cleanSearchResult(raw) : null;
            if (app) {
              setResults([app]);
            } else {
              setResults([]);
            }
            setState("ready");
          })
          .catch(() => {
            setResults([]);
            setState("error");
          });
        return;
      }

      searchAppStoreCatalog(query, "US", { signal: controller.signal })
        .then((catalog) => {
          setResults(catalog);
          setState("ready");
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setState("error");
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchActive, parsedId]);

  const cleanWebDomain = useMemo(() => {
    if (!webUrl.trim()) return "";
    return webUrl.trim().toLowerCase().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  }, [webUrl]);

  const add = async (app: CatalogApp) => {
    setAddingId(app.appStoreId);
    setState("loading");
    try {
      const response = await fetch("/api/apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: "app-store",
          storefront: "US",
          metadata: {
            appStoreId: app.appStoreId,
            name: app.name,
            bundleId: app.bundleId,
            developer: app.developer,
            genre: app.genre,
            iconUrl: app.iconUrl,
            storeUrl: app.storeUrl,
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { data?: { id?: string } }
        | null;
      if (!response.ok || !payload?.data?.id) throw new Error("app_add_failed");
      onAdded(payload.data.id);
    } catch {
      setAddingId("");
      setState("error");
    }
  };

  const addWebSaaS = async () => {
    if (!cleanWebDomain || !cleanWebDomain.includes(".")) return;
    setAddingId(cleanWebDomain);
    setWebError("");
    setState("loading");
    try {
      const response = await fetch("/api/apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: "web",
          metadata: {
            domain: cleanWebDomain,
            name: webName.trim() || cleanWebDomain,
            iconUrl: preferredWebFaviconUrl(cleanWebDomain),
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: {
          id?: string;
          name?: string;
          bundleId?: string;
          property?: {
            trackingToken?: string;
            domain?: string;
            created?: boolean;
          };
        };
        error?: string;
      } | null;
      if (!response.ok || !payload?.data?.id) {
        const code = payload?.error ?? "web_add_failed";
        if (code === "admin_required") {
          throw new Error("Only workspace owners and admins can add a website.");
        }
        if (code === "invalid_domain" || code === "invalid_web_property") {
          throw new Error("Enter a valid domain such as cardealertracker.app.");
        }
        if (response.status === 401) {
          throw new Error("Sign in again, then retry adding this website.");
        }
        throw new Error(
          "Could not add this Web SaaS. Check the domain and try again.",
        );
      }
      const domain =
        payload.data.property?.domain ||
        payload.data.bundleId ||
        cleanWebDomain;
      setWebSuccess({
        id: payload.data.id,
        name: payload.data.name || webName.trim() || domain,
        domain,
        trackingToken: payload.data.property?.trackingToken,
        propertyCreated: payload.data.property?.created,
      });
      setState("ready");
      setAddingId("");
    } catch (error) {
      setAddingId("");
      setState("error");
      setWebError(
        error instanceof Error
          ? error.message
          : "Could not add this Web SaaS. Try again.",
      );
    }
  };

  const collectorOrigin =
    typeof window === "undefined" ? "https://appclimb.app" : window.location.origin;

  const webSnippet = webSuccess?.trackingToken
    ? `<script\n  src="${collectorOrigin}/appclimb-analytics.js"\n  data-token="${webSuccess.trackingToken}"\n  data-storage="session"\n  defer\n></script>`
    : "";

  const webAgentPrompt = useMemo(() => {
    if (!webSuccess?.trackingToken || !webSnippet) return "";
    return [
      `# Add AppClimb Web Analytics to ${webSuccess.domain}`,
      ``,
      `Please integrate AppClimb first-party web analytics into our website repository for ${webSuccess.name} (${webSuccess.domain}).`,
      ``,
      `## Goals`,
      `- Track anonymous visitors, referrers, UTM campaigns, and landing pages`,
      `- Keep AI crawler requests separate from human traffic`,
      `- Prefer session-scoped storage (no IP storage; privacy-friendly defaults)`,
      ``,
      `## 1. Add the browser tracking script`,
      `Add this script tag before the closing </body> tag in the root layout or main index.html:`,
      ``,
      "```html",
      webSnippet,
      "```",
      ``,
      `## 2. Optional conversion events`,
      `When a key product goal happens (signup, checkout start, paid activation), fire:`,
      ``,
      "```javascript",
      `if (typeof window !== "undefined") {`,
      `  window.appclimbAnalytics?.track("conversion", { goal: "account_created" });`,
      `}`,
      "```",
      ``,
      `Use clear goal names such as account_created, checkout_started, or subscription_started.`,
      ``,
      `## 3. Optional Next.js / edge crawler forwarding`,
      `Set this server-side env var so recognized AI/search crawler user agents can be forwarded:`,
      ``,
      "```bash",
      `APPCLIMB_TRACKING_TOKEN="${webSuccess.trackingToken}"`,
      "```",
      ``,
      `Forward crawler hits to ${collectorOrigin}/api/track/crawler with the original User-Agent when possible.`,
      ``,
      `## Constraints`,
      `- Do not invent a third-party analytics vendor (no DataFast, GA, etc.) for this install`,
      `- Do not change the token value`,
      `- Keep the script on ${webSuccess.domain} only`,
      `- After install, open AppClimb → Acquisition Atlas and confirm traffic or crawlers appear`,
    ].join("\n");
  }, [webSuccess, webSnippet, collectorOrigin]);

  return (
    <ModalDialog
      labelledBy="add-app-title"
      onClose={onClose}
      backdropClassName="settings-backdrop add-app-backdrop"
      dialogClassName="settings-dialog add-app-dialog"
      closeClassName="settings-close"
    >
      <div className="add-app-heading">
        <span className="setup-provider-mark">
          <AppWindow size={20} />
        </span>
        <div>
          <span className="eyebrow">Pulse setup</span>
          <h2 id="add-app-title">Add an app or Web SaaS</h2>
          <p>Paste a direct App Store URL, search by name, or enter a web domain.</p>
        </div>
      </div>
      <div className="app-platform-tabs" role="tablist" aria-label="App platform">
        <button
          type="button"
          role="tab"
          aria-selected={platform === "app-store"}
          onClick={() => setPlatform("app-store")}
        >
          <Store size={16} /> App Store
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={platform === "web"}
          onClick={() => setPlatform("web")}
        >
          <Globe size={16} /> Web SaaS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={platform === "google-play"}
          onClick={() => setPlatform("google-play")}
        >
          <Store size={16} /> Google Play
        </button>
      </div>

      {platform === "google-play" ? (
        <div className="google-play-boundary">
          <CircleAlert size={20} />
          <div>
            <strong>Google Play requires a Play Console connection</strong>
            <p>
              Google only returns apps accessible to the authorized user through
              the <code>playdeveloperreporting</code> OAuth scope. AppClimb will
              not scrape or invent private Play data.
            </p>
            <span>Connector is the next platform expansion.</span>
          </div>
        </div>
      ) : platform === "web" ? (
        <div className="web-saas-add-container">
          {webSuccess ? (
            <div className="web-saas-success" style={{ display: "grid", gap: "14px" }}>
              <div
                className="web-preview-card"
                style={{
                  padding: "14px",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "var(--surface-subtle)",
                }}
              >
                <DomainFavicon domain={webSuccess.domain} name={webSuccess.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong
                    style={{
                      display: "block",
                      fontSize: "14px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {webSuccess.name}
                  </strong>
                  <small style={{ color: "var(--foreground-muted)", fontSize: "12px" }}>
                    {webSuccess.domain} · Web SaaS connected
                  </small>
                </div>
                <BadgeCheck size={20} color="var(--accent, #0f766e)" />
              </div>

              <div
                style={{
                  padding: "14px",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  display: "grid",
                  gap: "10px",
                  background: "var(--surface)",
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "13px" }}>
                    What you get next
                  </strong>
                  <ul
                    style={{
                      margin: "8px 0 0",
                      paddingLeft: "18px",
                      color: "var(--foreground-muted)",
                      fontSize: "13px",
                      lineHeight: 1.45,
                    }}
                  >
                    <li>First-party visitors, referrers, UTMs, and landing pages</li>
                    <li>AI answer / search / training crawler visibility</li>
                    <li>PostHog product events once that source is connected</li>
                  </ul>
                </div>

                {webSnippet && webAgentPrompt ? (
                  <>
                    <div>
                      <span style={{ fontSize: "12px", fontWeight: 600, display: "block" }}>
                        Install tracking on {webSuccess.domain}
                      </span>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: "12px",
                          color: "var(--foreground-muted)",
                          lineHeight: 1.4,
                        }}
                      >
                        Most builders hand this to an AI coding agent. The HTML
                        snippet is still available if you paste it yourself.
                      </p>
                    </div>

                    <div
                      className="atlas-setup-tabs"
                      role="tablist"
                      aria-label="Installation method"
                      style={{ margin: 0 }}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={installTab === "agent"}
                        className={installTab === "agent" ? "active" : ""}
                        onClick={() => setInstallTab("agent")}
                      >
                        <Sparkles size={14} /> AI Agent Prompt
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={installTab === "html"}
                        className={installTab === "html" ? "active" : ""}
                        onClick={() => setInstallTab("html")}
                      >
                        <Code2 size={14} /> HTML Snippet
                      </button>
                    </div>

                    {installTab === "agent" ? (
                      <>
                        <pre
                          style={{
                            margin: 0,
                            padding: "10px 12px",
                            borderRadius: "8px",
                            background: "var(--surface-subtle)",
                            border: "1px solid var(--border)",
                            fontSize: "11px",
                            overflowX: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            maxHeight: "220px",
                          }}
                        >
                          {webAgentPrompt}
                        </pre>
                        <button
                          type="button"
                          className="primary-action"
                          style={{
                            justifySelf: "start",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px 14px",
                            borderRadius: "8px",
                          }}
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(webAgentPrompt)
                              .then(() => {
                                setCopiedPrompt(true);
                                window.setTimeout(
                                  () => setCopiedPrompt(false),
                                  1600,
                                );
                              });
                          }}
                        >
                          {copiedPrompt ? (
                            <Check size={15} />
                          ) : (
                            <Clipboard size={15} />
                          )}
                          {copiedPrompt
                            ? "Prompt copied"
                            : "Copy AI agent prompt"}
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: "12px", color: "var(--foreground-muted)" }}>
                          Paste before {"</body>"} on {webSuccess.domain}
                        </span>
                        <pre
                          style={{
                            margin: 0,
                            padding: "10px 12px",
                            borderRadius: "8px",
                            background: "var(--surface-subtle)",
                            border: "1px solid var(--border)",
                            fontSize: "11px",
                            overflowX: "auto",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}
                        >
                          {webSnippet}
                        </pre>
                        <button
                          type="button"
                          className="secondary-action"
                          style={{
                            justifySelf: "start",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                          onClick={() => {
                            void navigator.clipboard
                              .writeText(webSnippet)
                              .then(() => {
                                setCopiedSnippet(true);
                                window.setTimeout(
                                  () => setCopiedSnippet(false),
                                  1600,
                                );
                              });
                          }}
                        >
                          {copiedSnippet ? (
                            <Check size={15} />
                          ) : (
                            <Clipboard size={15} />
                          )}
                          {copiedSnippet ? "Copied" : "Copy install snippet"}
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--foreground-muted)" }}>
                    Website saved. Open Acquisition Atlas to finish install if a
                    tracking token is not shown yet.
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="primary-action"
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                  onClick={() => onAdded(webSuccess.id, { openAtlas: true })}
                >
                  <Waypoints size={16} />
                  Open Acquisition Atlas
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  style={{ padding: "8px 16px", borderRadius: "8px" }}
                  onClick={() => onAdded(webSuccess.id)}
                >
                  Open website pulse
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="app-catalog-search">
                <Globe size={18} />
                <input
                  value={webUrl}
                  onChange={(event) => {
                    setWebUrl(event.target.value);
                    setWebError("");
                  }}
                  placeholder="Paste site URL or domain (e.g. appclimb.app)"
                  autoComplete="off"
                />
              </label>

              <label
                className="web-name-input"
                style={{ marginTop: "12px", display: "block" }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Web SaaS Name (Optional)
                </span>
                <input
                  value={webName}
                  onChange={(event) => setWebName(event.target.value)}
                  placeholder={
                    cleanWebDomain
                      ? cleanWebDomain
                      : "e.g. AppClimb Web Analytics"
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                  }}
                />
              </label>

              {cleanWebDomain && cleanWebDomain.includes(".") ? (
                <div
                  className="web-preview-card"
                  style={{
                    marginTop: "16px",
                    padding: "14px",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: "var(--surface-subtle)",
                  }}
                >
                  <DomainFavicon
                    domain={cleanWebDomain}
                    name={webName.trim() || cleanWebDomain}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong
                      style={{
                        display: "block",
                        fontSize: "14px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {webName.trim() || cleanWebDomain}
                    </strong>
                    <small
                      style={{
                        color: "var(--foreground-muted)",
                        fontSize: "12px",
                      }}
                    >
                      {cleanWebDomain} · Web SaaS
                    </small>
                  </div>
                  <button
                    type="button"
                    className="primary-action"
                    style={{
                      padding: "8px 16px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    disabled={Boolean(addingId)}
                    onClick={() => void addWebSaaS()}
                  >
                    {addingId === cleanWebDomain ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                    Add Web SaaS
                  </button>
                </div>
              ) : (
                <div className="app-search-empty" style={{ marginTop: "16px" }}>
                  Enter any Web SaaS domain (you can add as many as you need) to
                  track visitors, crawlers, campaigns, and product analytics.
                </div>
              )}

              {webError && (
                <div
                  className="app-search-empty is-error"
                  role="alert"
                  style={{ marginTop: "12px" }}
                >
                  {webError}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
          <label className="app-catalog-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Paste App Store URL or type app name"
              autoComplete="off"
            />
            {state === "loading" && <LoaderCircle className="spin" size={17} />}
          </label>
          <div className="app-search-results" aria-live="polite">
            {!searchActive && (
              <div className="app-search-empty">
                Search by app name or paste a direct App Store URL e.g. <code>https://apps.apple.com/us/app/.../id6741490278</code>
              </div>
            )}
            {searchActive && state === "ready" && results.length === 0 && (
              <div className="app-search-empty">
                No App Store apps matched this query or URL.
              </div>
            )}
            {state === "error" && (
              <div className="app-search-empty is-error">
                The App Store catalog could not be reached. Try again.
              </div>
            )}
            {searchActive && results.map((app) => {
              const initials = app.name
                .split(/\s+/u)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase();
              return (
                <button
                  className="app-search-result"
                  type="button"
                  key={app.appStoreId}
                  disabled={Boolean(addingId)}
                  onClick={() => void add(app)}
                >
                  <span className="catalog-app-icon">
                    {app.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={app.iconUrl}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          const target = event.currentTarget;
                          target.style.display = "none";
                          target.parentElement?.setAttribute(
                            "data-initials",
                            initials,
                          );
                        }}
                      />
                    ) : (
                      initials
                    )}
                  </span>
                  <span>
                    <strong>{app.name}</strong>
                    <small>
                      {app.developer} · {app.genre}
                    </small>
                  </span>
                  {addingId === app.appStoreId ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <Plus size={18} />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </ModalDialog>
  );
}

export function AppSelector({
  snapshot,
}: {
  snapshot: DashboardSnapshot;
}) {
  const [apps, setApps] = useState<WorkspaceApp[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deletingApp, setDeletingApp] = useState<WorkspaceApp | null>(null);
  const [deletingState, setDeletingState] = useState<"idle" | "loading" | "error">("idle");

  const [fetchedIcons, setFetchedIcons] = useState<Record<string, string>>({});

  const loadApps = useCallback(() => {
    if (snapshot.mode === "demo") return;
    fetch("/api/apps", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("apps_failed");
        return (await response.json()) as { data?: WorkspaceApp[] };
      })
      .then((payload) => setApps(payload.data ?? []))
      .catch(() => setApps([]));
  }, [snapshot.mode]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  useEffect(() => {
    // Look up missing icons for any workspace app that has appStoreId
    const targets = apps.filter((app) => !app.iconUrl && app.appStoreId && !fetchedIcons[app.id]);
    for (const app of targets) {
      if (!app.appStoreId) continue;
      lookupAppStoreIcon(app.appStoreId)
        .then((icon) => {
          if (icon) setFetchedIcons((prev) => ({ ...prev, [app.id]: icon }));
        })
        .catch(() => undefined);
    }
  }, [apps, fetchedIcons]);

  useEffect(() => {
    // Also look up icon for snapshot.app if missing
    if (!snapshot.app.iconUrl && snapshot.app.id && !fetchedIcons[snapshot.app.id]) {
      const appStoreId = (snapshot.app as { appStoreId?: string; apple_app_id?: string }).appStoreId ||
        (snapshot.app as { apple_app_id?: string }).apple_app_id;
      if (appStoreId) {
        lookupAppStoreIcon(appStoreId)
          .then((icon) => {
            if (icon) setFetchedIcons((prev) => ({ ...prev, [snapshot.app.id]: icon }));
          })
          .catch(() => undefined);
      }
    }
  }, [snapshot.app, fetchedIcons]);

  const selectApp = (appId: string, options?: { openAtlas?: boolean }) => {
    const url = new URL(window.location.href);
    url.searchParams.set("app", appId);
    url.searchParams.delete("insight");
    if (options?.openAtlas) {
      url.searchParams.set("atlas", "1");
    } else {
      url.searchParams.delete("atlas");
    }
    window.location.assign(url.toString());
  };

  const deleteApp = async (appId: string) => {
    setDeletingState("loading");
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(appId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("delete_failed");
      setDeletingApp(null);
      setDeletingState("idle");
      // If deleted active app, switch to another remaining app
      const remaining = apps.filter((item) => item.id !== appId);
      if (snapshot.app.id === appId && remaining.length > 0) {
        selectApp(remaining[0].id);
      } else {
        loadApps();
      }
    } catch {
      setDeletingState("error");
    }
  };

  const currentAppIcon = snapshot.app.iconUrl || fetchedIcons[snapshot.app.id] || apps.find((item) => item.id === snapshot.app.id)?.iconUrl;

  const getInitials = (name: string) =>
    name
      .split(/\s+/u)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();

  const displayApps: WorkspaceApp[] = apps.length > 0 ? apps : [
    {
      id: snapshot.app.id,
      name: snapshot.app.name,
      platform: ((snapshot.app as { platform?: string }).platform === "Web" ? "Web" : "iOS") as "iOS" | "Web",
      bundleId: (snapshot.app as { bundleId?: string }).bundleId || "",
      appStoreId: (snapshot.app as { appStoreId?: string; apple_app_id?: string }).appStoreId || (snapshot.app as { apple_app_id?: string }).apple_app_id || "",
      storefront: snapshot.app.storefront || "US",
      iconUrl: snapshot.app.iconUrl,
      configured: true,
    },
  ];

  return (
    <>
      <div className="pulse-app-tabs-container">
        <div className="pulse-app-tabs-row" role="tablist" aria-label="Workspace apps and websites">
          {displayApps.map((app) => {
            const isActive = app.id === snapshot.app.id;
            const isWeb = app.platform === "Web" || (app.bundleId && app.bundleId.includes(".") && !app.appStoreId);
            const iconUrl = app.iconUrl || fetchedIcons[app.id] || (isActive ? currentAppIcon : undefined);

            return (
              <div
                key={app.id}
                className={`workspace-app-tab ${isActive ? "active" : ""}`}
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  if (!isActive) selectApp(app.id);
                }}
              >
                <TabAppIcon
                  name={app.name}
                  iconUrl={iconUrl}
                  isWeb={Boolean(isWeb)}
                  bundleId={app.bundleId}
                />
                <span className="tab-app-name">{app.name}</span>
                <span className={`platform-badge ${isWeb ? "web" : "ios"}`}>
                  {isWeb ? "Web" : "iOS"}
                </span>
                {!isWeb && <span className="storefront-badge">{app.storefront || "US"}</span>}
                {displayApps.length > 1 && (
                  <button
                    className="tab-delete-btn"
                    type="button"
                    title={`Remove ${app.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingApp(app);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}

          {snapshot.mode !== "demo" && (
            <button
              className="add-app-tab-btn"
              type="button"
              aria-label="Add app"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={15} />
              <span>Add app or website</span>
            </button>
          )}
        </div>
      </div>

      {deletingApp && (
        <ModalDialog
          labelledBy="delete-app-modal-title"
          onClose={() => setDeletingApp(null)}
        >
          <div className="delete-app-dialog-content">
            <h3 id="delete-app-modal-title">Delete App</h3>
            <p>
              Are you sure you want to delete <strong>{deletingApp.name}</strong>?
              This will remove the app, its keyword tracking data, and associated source links from this workspace.
            </p>
            {deletingState === "error" && (
              <p className="error-text" style={{ color: "#ef4444", fontSize: "0.875rem" }}>
                Failed to delete app. Workspaces must have at least one app.
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={deletingState === "loading"}
                onClick={() => setDeletingApp(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-action"
                style={{
                  background: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "0.5rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                disabled={deletingState === "loading"}
                onClick={() => void deleteApp(deletingApp.id)}
              >
                {deletingState === "loading" ? "Deleting..." : "Delete App"}
              </button>
            </div>
          </div>
        </ModalDialog>
      )}

      {addOpen && (
        <AddAppDialog
          onClose={() => setAddOpen(false)}
          onAdded={selectApp}
        />
      )}
    </>
  );
}

function keywordStrength(rank: number | null, checked: boolean) {
  if (!checked) return { label: "Waiting", level: "waiting" };
  if (rank === null) return { label: "Outside 200", level: "weak" };
  if (rank <= 10) return { label: "Strong", level: "strong" };
  if (rank <= 40) return { label: "Building", level: "building" };
  return { label: "Weak", level: "weak" };
}

function KeywordTerrain({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [tracks, setTracks] = useState<KeywordTrack[]>(
    snapshot.mode === "demo" ? demoKeywordTracks : [],
  );
  const [keyword, setKeyword] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">(
    snapshot.mode === "demo" ? "ready" : "loading",
  );
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!snapshot.app.id || snapshot.mode === "demo") {
      return;
    }
    try {
      const response = await fetch(
        `/api/keywords?appId=${encodeURIComponent(snapshot.app.id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("keywords_failed");
      const payload = (await response.json()) as { data?: KeywordTrack[] };
      setTracks(payload.data ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [snapshot.app.id, snapshot.mode]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const addKeyword = async (nextKeyword: string) => {
    const clean = nextKeyword.trim();
    if (!clean || !snapshot.app.id) return;
    setState("saving");
    try {
      const response = await fetch("/api/keywords", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId: snapshot.app.id,
          keyword: clean,
          storefront: snapshot.app.storefront,
        }),
      });
      if (!response.ok) throw new Error("keyword_add_failed");
      setKeyword("");
      setSuggestions((values) =>
        values.filter((value) => value.keyword !== clean),
      );
      // Observe the rank for the freshly added track immediately. The server
      // no longer does this because Apple blocks Workers IPs.
      await observeRanks([clean.toLocaleLowerCase().replace(/\s+/gu, " ")]);
      await reload();
    } catch {
      setState("error");
    }
  };

  const loadSuggestions = async () => {
    setSuggestionsOpen(true);
    if (suggestions.length || !snapshot.app.appStoreId) return;
    setState("loading");
    try {
      // Suggestions are derived in the browser from the iTunes /lookup payload
      // the client fetches (iTunes allows CORS *). The server no longer does
      // this because Apple blocks Workers IPs.
      const raw = await lookupAppStoreApp(
        snapshot.app.appStoreId,
        snapshot.app.storefront,
      );
      const tracked = new Set(tracks.map((track) => track.keyword));
      setSuggestions(
        deriveKeywordSuggestions(raw, snapshot.app.name).filter(
          (item) => !tracked.has(item.keyword),
        ),
      );
      setState("ready");
    } catch {
      setState("error");
    }
  };

  // Probe iTunes (from the browser, which Apple allows) for the rank position
  // of the app for each keyword, then POST the observations to the server.
  const observeRanks = async (keywords: string[]) => {
    const appStoreId = snapshot.app.appStoreId;
    const storefront = snapshot.app.storefront;
    if (!appStoreId || !keywords.length) return;
    const observations = await Promise.all(
      keywords.map(async (kw) => {
        try {
          const rank = await keywordRankPosition(kw, storefront, appStoreId);
          return { keyword: kw, storefront, rank };
        } catch {
          return {
            keyword: kw,
            storefront,
            rank: null,
          };
        }
      }),
    );
    await fetch("/api/keywords/observations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appId: snapshot.app.id,
        observations,
      }),
    });
  };

  const runCheck = async () => {
    setState("saving");
    try {
      await observeRanks(tracks.map((track) => track.keyword));
      await reload();
    } catch {
      setState("error");
    }
  };

  const plotted = useMemo(
    () => tracks.filter((track) => track.checked),
    [tracks],
  );

  return (
    <section className="keyword-terrain" aria-labelledby="keyword-terrain-title">
      <header className="keyword-terrain-header">
        <div>
          <span className="eyebrow">App Store visibility</span>
          <h2 id="keyword-terrain-title">Keyword Terrain</h2>
        </div>
        <div className="keyword-actions">
          <form
            className="keyword-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              void addKeyword(keyword);
            }}
          >
            <Search size={16} />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Add a keyword"
              maxLength={80}
              disabled={snapshot.mode === "demo"}
            />
            <button
              type="submit"
              disabled={!keyword.trim() || state === "saving"}
              aria-label="Add keyword"
            >
              <Plus size={17} />
            </button>
          </form>
          <button
            className="smart-suggestions-button"
            type="button"
            disabled={snapshot.mode === "demo"}
            onClick={() => void loadSuggestions()}
          >
            <Sparkles size={16} /> Smart suggestions
          </button>
        </div>
      </header>

      <div className="keyword-truth-note">
        <BadgeCheck size={16} />
        <span>
          Rank is the observed App Store search-result position, refreshed on
          demand. Apple Ads adds official 1–5 search popularity; AppClimb never
          fabricates volume.
        </span>
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={!tracks.length || state === "saving" || snapshot.mode === "demo"}
        >
          <RefreshCw className={state === "saving" ? "spin" : ""} size={14} />
          Check new ranks
        </button>
      </div>

      {suggestionsOpen && (
        <div className="keyword-suggestions">
          <div>
            <Sparkles size={16} />
            <span>Suggested from this app&apos;s public store metadata</span>
          </div>
          {suggestions.length ? (
            suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.keyword}
                onClick={() => void addKeyword(suggestion.keyword)}
                disabled={state === "saving"}
              >
                <Plus size={13} /> {suggestion.keyword}
                <small>{suggestion.reason}</small>
              </button>
            ))
          ) : (
            <small>No new suggestions are available.</small>
          )}
        </div>
      )}

      <div className="keyword-terrain-grid">
        <article className="rank-terrain-card">
          <header>
            <div>
              <strong>Rank terrain</strong>
              <small>Closer to the left is stronger</small>
            </div>
            <span>1 → 200+</span>
          </header>
          <div className="rank-terrain-axis">
            <span>Top 10</span>
            <span>Top 40</span>
            <span>Top 100</span>
            <span>200+</span>
          </div>
          <div className="rank-terrain-plot">
            <i className="rank-line line-10" />
            <i className="rank-line line-40" />
            <i className="rank-line line-100" />
            {plotted.map((track, index) => {
              const position =
                track.rank === null
                  ? 96
                  : Math.max(2, Math.min(96, (track.rank / 200) * 94 + 2));
              const strength = keywordStrength(track.rank, track.checked);
              return (
                <span
                  className={`keyword-bubble strength-${strength.level}`}
                  key={track.id}
                  style={{
                    left: `${position}%`,
                    top: `${16 + (index % 5) * 17}%`,
                    transform:
                      position < 16
                        ? "translateX(0)"
                        : position > 84
                          ? "translateX(-100%)"
                          : "translateX(-50%)",
                  }}
                  title={`${track.keyword}: ${
                    track.rank === null ? "outside top 200" : `#${track.rank}`
                  }`}
                >
                  {track.keyword}
                </span>
              );
            })}
            {!plotted.length && (
              <div className="rank-terrain-empty">
                <CalendarClock size={22} />
                <strong>Add a keyword to place the first point</strong>
                <span>History grows with one bounded daily check.</span>
              </div>
            )}
          </div>
          <footer>
            <span>
              <i className="legend-dot is-strong" /> Strong
            </span>
            <span>
              <i className="legend-dot is-building" /> Building
            </span>
            <span>
              <i className="legend-dot is-weak" /> Opportunity
            </span>
          </footer>
        </article>

        <article className="keyword-table-card">
          <div className="keyword-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Rank</th>
                  <th>Trend</th>
                  <th>Popularity</th>
                  <th>Strength</th>
                  <th>Opportunity</th>
                </tr>
              </thead>
              <tbody>
                {tracks.map((track) => {
                  const strength = keywordStrength(track.rank, track.checked);
                  return (
                    <tr key={track.id}>
                      <td>
                        <span className={`keyword-row-dot ${strength.level}`} />
                        <strong>{track.keyword}</strong>
                        <small>{track.storefront}</small>
                      </td>
                      <td>
                        <strong>
                          {!track.checked
                            ? "—"
                            : track.rank === null
                              ? ">200"
                              : `#${track.rank}`}
                        </strong>
                        <small>{track.checked ? "Observed" : "Waiting"}</small>
                      </td>
                      <td className="keyword-trend-cell">
                        <Sparkline
                          values={track.history
                            .map((point) => point.rank)
                            .filter((rank): rank is number => rank !== null)}
                          invert
                        />
                        {track.trend !== null && track.trend !== 0 && (
                          <span
                            className={
                              track.trend > 0 ? "trend-up" : "trend-down"
                            }
                          >
                            {track.trend > 0 ? (
                              <ArrowUpRight size={12} />
                            ) : (
                              <ArrowDownRight size={12} />
                            )}
                            {Math.abs(track.trend)}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="popularity-locked">Apple Ads</span>
                        <small>Not connected</small>
                      </td>
                      <td>
                        <span className={`strength-pill ${strength.level}`}>
                          {strength.label}
                        </span>
                      </td>
                      <td>
                        <span className="opportunity-label">
                          {!track.checked
                            ? "First check"
                            : track.rank === null
                              ? "High"
                              : track.rank > 40
                                ? "High"
                                : track.rank > 10
                                  ? "Medium"
                                  : "Defend"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!tracks.length && (
                  <tr>
                    <td className="keyword-table-empty" colSpan={6}>
                      <Sparkles size={18} />
                      Add your first keyword or use smart suggestions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer>
            <span>
              {state === "error"
                ? "Keyword data could not be refreshed."
                : `${tracks.length}/100 keywords · checks are capped and spread over time`}
            </span>
            <a
              href="https://developer.apple.com/documentation/apple_ads/impression-share-report"
              target="_blank"
              rel="noreferrer"
            >
              Why popularity needs Apple Ads <ExternalLink size={12} />
            </a>
          </footer>
        </article>
      </div>
    </section>
  );
}

export function ProductPulseWorkspace({
  snapshot,
  onOpenSources,
}: {
  snapshot: DashboardSnapshot;
  onOpenSources: () => void;
}) {
  return (
    <>
      <div className="pulse-product-toolbar">
        <AppSelector snapshot={snapshot} />
      </div>
      <PostHogOverview
        pulse={snapshot.posthogPulse}
        onOpenSources={onOpenSources}
        demo={snapshot.mode === "demo"}
      />
      <KeywordTerrain snapshot={snapshot} />
    </>
  );
}
