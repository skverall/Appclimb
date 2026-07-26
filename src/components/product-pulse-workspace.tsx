"use client";

import {
  AppWindow,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Store,
  Waypoints,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ModalDialog } from "@/components/modal-dialog";
import type { DashboardSnapshot, PostHogPulse } from "@/lib/contracts";

interface WorkspaceApp {
  id: string;
  name: string;
  platform: "iOS";
  bundleId: string;
  appStoreId: string;
  storefront: string;
  configured: boolean;
}

interface CatalogApp {
  appStoreId: string;
  name: string;
  bundleId: string;
  developer: string;
  genre: string;
  iconUrl: string;
  storeUrl: string;
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

function AddAppDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (appId: string) => void;
}) {
  const [platform, setPlatform] = useState<"app-store" | "google-play">(
    "app-store",
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogApp[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [addingId, setAddingId] = useState("");
  const searchActive = platform === "app-store" && query.trim().length >= 2;

  useEffect(() => {
    if (!searchActive) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading");
      fetch(
        `/api/apps/search?platform=app-store&storefront=US&q=${encodeURIComponent(
          query.trim(),
        )}`,
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("app_search_failed");
          return (await response.json()) as { data?: CatalogApp[] };
        })
        .then((payload) => {
          setResults(payload.data ?? []);
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
  }, [query, searchActive]);

  const add = async (app: CatalogApp) => {
    setAddingId(app.appStoreId);
    setState("loading");
    try {
      const response = await fetch("/api/apps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: "app-store",
          appStoreId: app.appStoreId,
          storefront: "US",
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
          <h2 id="add-app-title">Add an app</h2>
          <p>Find the public listing first; connect private analytics separately.</p>
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
      ) : (
        <>
          <label className="app-catalog-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Type your App Store app name"
              autoComplete="off"
            />
            {state === "loading" && <LoaderCircle className="spin" size={17} />}
          </label>
          <div className="app-search-results" aria-live="polite">
            {!searchActive && (
              <div className="app-search-empty">
                Search uses Apple&apos;s public catalog and is limited to eight
                relevant results.
              </div>
            )}
            {searchActive && state === "ready" && results.length === 0 && (
              <div className="app-search-empty">
                No App Store apps matched this name in the US storefront.
              </div>
            )}
            {state === "error" && (
              <div className="app-search-empty is-error">
                The App Store catalog could not be reached. Try again.
              </div>
            )}
            {searchActive && results.map((app) => (
              <button
                className="app-search-result"
                type="button"
                key={app.appStoreId}
                disabled={Boolean(addingId)}
                onClick={() => void add(app)}
              >
                <span className="catalog-app-icon">
                  {app.name
                    .split(/\s+/u)
                    .slice(0, 2)
                    .map((word) => word[0])
                    .join("")
                    .toUpperCase()}
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
            ))}
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

  useEffect(() => {
    if (snapshot.mode === "demo") return;
    fetch("/api/apps", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("apps_failed");
        return (await response.json()) as { data?: WorkspaceApp[] };
      })
      .then((payload) => setApps(payload.data ?? []))
      .catch(() => setApps([]));
  }, [snapshot.mode]);

  const selectApp = (appId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("app", appId);
    url.searchParams.delete("insight");
    window.location.assign(url);
  };

  return (
    <>
      <div className="pulse-app-selector">
        <span className="mini-app-icon">
          {snapshot.app.name
            .split(/\s+/u)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase()}
        </span>
        <select
          aria-label="Select app"
          value={snapshot.app.id}
          disabled={!apps.length}
          onChange={(event) => selectApp(event.target.value)}
        >
          {!apps.length && (
            <option value={snapshot.app.id}>{snapshot.app.name}</option>
          )}
          {apps.map((app) => (
            <option key={app.id} value={app.id}>
              {app.name}
            </option>
          ))}
        </select>
        <span className="platform-badge">iOS</span>
        <span className="storefront-badge">{snapshot.app.storefront}</span>
        <ChevronDown size={15} />
      </div>
      {snapshot.mode !== "demo" && (
        <button
          className="add-app-button"
          type="button"
          onClick={() => setAddOpen(true)}
        >
          <Plus size={16} /> Add app
        </button>
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
      await reload();
    } catch {
      setState("error");
    }
  };

  const loadSuggestions = async () => {
    setSuggestionsOpen(true);
    if (suggestions.length) return;
    setState("loading");
    try {
      const response = await fetch(
        `/api/keywords/suggestions?appId=${encodeURIComponent(snapshot.app.id)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("suggestions_failed");
      const payload = (await response.json()) as { data?: Suggestion[] };
      const tracked = new Set(tracks.map((track) => track.keyword));
      setSuggestions(
        (payload.data ?? []).filter((item) => !tracked.has(item.keyword)),
      );
      setState("ready");
    } catch {
      setState("error");
    }
  };

  const runCheck = async () => {
    setState("saving");
    try {
      const response = await fetch("/api/keywords/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId: snapshot.app.id }),
      });
      if (!response.ok) throw new Error("keyword_check_failed");
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
          Rank is the observed App Store search-result position. Apple Ads adds
          official 1–5 search popularity; AppClimb never fabricates volume.
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
