"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Compass,
  Crown,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Rows3,
  Rows4,
  Search,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";

import { AddKeywordsModal } from "@/components/add-keywords-modal";
import { RankingOverview } from "@/components/ranking-overview";
import { RankingsOverview, type OverviewTotals } from "@/components/tracker-overview";
import { TrackerMoreMenu } from "@/components/tracker-more-menu";
import { KeywordMap, type KeywordMapPoint } from "@/components/keyword-map";
import { SuggestionsModal } from "@/components/suggestions-modal";
import { TrackerDetail } from "@/components/tracker-detail";
import { Sparkline } from "@/components/keyword-charts";
import { useAccount } from "@/components/account-provider";
import { proEnabled } from "@/lib/flags";
import { SUPPORTED_COUNTRIES } from "@/lib/aso";
import { useToast } from "@/components/toast";
import { AsoOptimizerModal } from "@/components/aso-optimizer-modal";
import { optimizeKeywordField } from "@/lib/aso-optimizer";
import {
  enrichAnalysisResult,
  formatPopularity,
  popularityCaption,
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
  calculateAppHealthSummary,
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
  rankBucketSeries,
  rankMovers,
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
  { id: "out", label: "Not in top 200" },
  { id: "opportunity", label: "Opportunity" },
  { id: "new", label: "New" },
  { id: "unchecked", label: "Needs check" },
];

const STATUS_TITLES: Record<KeywordStatusFilter, string> = {
  all: "Every tracked keyword",
  ranked: "Your app appears in the first 200 search results",
  out: "Your app isn't in the first 200 results yet",
  new: "Added recently — not enough checks for a trend",
  unchecked: "Not checked yet, or the last check failed",
  opportunity: "Apple demand against difficulty, boosted when you're close to page one",
};

