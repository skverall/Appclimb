"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import { AddKeywordsModal } from "@/components/add-keywords-modal";
import { RankingOverview } from "@/components/ranking-overview";
import { SuggestionsModal } from "@/components/suggestions-modal";
import { TrackerDetail } from "@/components/tracker-detail";
import { Sparkline } from "@/components/keyword-charts";
import { SUPPORTED_COUNTRIES, formatAsoKeywordField } from "@/lib/aso";
import {
  enrichAnalysisResult,
  popularityShortLabel,
  popularitySourceOf,
} from "@/lib/popularity";
import type { CatalogApp, KeywordSuggestion } from "@/lib/itunes";
import {
  RATE_LIMIT_COOLDOWN_MS,
  REFRESH_CONCURRENCY,
  REFRESH_GAP_MS,
  addKeywordsToStore,
  analyzeWithRetry,
  applyAnalysisToStore,
  buildKeywordSuggestions,
  buildKeywordsCsv,
  describeRankTrend,
  downloadTextFile,
  formatPosition,
  humanizeItunesError,
  isKeywordStale,
  isRateLimitError,
  keywordKey,
  listKeywordsForApp,
  loadAppMetadata,
  markKeywordUnavailable,
  mapWithConcurrency,
  matchesStatusFilter,
  normalizeKeyword,
  opportunityScore,
  positionSparklineValues,
  removeKeywordFromStore,
  snapshotsFor,
  updateKeywordNote,
  type KeywordStatusFilter,
  type TrackedApp,
  type TrackerStore,
} from "@/lib/tracker";

type SortKey =
  | "keyword"
  | "popularity"
  | "difficulty"
  | "position"
  | "lastUpdate"
  | "opportunity";

type Density = "comfortable" | "compact";

const STATUS_FILTERS: Array<{ id: KeywordStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "ranked", label: "In top 200" },
  { id: "out", label: ">200" },
  { id: "new", label: "New" },
  { id: "unchecked", label: "Needs check" },
  { id: "opportunity", label: "Opportunity" },
];

function MetricBar({
  value,
  tone,
}: {
  value: number;
  tone: "popularity" | "difficulty";
}) {
  return (
    <span className={`metric-bar metric-bar--${tone}`} aria-hidden="true">
      <i style={{ width: `${value}%` }} />
      <b>{value}</b>
    </span>
  );
}

function TopAppIcons({
  apps,
}: {
  apps: Array<{
    appStoreId: string;
    name: string;
    developer: string;
    iconUrl: string;
    position: number;
  }>;
}) {
  const visible = apps.slice(0, 5);
  if (visible.length === 0) {
    return <em className="keyword-pending">—</em>;
  }
  return (
    <span className="tracker-top-icons">
      {visible.map((app) => (
        <span
          key={app.appStoreId}
          className="tracker-top-icon"
          title={`#${app.position} ${app.name} — ${app.developer}`}
        >
          {app.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={app.iconUrl} alt="" width={22} height={22} loading="lazy" />
          ) : (
            <span aria-hidden="true">{app.name.charAt(0)}</span>
          )}
        </span>
      ))}
      {apps.length > 5 && (
        <span className="tracker-top-more">+{apps.length - 5}</span>
      )}
    </span>
  );
}

export function TrackerView({
  app,
  store,
  onStoreChange,
  suspendAutoRefresh = false,
  onTrackInStorefront,
}: {
  app: TrackedApp;
  store: TrackerStore;
  onStoreChange: (next: TrackerStore) => void;
  /** Parent is already analyzing (e.g. post-add suggestions) — don't double-fetch. */
  suspendAutoRefresh?: boolean;
  /** Offer tracking the same app id in another country. */
  onTrackInStorefront?: (country: string) => void;
}) {
  const [copiedAsoField, setCopiedAsoField] = useState(false);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<KeywordStatusFilter>("all");
  const [historyDays, setHistoryDays] = useState<7 | 30>(30);
  const [density, setDensity] = useState<Density>("comfortable");
  const [sortKey, setSortKey] = useState<SortKey>("opportunity");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<string | null>(null);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    current?: string;
    phase?: "checking" | "cooling";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addKeywordsOpen, setAddKeywordsOpen] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<KeywordSuggestion & { alreadyTracked: boolean }>
  >([]);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autoRefreshDone = useRef<string | null>(null);
  const storeRef = useRef(store);

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  const keywords = useMemo(
    () => listKeywordsForApp(store, app.appStoreId, app.country),
    [store, app.appStoreId, app.country],
  );

  const existingNormalized = useMemo(
    () => new Set(keywords.map((row) => row.normalizedKeyword)),
    [keywords],
  );

  const otherStorefronts = useMemo(
    () =>
      SUPPORTED_COUNTRIES.filter(
        (item) =>
          item.code !== app.country &&
          !store.apps.some(
            (tracked) =>
              tracked.appStoreId === app.appStoreId &&
              tracked.country === item.code,
          ),
      ),
    [app.appStoreId, app.country, store.apps],
  );

  const countryLabel =
    SUPPORTED_COUNTRIES.find((item) => item.code === app.country)?.label ??
    app.country;

  const refreshKeywords = useCallback(
    async (targets: string[], options: { openFirst?: boolean } = {}) => {
      if (targets.length === 0) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setProgress({ done: 0, total: targets.length, phase: "checking" });
      setBusyKeys(new Set(targets.map((kw) => normalizeKeyword(kw))));

      let working = storeRef.current;
      let done = 0;
      let failures = 0;
      let rateLimited = 0;

      try {
        const outcomes = await mapWithConcurrency(
          targets,
          REFRESH_CONCURRENCY,
          async (keyword) => {
            setProgress((prev) =>
              prev
                ? { ...prev, current: keyword, phase: "checking" }
                : prev,
            );
            try {
              return enrichAnalysisResult(
                await analyzeWithRetry(keyword, app.country, app.appStoreId, {
                  signal: controller.signal,
                  onRetry: ({ attempt, maxAttempts, error }) => {
                    if (isRateLimitError(error)) {
                      setProgress((prev) =>
                        prev
                          ? {
                              ...prev,
                              phase: "cooling",
                              current: `Rate-limited — retry ${attempt}/${maxAttempts}`,
                            }
                          : prev,
                      );
                    }
                  },
                }),
              );
            } catch (error) {
              if (isRateLimitError(error)) {
                rateLimited += 1;
                setProgress((prev) =>
                  prev
                    ? {
                        ...prev,
                        phase: "cooling",
                        current: "Cooling down after rate limit…",
                      }
                    : prev,
                );
                await new Promise<void>((resolve, reject) => {
                  const timer = window.setTimeout(resolve, RATE_LIMIT_COOLDOWN_MS);
                  const onAbort = () => {
                    window.clearTimeout(timer);
                    reject(new DOMException("Aborted", "AbortError"));
                  };
                  if (controller.signal.aborted) {
                    onAbort();
                    return;
                  }
                  controller.signal.addEventListener("abort", onAbort, {
                    once: true,
                  });
                });
              }
              throw error;
            }
          },
          { signal: controller.signal, gapMs: REFRESH_GAP_MS },
        );

        working = storeRef.current;
        for (const outcome of outcomes) {
          done += 1;
          setProgress({
            done,
            total: targets.length,
            current: outcome.item,
            phase: "checking",
          });
          if (outcome.result) {
            working = applyAnalysisToStore(
              working,
              app.appStoreId,
              app.country,
              outcome.item,
              outcome.result,
            );
            onStoreChange(working);
          } else if (outcome.error) {
            failures += 1;
            if (isRateLimitError(outcome.error)) rateLimited += 1;
            working = markKeywordUnavailable(
              working,
              app.appStoreId,
              app.country,
              outcome.item,
            );
            onStoreChange(working);
          }
        }
        if (options.openFirst && targets[0]) {
          setSelected(normalizeKeyword(targets[0]));
        }
        if (failures > 0) {
          setError(
            failures === targets.length
              ? rateLimited > 0
                ? "Apple rate-limited this batch. Existing data is preserved — wait a moment and use Refresh All."
                : humanizeItunesError(
                    outcomes.find((item) => item.error)?.error ??
                      new Error("app_store_catalog_unavailable:429"),
                  )
              : `Updated ${targets.length - failures} of ${targets.length} keywords${
                  rateLimited > 0 ? " (some hits were rate-limited)" : ""
                }. Existing data was kept.`,
          );
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError(null);
        } else {
          setError(humanizeItunesError(err));
        }
      } finally {
        setBusyKeys(new Set());
        setProgress(null);
      }
    },
    [app.appStoreId, app.country, onStoreChange],
  );

  useEffect(() => {
    if (suspendAutoRefresh) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled || busyKeys.size > 0) return;
        const rows = listKeywordsForApp(
          storeRef.current,
          app.appStoreId,
          app.country,
        );
        const needsCheck = rows
          .filter((row) => {
            if (!row.currentMetrics) return true;
            if (row.currentMetrics.unavailable) return false;
            return isKeywordStale(row);
          })
          .map((row) => row.keyword);
        if (needsCheck.length === 0) return;

        const fingerprint = `${app.appStoreId}:${app.country}:${needsCheck
          .map((k) => normalizeKeyword(k))
          .sort()
          .join("|")}`;
        if (autoRefreshDone.current === fingerprint) return;
        autoRefreshDone.current = fingerprint;

        await refreshKeywords(needsCheck);
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    app.appStoreId,
    app.country,
    keywords,
    refreshKeywords,
    busyKeys.size,
    suspendAutoRefresh,
  ]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const openSuggestions = useCallback(async () => {
    setSuggestionsBusy(true);
    setError(null);
    try {
      const meta = await loadAppMetadata(app.appStoreId, app.country);
      const raw = meta?.raw ?? {
        trackName: app.name,
        primaryGenreName: app.genre,
        description: app.description,
      };
      let competitorApps: CatalogApp[] = [];
      const firstWithMetrics = keywords.find(
        (row) => row.currentMetrics && row.currentMetrics.topApps.length > 0,
      );
      if (firstWithMetrics?.currentMetrics) {
        competitorApps = firstWithMetrics.currentMetrics.topApps
          .filter((top) => top.appStoreId !== app.appStoreId)
          .slice(0, 5)
          .map((top) => ({
            appStoreId: top.appStoreId,
            name: top.name,
            bundleId: "",
            developer: top.developer,
            genre: top.genre,
            iconUrl: top.iconUrl,
            storeUrl: top.storeUrl,
          }));
      }
      const next = buildKeywordSuggestions(raw, app.name, {
        existingNormalized,
        competitorApps,
      });
      setSuggestions(next);
      setSuggestionsOpen(true);
    } catch (err) {
      setError(humanizeItunesError(err));
    } finally {
      setSuggestionsBusy(false);
    }
  }, [app, existingNormalized, keywords]);

  const statusCounts = useMemo(() => {
    const counts: Record<KeywordStatusFilter, number> = {
      all: keywords.length,
      ranked: 0,
      out: 0,
      new: 0,
      unchecked: 0,
      opportunity: 0,
    };
    for (const row of keywords) {
      const snaps = snapshotsFor(
        store,
        app.appStoreId,
        app.country,
        row.normalizedKeyword,
        historyDays,
      );
      for (const id of Object.keys(counts) as KeywordStatusFilter[]) {
        if (id === "all") continue;
        if (matchesStatusFilter(row, id, snaps)) counts[id] += 1;
      }
    }
    return counts;
  }, [keywords, store, app.appStoreId, app.country, historyDays]);

  const filteredSorted = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    const rows = keywords.filter((row) => {
      const snaps = snapshotsFor(
        store,
        app.appStoreId,
        app.country,
        row.normalizedKeyword,
        historyDays,
      );
      if (!matchesStatusFilter(row, statusFilter, snaps)) return false;
      if (!needle) return true;
      return (
        row.keyword.toLocaleLowerCase().includes(needle) ||
        row.note.toLocaleLowerCase().includes(needle)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const lm = left.currentMetrics;
      const rm = right.currentMetrics;
      switch (sortKey) {
        case "popularity":
          return ((lm?.popularity ?? -1) - (rm?.popularity ?? -1)) * dir;
        case "difficulty":
          return ((lm?.difficulty ?? -1) - (rm?.difficulty ?? -1)) * dir;
        case "position": {
          const lp = lm?.unavailable ? 9999 : (lm?.position ?? 9998);
          const rp = rm?.unavailable ? 9999 : (rm?.position ?? 9998);
          return (lp - rp) * dir;
        }
        case "lastUpdate": {
          const lt = left.lastCheckedAt ? Date.parse(left.lastCheckedAt) : 0;
          const rt = right.lastCheckedAt ? Date.parse(right.lastCheckedAt) : 0;
          return (lt - rt) * dir;
        }
        case "opportunity": {
          const lo = opportunityScore(lm) ?? -1;
          const ro = opportunityScore(rm) ?? -1;
          return (lo - ro) * dir;
        }
        default:
          return left.keyword.localeCompare(right.keyword) * dir;
      }
    });
  }, [
    keywords,
    filter,
    sortKey,
    sortDir,
    statusFilter,
    store,
    app.appStoreId,
    app.country,
    historyDays,
  ]);

  const selectedRow = selected
    ? keywords.find((row) => row.normalizedKeyword === selected) ?? null
    : null;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "keyword" ? "asc" : "desc");
    }
  };

  const confirmDelete = (normalized: string, label: string) => {
    if (
      !window.confirm(
        `Remove “${label}” from tracking? Its local notes and rank history for this app will be deleted.`,
      )
    ) {
      return;
    }
    onStoreChange(
      removeKeywordFromStore(store, app.appStoreId, app.country, normalized),
    );
    setSelected((current) => (current === normalized ? null : current));
  };

  const exportCsv = () => {
    const csv = buildKeywordsCsv(app, keywords, {
      snapshotsFor: (normalized) =>
        snapshotsFor(store, app.appStoreId, app.country, normalized, historyDays),
    });
    const safeName = app.name
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/giu, "-")
      .replace(/^-|-$/gu, "")
      .slice(0, 40);
    downloadTextFile(
      `appclimb-${safeName || app.appStoreId}-${app.country}.csv`,
      csv,
    );
  };

  return (
    <div className={`tracker-view tracker-view--${density}`}>
      <header className="tracker-view-header">
        <div className="tracker-view-app">
          {app.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={app.iconUrl} alt="" width={40} height={40} />
          ) : (
            <span className="tracker-app-icon-fallback" aria-hidden="true">
              {app.name.charAt(0)}
            </span>
          )}
          <div>
            <h1>{app.name}</h1>
            <p>
              {app.developer || "Unknown developer"}
              {app.genre ? ` · ${app.genre}` : ""} · Tracked for{" "}
              <strong>{countryLabel}</strong>
            </p>
          </div>
        </div>
        {onTrackInStorefront && otherStorefronts.length > 0 && (
          <label className="country-select tracker-track-storefront">
            <span>Also track in</span>
            <select
              defaultValue=""
              aria-label="Track this app in another storefront"
              onChange={(event) => {
                const code = event.target.value;
                if (!code) return;
                onTrackInStorefront(code);
                event.target.value = "";
              }}
            >
              <option value="" disabled>
                Choose storefront…
              </option>
              {otherStorefronts.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      <div className="tracker-toolbar" role="toolbar" aria-label="Keyword actions">
        <span className="tracker-store-pill" title="Active storefront for this app">
          {SUPPORTED_COUNTRIES.find((c) => c.code === app.country)?.flag}{" "}
          {app.country}
        </span>

        <button
          type="button"
          className="tracker-button-primary"
          onClick={() => setAddKeywordsOpen(true)}
        >
          <Plus size={15} aria-hidden="true" />
          Add Keywords
        </button>
        <button
          type="button"
          className="tracker-button-accent"
          onClick={() => void openSuggestions()}
          disabled={suggestionsBusy}
        >
          {suggestionsBusy ? (
            <Loader2 className="spin" size={15} aria-hidden="true" />
          ) : (
            <Lightbulb size={15} aria-hidden="true" />
          )}
          Get Suggestions
        </button>
        <button
          type="button"
          className="refresh-all-button"
          onClick={() => void refreshKeywords(keywords.map((row) => row.keyword))}
          disabled={keywords.length === 0 || busyKeys.size > 0}
        >
          <RefreshCw
            className={busyKeys.size > 0 ? "spin" : ""}
            size={15}
            aria-hidden="true"
          />
          Refresh All
        </button>
        <button
          type="button"
          className="refresh-all-button"
          onClick={exportCsv}
          disabled={keywords.length === 0}
          aria-label="Export keywords as CSV"
        >
          <Download size={15} aria-hidden="true" />
          Export CSV
        </button>
        <button
          type="button"
          className="refresh-all-button"
          onClick={async () => {
            const formatted = formatAsoKeywordField(keywords.map((k) => k.keyword));
            try {
              if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(formatted);
              }
              setCopiedAsoField(true);
              setTimeout(() => setCopiedAsoField(false), 2000);
            } catch {
              // Ignore clipboard failure
            }
          }}
          disabled={keywords.length === 0}
          title="Copies up to 100 characters of comma-separated keywords for Apple App Store Connect"
        >
          {copiedAsoField ? (
            <Check size={15} aria-hidden="true" />
          ) : (
            <Copy size={15} aria-hidden="true" />
          )}
          {copiedAsoField ? "Copied 100ch" : "Copy ASO 100ch"}
        </button>

        <label className="tracker-filter">
          <Search size={14} aria-hidden="true" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter keywords…"
            aria-label="Filter keywords"
          />
        </label>

        <label className="country-select">
          <span>History</span>
          <select
            value={historyDays}
            onChange={(event) =>
              setHistoryDays(Number(event.target.value) === 7 ? 7 : 30)
            }
            aria-label="History period"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </label>

        <label className="country-select">
          <span>Density</span>
          <select
            value={density}
            onChange={(event) =>
              setDensity(
                event.target.value === "compact" ? "compact" : "comfortable",
              )
            }
            aria-label="Table density"
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>
      </div>

      {progress && (
        <div
          className={`tracker-queue-banner${
            progress.phase === "cooling" ? " is-cooling" : ""
          }`}
          role="status"
          aria-live="polite"
        >
          <Loader2 className="spin" size={15} aria-hidden="true" />
          <div className="tracker-queue-banner-text">
            <strong>
              {progress.phase === "cooling"
                ? "Paused — Apple rate limit"
                : "Checking keywords"}
            </strong>
            <span>
              {progress.done}/{progress.total}
              {progress.current ? ` · ${progress.current}` : ""}
            </span>
          </div>
          <i className="tracker-bootstrap-bar" aria-hidden="true">
            <b
              style={{
                width: `${
                  progress.total > 0
                    ? (progress.done / progress.total) * 100
                    : 0
                }%`,
              }}
            />
          </i>
        </div>
      )}

      {keywords.length > 0 && (
        <div
          className="tracker-status-filters"
          role="tablist"
          aria-label="Keyword status filters"
        >
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={statusFilter === item.id}
              className={
                statusFilter === item.id
                  ? "tracker-status-chip is-active"
                  : "tracker-status-chip"
              }
              onClick={() => setStatusFilter(item.id)}
            >
              {item.label}
              <span>{statusCounts[item.id]}</span>
            </button>
          ))}
        </div>
      )}

      {statusFilter === "opportunity" && (
        <p className="tracker-heuristic-note">
          Opportunity is an <strong>estimated heuristic</strong> (popularity vs
          difficulty) — not Apple search volume or downloads.
        </p>
      )}

      {error && (
        <div className="keyword-error" role="alert">
          {error}
        </div>
      )}

      {keywords.length === 0 ? (
        <div className="keyword-empty">
          <Lightbulb size={24} aria-hidden="true" />
          <strong>No keywords for this app yet</strong>
          <span>
            Get suggestions from public App Store metadata, or add keywords
            manually. Metrics fill in automatically after you add them.
          </span>
          <div className="keyword-examples">
            <button type="button" onClick={() => void openSuggestions()}>
              Get Suggestions
            </button>
            <button type="button" onClick={() => setAddKeywordsOpen(true)}>
              Add Keywords
            </button>
          </div>
        </div>
      ) : filteredSorted.length === 0 ? (
        <div className="keyword-empty">
          <strong>No keywords match this filter</strong>
          <span>Try another status chip or clear the text filter.</span>
          <div className="keyword-examples">
            <button type="button" onClick={() => setStatusFilter("all")}>
              Show all
            </button>
          </div>
        </div>
      ) : (
        <div className="tracker-main-split">
          <div className="keyword-table-wrap tracker-table-wrap">
            <div className="tracker-table-scroll">
              <table className="keyword-table tracker-table">
                <thead>
                  <tr>
                    <th className="tracker-col-sticky">
                      <button type="button" onClick={() => toggleSort("keyword")}>
                        Keyword
                      </button>
                    </th>
                    <th className="tracker-col-optional">Notes</th>
                    <th>
                      <button
                        type="button"
                        onClick={() => toggleSort("opportunity")}
                      >
                        Opp. · Est.
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        onClick={() => toggleSort("popularity")}
                      >
                        Popularity
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        onClick={() => toggleSort("difficulty")}
                      >
                        Difficulty · Est.
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        onClick={() => toggleSort("position")}
                      >
                        Position
                      </button>
                    </th>
                    <th>Rank trend</th>
                    <th className="tracker-col-optional">Spark</th>
                    <th className="tracker-col-optional">Apps</th>
                    <th
                      className="tracker-col-optional"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort("lastUpdate")}
                      >
                        Updated
                      </button>
                    </th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((row) => {
                    const key = row.normalizedKeyword;
                    const isBusy = busyKeys.has(key);
                    const metrics = row.currentMetrics;
                    const snaps = snapshotsFor(
                      store,
                      app.appStoreId,
                      app.country,
                      key,
                      historyDays,
                    );
                    const previous =
                      snaps.length >= 2 ? snaps[snaps.length - 2] : undefined;
                    const trend = describeRankTrend(
                      previous,
                      metrics ? { position: metrics.position } : null,
                    );
                    const opp = opportunityScore(metrics);
                    const spark = positionSparklineValues(snaps, historyDays);
                    const lastUpdate = row.lastCheckedAt
                      ? new Date(row.lastCheckedAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—";
                    return (
                      <tr
                        key={keywordKey(app.appStoreId, app.country, key)}
                        className={selected === key ? "is-selected" : ""}
                        onClick={() => setSelected(key)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelected(key);
                          }
                        }}
                      >
                        <td className="tracker-col-sticky">
                          <strong className="keyword-name">{row.keyword}</strong>
                          <small className="tracker-row-store">
                            {row.country}
                          </small>
                        </td>
                        <td
                          className="tracker-col-optional"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            className="tracker-note-input"
                            value={row.note}
                            placeholder="Note…"
                            aria-label={`Note for ${row.keyword}`}
                            onChange={(event) => {
                              onStoreChange(
                                updateKeywordNote(
                                  store,
                                  app.appStoreId,
                                  app.country,
                                  key,
                                  event.target.value,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td>
                          {opp === null ? (
                            <em className="keyword-pending">—</em>
                          ) : (
                            <span
                              className="tracker-opp-score"
                              title="Estimated opportunity heuristic from public signals"
                            >
                              {opp}
                            </span>
                          )}
                        </td>
                        <td>
                          {isBusy && !metrics ? (
                            <em className="keyword-pending">Checking…</em>
                          ) : metrics && metrics.popularity > 0 ? (
                            <span className="metric-with-source">
                              <MetricBar
                                value={metrics.popularity}
                                tone="popularity"
                              />
                              <span
                                className={
                                  popularitySourceOf(metrics) === "official"
                                    ? "source-pill source-pill--official"
                                    : "source-pill"
                                }
                              >
                                {popularityShortLabel(popularitySourceOf(metrics))}
                              </span>
                            </span>
                          ) : (
                            <em className="keyword-pending">—</em>
                          )}
                        </td>
                        <td>
                          {metrics && metrics.difficulty > 0 ? (
                            <MetricBar
                              value={metrics.difficulty}
                              tone="difficulty"
                            />
                          ) : (
                            <em className="keyword-pending">—</em>
                          )}
                        </td>
                        <td>
                          <strong className="tracker-position">
                            {isBusy && !metrics
                              ? "…"
                              : formatPosition(
                                  metrics?.position ?? null,
                                  Boolean(
                                    metrics?.unavailable &&
                                      metrics.popularity === 0,
                                  ),
                                )}
                          </strong>
                        </td>
                        <td>
                          <span
                            className={`rank-trend rank-trend--${trend.kind}`}
                          >
                            {metrics?.unavailable && metrics.popularity === 0
                              ? "Unavailable"
                              : snaps.length < 2
                                ? "New"
                                : trend.label}
                          </span>
                        </td>
                        <td className="tracker-col-optional keyword-trend-cell">
                          {spark.length >= 2 ? (
                            <Sparkline values={spark} width={72} height={24} />
                          ) : (
                            <em className="keyword-pending">—</em>
                          )}
                        </td>
                        <td className="tracker-col-optional">
                          {metrics?.topApps ? (
                            <TopAppIcons apps={metrics.topApps} />
                          ) : (
                            <em className="keyword-pending">—</em>
                          )}
                        </td>
                        <td className="tracker-col-optional">
                          <small>{lastUpdate}</small>
                        </td>
                        <td
                          className="keyword-row-actions"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label={`Refresh ${row.keyword}`}
                            disabled={isBusy}
                            onClick={() => void refreshKeywords([row.keyword])}
                          >
                            {isBusy ? (
                              <Loader2
                                className="spin"
                                size={15}
                                aria-hidden="true"
                              />
                            ) : (
                              <RefreshCw size={15} aria-hidden="true" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="keyword-remove"
                            aria-label={`Delete ${row.keyword}`}
                            onClick={() =>
                              confirmDelete(row.normalizedKeyword, row.keyword)
                            }
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className="keyword-table-foot">
              <span>
                Browser-only storage. Position = observed iTunes Search rank
                (first 200). Popularity, difficulty, and opportunity are
                estimates.
              </span>
              <span>
                {filteredSorted.length}
                {filteredSorted.length !== keywords.length
                  ? ` of ${keywords.length}`
                  : ""}{" "}
                keyword
                {keywords.length === 1 ? "" : "s"} · {countryLabel}
              </span>
            </footer>
          </div>

          {selectedRow ? (
            <TrackerDetail
              app={app}
              keyword={selectedRow}
              snapshots={snapshotsFor(
                store,
                app.appStoreId,
                app.country,
                selectedRow.normalizedKeyword,
                historyDays,
              )}
              historyDays={historyDays}
              allKeywords={keywords}
              busy={busyKeys.has(selectedRow.normalizedKeyword)}
              onClose={() => setSelected(null)}
              onRefresh={() =>
                void refreshKeywords([selectedRow.keyword], {
                  openFirst: true,
                })
              }
              onDelete={() =>
                confirmDelete(
                  selectedRow.normalizedKeyword,
                  selectedRow.keyword,
                )
              }
            />
          ) : (
            <RankingOverview
              app={app}
              store={store}
              onSelectKeyword={setSelected}
            />
          )}
        </div>
      )}

      <AddKeywordsModal
        open={addKeywordsOpen}
        defaultCountry={app.country}
        existingNormalized={existingNormalized}
        onClose={() => setAddKeywordsOpen(false)}
        onConfirm={(list) => {
          const { store: next, added } = addKeywordsToStore(
            store,
            app.appStoreId,
            app.country,
            list,
          );
          onStoreChange(next);
          setAddKeywordsOpen(false);
          if (added.length > 0) {
            void refreshKeywords(added.map((row) => row.keyword));
          }
        }}
      />

      <SuggestionsModal
        open={suggestionsOpen}
        appName={app.name}
        suggestions={suggestions}
        onClose={() => setSuggestionsOpen(false)}
        onConfirm={(list) => {
          const { store: next, added } = addKeywordsToStore(
            store,
            app.appStoreId,
            app.country,
            list,
          );
          onStoreChange(next);
          setSuggestionsOpen(false);
          if (added.length > 0) {
            void refreshKeywords(added.map((row) => row.keyword));
          }
        }}
      />
    </div>
  );
}