function MetricBar({
  value,
  tone,
  label,
}: {
  value: number;
  tone: "popularity" | "difficulty" | "muted";
  /** Text shown instead of the raw value (e.g. "≤48" for long tail). */
  label?: string;
}) {
  return (
    <span className={`metric-bar metric-bar--${tone}`} aria-hidden="true">
      <span className="metric-bar-track">
        <i style={{ width: `${value}%` }} />
      </span>
      <b>{label ?? value}</b>
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
  suspendAutoRefresh?: boolean;
  onTrackInStorefront?: (country: string) => void;
}) {
  const { showToast } = useToast();
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
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<
    Array<KeywordSuggestion & { alreadyTracked: boolean }>
  >([]);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const autoRefreshDone = useRef<string | null>(null);
  const storeRef = useRef(store);

  const { account, accountsLive } = useAccount();
  const limitsOn = proEnabled() || accountsLive;
  const keywordLimit = limitsOn ? account.limits.keywordsPerApp : null;

  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        Boolean(target?.isContentEditable)
      ) {
        return;
      }
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const keywords = useMemo(
    () => listKeywordsForApp(store, app.appStoreId, app.country),
    [store, app.appStoreId, app.country],
  );

  const health = useMemo(
    () => calculateAppHealthSummary(store, app.appStoreId, app.country),
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
        } else {
          showToast(`Checked rankings for ${targets.length} keywords`);
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
    [app.appStoreId, app.country, onStoreChange, showToast],
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
        row.note.toLocaleLowerCase().includes(needle) ||
        (row.tags ?? []).some((t) => t.toLowerCase().includes(needle))
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
    showToast(`Removed “${label}”`);
  };

  const bucketSeries = useMemo(
    () => rankBucketSeries(store, app.appStoreId, app.country, historyDays),
    [store, app.appStoreId, app.country, historyDays],
  );
  const movers = useMemo(
    () => rankMovers(store, app.appStoreId, app.country, historyDays),
    [store, app.appStoreId, app.country, historyDays],
  );
  const overviewTotals = useMemo<OverviewTotals>(() => {
    const totals: OverviewTotals = {
      tracked: keywords.length,
      top10: 0,
      top50: 0,
      top200: 0,
      outside: 0,
      unchecked: 0,
      averagePosition: health.averageRank,
      best: null,
    };
    for (const row of keywords) {
      const metrics = row.currentMetrics;
      if (!metrics || metrics.unavailable) {
        totals.unchecked += 1;
        continue;
      }
      const position = metrics.position;
      if (position === null || position > 200) {
        totals.outside += 1;
        continue;
      }
      if (position <= 10) totals.top10 += 1;
      else if (position <= 50) totals.top50 += 1;
      else totals.top200 += 1;
      if (!totals.best || position < totals.best.position) {
        totals.best = { keyword: row.keyword, normalizedKeyword: row.normalizedKeyword, position };
      }
    }
    return totals;
  }, [keywords, health.averageRank]);
  const mapPoints = useMemo<KeywordMapPoint[]>(
    () =>
      keywords.flatMap((row) => {
        const metrics = row.currentMetrics;
        if (!metrics || metrics.unavailable || metrics.popularity <= 0) return [];
        return [
          {
            keyword: row.keyword,
            normalizedKeyword: row.normalizedKeyword,
            popularity: metrics.popularity,
            longTail: metrics.popularitySource === "longtail",
            difficulty: metrics.difficulty,
            position: metrics.position,
          },
        ];
      }),
    [keywords],
  );
  const lastCheckedLabel = useMemo(() => {
    const latest = keywords.reduce<number>((max, row) => {
      const at = row.lastCheckedAt ? Date.parse(row.lastCheckedAt) : 0;
      return at > max ? at : max;
    }, 0);
    if (!latest) return null;
    const date = new Date(latest);
    const sameDay = date.toDateString() === new Date().toDateString();
    return sameDay
      ? `today ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
      : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }, [keywords]);

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
    showToast(`Exported ${keywords.length} tracked keywords to CSV`);
  };

  const copy100Ch = async () => {
    const optimized = optimizeKeywordField(keywords.map((k) => k.keyword), {
      appTitle: app.name,
      stripSpaces: true,
    });
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(optimized.optimized);
        showToast(`Copied ${optimized.charCount}ch ASO keyword string!`);
      }
    } catch {
      // Ignore clipboard write failures in non-secure context
    }
  };

  return (
    <div className={`tracker-view tracker-view--${density}`}>
      <header className="tv-head">
        <div className="tv-app">
          {app.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={app.iconUrl} alt="" width={52} height={52} className="tv-app-icon" />
          ) : (
            <span className="tv-app-icon tv-app-icon--fallback" aria-hidden="true">
              {app.name.charAt(0)}
            </span>
          )}
          <div className="tv-app-text">
            <h1>{app.name}</h1>
            <p className="tv-app-meta">
              <span className="tv-store">
                <span aria-hidden="true">
                  {SUPPORTED_COUNTRIES.find((c) => c.code === app.country)?.flag}
                </span>{" "}
                {countryLabel}
              </span>
              {app.genre && <span>{app.genre}</span>}
              {lastCheckedLabel && <span>Checked {lastCheckedLabel}</span>}
              {onTrackInStorefront && otherStorefronts.length > 0 && (
                <label className="tv-add-store" title="Track this app in another country storefront">
                  <Plus size={12} aria-hidden="true" />
                  <span>Another country</span>
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
            </p>
          </div>
        </div>
        <div className="tv-actions" role="toolbar" aria-label="Keyword actions">
          <button
            type="button"
            className="tv-btn"
            onClick={() => void refreshKeywords(keywords.map((row) => row.keyword))}
            disabled={keywords.length === 0 || busyKeys.size > 0}
            title="Re-check this app's position for every keyword"
          >
            <RefreshCw className={busyKeys.size > 0 ? "spin" : ""} size={15} aria-hidden="true" />
            Check ranks
          </button>
          <button
            type="button"
            className="tv-btn"
            onClick={() => void openSuggestions()}
            disabled={suggestionsBusy}
            title="Keyword ideas from your app's metadata and competitors"
          >
            {suggestionsBusy ? (
              <Loader2 className="spin" size={15} aria-hidden="true" />
            ) : (
              <Lightbulb size={15} aria-hidden="true" />
            )}
            Get suggestions
          </button>
          <button
            type="button"
            className="tv-btn tv-btn--primary"
            onClick={() => setAddKeywordsOpen(true)}
            title="Add keywords to track (or paste a list)"
          >
            <Plus size={15} aria-hidden="true" />
            Add keywords
          </button>
          <TrackerMoreMenu
            disabled={keywords.length === 0}
            onBuilder={() => setOptimizerOpen(true)}
            onCopy={() => void copy100Ch()}
            onExport={exportCsv}
          />
        </div>
      </header>

      {keywords.length > 0 && (
        <RankingsOverview
          totals={overviewTotals}
          series={bucketSeries}
          movers={movers}
          days={historyDays}
          onDaysChange={setHistoryDays}
          onSelectKeyword={setSelected}
        />
      )}

      {mapPoints.length >= 2 && <KeywordMap points={mapPoints} onSelect={setSelected} />}

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
        <div className="tv-controls">
          <div
            className="tracker-status-filters"
            role="tablist"
            aria-label="Keyword status filters"
          >
            {STATUS_FILTERS.filter(
              (item) =>
                item.id === "all" || statusCounts[item.id] > 0 || statusFilter === item.id,
            ).map((item) => (
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
                title={STATUS_TITLES[item.id]}
              >
                {item.label}
                <span>{statusCounts[item.id]}</span>
              </button>
            ))}
          </div>
          <div className="tv-controls-right">
            <label className="tracker-filter" title="Filter keywords by text or tags">
              <Search size={14} aria-hidden="true" />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter keywords or tags…"
                aria-label="Filter keywords"
              />
            </label>
            <button
              type="button"
              className="tv-icon-btn"
              aria-pressed={density === "compact"}
              aria-label={density === "compact" ? "Comfortable rows" : "Compact rows"}
              title={density === "compact" ? "Comfortable rows" : "Compact rows"}
              onClick={() => setDensity(density === "compact" ? "comfortable" : "compact")}
            >
              {density === "compact" ? (
                <Rows3 size={16} aria-hidden="true" />
              ) : (
                <Rows4 size={16} aria-hidden="true" />
              )}
            </button>
          </div>
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

      <div className="tracker-main-split">
        <div className="tracker-table-wrap">
          {keywords.length === 0 ? (
            <div className="tracker-empty">
              <Compass size={36} aria-hidden="true" />
              <h3>No keywords tracked yet</h3>
              <p>
                Add keywords to start tracking daily App Store rank snapshots,
                estimated popularity, and difficulty for <strong>{app.name}</strong>.
              </p>
              <div className="tracker-empty-actions">
                <button
                  type="button"
                  className="tracker-button-primary"
                  onClick={() => setAddKeywordsOpen(true)}
                  title="Add keywords to track"
                >
                  <Plus size={15} aria-hidden="true" />
                  Add Keywords
                </button>
                <button
                  type="button"
                  className="tracker-button-accent"
                  onClick={() => void openSuggestions()}
                  disabled={suggestionsBusy}
                  title="Get AI keyword suggestions"
                >
                  <Lightbulb size={15} aria-hidden="true" />
                  Get Suggestions
                </button>
              </div>
            </div>
          ) : filteredSorted.length === 0 ? (
            <div className="tracker-empty">
              <Search size={32} aria-hidden="true" />
              <h3>No keywords match this filter</h3>
              <p>Try clearing the search text or selecting the &quot;All&quot; filter tab.</p>
              <button
                type="button"
                className="refresh-all-button"
                onClick={() => {
                  setFilter("");
                  setStatusFilter("all");
                }}
              >
                Clear filter
              </button>
            </div>
          ) : (
            <>
              <div className="tracker-table-scroll">
              <table className="keyword-table tracker-table">
                <colgroup>
                  <col style={{ width: "auto", minWidth: 170 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 125 }} />
                  <col style={{ width: 125 }} />
                  <col style={{ width: 95 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 95 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 145 }} />
                  <col style={{ width: 145 }} />
                  <col style={{ width: 72 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="tracker-col-sticky tracker-col-keyword" title="Keyword phrase (click to sort by alphabetical order)">
                      <button type="button" onClick={() => toggleSort("keyword")}>
                        Keyword
                      </button>
                    </th>
                    <th title="Opportunity (0–100): Apple popularity weighed against difficulty, boosted when your app is close to page one">
                      <button
                        type="button"
                        onClick={() => toggleSort("opportunity")}
                      >
                        Opportunity
                      </button>
                    </th>
                    <th title="Apple Ads popularity (1–100); long-tail terms show the ceiling Apple implies">
                      <button
                        type="button"
                        onClick={() => toggleSort("popularity")}
                      >
                        Popularity
                      </button>
                    </th>
                    <th title="Estimated difficulty score (1–100) based on competitor strength in top results">
                      <button
                        type="button"
                        onClick={() => toggleSort("difficulty")}
                      >
                        Difficulty · Est.
                      </button>
                    </th>
                    <th title="Observed rank position in the App Store search results">
                      <button
                        type="button"
                        onClick={() => toggleSort("position")}
                      >
                        Position
                      </button>
                    </th>
                    <th title="Rank movement compared to previous day snapshot">Rank trend</th>
                    <th className="tracker-col-optional tracker-col-spark" title="7-day position trend mini-chart (top is #1)">Spark</th>
                    <th className="tracker-col-optional tracker-col-apps" title="Top 5 ranking competitor apps on Page 1">Apps</th>
                    <th
                      className="tracker-col-optional tracker-col-updated"
                      title="Timestamp of the most recent keyword check"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort("lastUpdate")}
                      >
                        Updated
                      </button>
                    </th>
                    <th className="tracker-col-optional tracker-col-notes" title="Private notes saved locally for this keyword">Notes</th>
                    <th className="tracker-col-actions" aria-label="Actions" />
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
                    const pos = metrics?.position;
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
                        <td className="tracker-col-sticky tracker-col-keyword">
                          <strong className="keyword-name">{row.keyword}</strong>
                          <small className="tracker-row-store">
                            {row.country}
                          </small>
                        </td>
                        <td>
                          {opp === null ? (
                            <em className="keyword-pending">—</em>
                          ) : (
                            <span
                              className="tracker-opp-score"
                              title="Estimated opportunity heuristic (0–100)"
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
                                tone={popularitySourceOf(metrics) === "official" ? "popularity" : "muted"}
                                label={formatPopularity(metrics)}
                              />
                              <span
                                className={`source-tag source-tag--${popularitySourceOf(metrics)}`}
                                title={popularityCaption(popularitySourceOf(metrics), metrics.appleGenre)}
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
                          <div className="tracker-position-cell">
                            {isBusy && !metrics ? (
                              <span className="tracker-position">…</span>
                            ) : pos === 1 ? (
                              <span className="tracker-position tracker-pos-badge tracker-pos-badge--crown" title="Ranked #1 on the App Store!">
                                <Crown size={12} aria-hidden="true" /> #1
                              </span>
                            ) : pos && pos <= 3 ? (
                              <span className="tracker-position tracker-pos-badge tracker-pos-badge--top3" title="Top 3 rank on the App Store">
                                <Rocket size={12} aria-hidden="true" /> #{pos}
                              </span>
                            ) : pos && pos <= 10 ? (
                              <span className="tracker-position tracker-pos-badge tracker-pos-badge--top10" title="Top 10 Page 1 rank">
                                <Sparkles size={11} aria-hidden="true" /> #{pos}
                              </span>
                            ) : pos && pos <= 50 ? (
                              <span className="tracker-position tracker-pos-badge tracker-pos-badge--top50">
                                <Target size={11} aria-hidden="true" /> #{pos}
                              </span>
                            ) : (
                              <strong className="tracker-position">
                                {formatPosition(
                                  metrics?.position ?? null,
                                  Boolean(
                                    metrics?.unavailable &&
                                      metrics.popularity === 0,
                                  ),
                                )}
                              </strong>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`rank-trend rank-trend--${trend.kind}`}
                            title={`Rank movement: ${trend.label}`}
                          >
                            {metrics?.unavailable && metrics.popularity === 0
                              ? "Unavailable"
                              : snaps.length < 2
                                ? "New"
                                : trend.label}
                          </span>
                        </td>
                        <td className="tracker-col-optional tracker-col-spark keyword-trend-cell">
                          {spark.length >= 2 ? (
                            <Sparkline values={spark} width={72} height={24} />
                          ) : (
                            <em className="keyword-pending">—</em>
                          )}
                        </td>
                        <td className="tracker-col-optional tracker-col-apps">
                          {metrics?.topApps ? (
                            <TopAppIcons apps={metrics.topApps} />
                          ) : (
                            <em className="keyword-pending">—</em>
                          )}
                        </td>
                        <td className="tracker-col-optional tracker-col-updated">
                          <span className="tracker-updated-time">{lastUpdate}</span>
                        </td>
                        <td
                          className="tracker-col-optional tracker-col-notes"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            className="tracker-note-input"
                            value={row.note}
                            placeholder="Add note…"
                            aria-label={`Note for ${row.keyword}`}
                            title={`Edit note for "${row.keyword}"`}
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
                        <td
                          className="keyword-row-actions tracker-col-actions"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label={`Refresh ${row.keyword}`}
                            title={`Refresh rankings and estimates for "${row.keyword}"`}
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
                            title={`Remove "${row.keyword}" from tracker`}
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
                  {filteredSorted.length === 0 && (
                    <tr>
                      <td colSpan={11} className="keyword-empty-cell">
                        <em className="keyword-pending">
                          No keywords match this filter. Try clearing your search or switching filters.
                        </em>
                      </td>
                    </tr>
                  )}
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
          </>
          )}
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
              historyWeeks={account.limits.historyWeeks}
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

      <AddKeywordsModal
        open={addKeywordsOpen}
        defaultCountry={app.country}
        existingNormalized={existingNormalized}
        onClose={() => setAddKeywordsOpen(false)}
        onConfirm={(list) => {
          const { store: next, added, capped } = addKeywordsToStore(
            store,
            app.appStoreId,
            app.country,
            list,
            keywordLimit,
          );
          onStoreChange(next);
          setAddKeywordsOpen(false);
          if (added.length > 0) {
            void refreshKeywords(added.map((row) => row.keyword)).then(() => {
              if (capped) {
                setError(
                  `Free plan tracks up to ${keywordLimit} keywords per app. Upgrade to Pro for unlimited keywords.`,
                );
              }
            });
          } else if (capped) {
            setError(
              `Free plan tracks up to ${keywordLimit} keywords per app. Upgrade to Pro for unlimited keywords.`,
            );
          }
        }}
      />

      <SuggestionsModal
        open={suggestionsOpen}
        appName={app.name}
        suggestions={suggestions}
        onClose={() => setSuggestionsOpen(false)}
        onConfirm={(list) => {
          const { store: next, added, capped } = addKeywordsToStore(
            store,
            app.appStoreId,
            app.country,
            list,
            keywordLimit,
          );
          onStoreChange(next);
          setSuggestionsOpen(false);
          if (added.length > 0) {
            void refreshKeywords(added.map((row) => row.keyword)).then(() => {
              if (capped) {
                setError(
                  `Free plan tracks up to ${keywordLimit} keywords per app. Upgrade to Pro for unlimited keywords.`,
                );
              }
            });
          } else if (capped) {
            setError(
              `Free plan tracks up to ${keywordLimit} keywords per app. Upgrade to Pro for unlimited keywords.`,
            );
          }
        }}
      />

      <AsoOptimizerModal
        open={optimizerOpen}
        initialKeywords={keywords.map((k) => k.keyword)}
        appTitle={app.name}
        onClose={() => setOptimizerOpen(false)}
      />
    </div>
  );
}
