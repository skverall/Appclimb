"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckSquare,
  ChevronRight,
  Copy,
  Download,
  ListPlus,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Star,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";

import { useAccount } from "@/components/account-provider";
import { proEnabled } from "@/lib/flags";
import { trackAppEvent } from "@/lib/analytics-client";
import { notifySyncChange } from "@/lib/sync-client";
import { consumeDayUsage, EXPLORER_DAY_KEY, peekDayUsage, refundDayUsage } from "@/lib/usage";
import { useToast } from "@/components/toast";
import { AsoOptimizerModal } from "@/components/aso-optimizer-modal";
import { optimizeKeywordField } from "@/lib/aso-optimizer";
import {
  SUPPORTED_COUNTRIES,
  addKeywordToList,
  assessOpportunity,
  buildExplorerCsv,
  deleteRecord,
  estimateKeyword,
  exportExplorerBackup,
  loadKeywordList,
  loadRecord,
  recordSnapshot,
  removeKeywordFromList,
  restoreMetricsFromRecord,
  restoreExplorerBackup,
  runBatched,
  saveRecord,
  toLocalDate,
  type KeywordMetrics,
  type KeywordRecord,
  type OpportunityVerdict,
} from "@/lib/aso";
import {
  enrichMetricsWithOfficialPopularity,
  formatPopularity,
  popularityCaption,
  popularityShortLabel,
  popularitySourceOf,
} from "@/lib/popularity";
import { GENRE_LABELS, historyDelta } from "@/lib/search-terms";
import { fetchTermSuggestions, type SuggestedTerm } from "@/lib/terms-client";
import { downloadTextFile } from "@/lib/file";
import { Sparkline } from "@/components/keyword-charts";
import { KeywordDetail } from "@/components/keyword-detail";
import { BulkKeywordsModal } from "@/components/bulk-keywords-modal";
import { DeltaBadge, OpportunityPill } from "@/components/keyword-badges";
import { TrendingSearches } from "@/components/trending-searches";
import type { TrackedApp } from "@/lib/tracker";

const EXAMPLE_KEYWORDS = ["habit tracker", "meditation", "budget app", "photo editor"];

type SortKey = "keyword" | "popularity" | "difficulty" | "opportunity" | "trend" | "results";
type FilterTab = "all" | OpportunityVerdict;

const FILTERS: Array<{ id: FilterTab; label: string; hint: string }> = [
  { id: "all", label: "All", hint: "Every keyword in this list" },
  { id: "target", label: "Worth targeting", hint: "Apple shows demand and the first page is beatable" },
  { id: "longtail_win", label: "Long-tail wins", hint: "Low traffic, weak first page — easy ranks for newer apps" },
  { id: "competitive", label: "Competitive", hint: "Real demand, strong competitors" },
  { id: "dominated", label: "Dominated", hint: "Brand searches or entrenched first pages" },
  { id: "low_demand", label: "Low demand", hint: "Below Apple's top searches and already crowded" },
];

function MetricBar({ value, tone }: { value: number; tone: "popularity" | "difficulty" | "muted" }) {
  return (
    <span className={`metric-bar metric-bar--${tone}`} aria-hidden="true">
      <span className="metric-bar-track">
        <i style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
      </span>
    </span>
  );
}

type TrackAppInput = {
  appStoreId: string;
  name: string;
  iconUrl?: string;
  developer?: string;
  genre?: string;
  storeUrl: string;
};

export function KeywordExplorer({
  onTrackApp,
  trackTargets,
  isKeywordTracked,
  onTrackKeyword,
}: {
  onTrackApp?: (app: TrackAppInput) => void;
  /** The user's tracked apps; the one in the current storefront can adopt keywords. */
  trackTargets?: TrackedApp[];
  isKeywordTracked?: (app: TrackedApp, keyword: string) => boolean;
  onTrackKeyword?: (app: TrackedApp, keyword: string) => void;
} = {}) {
  const { showToast } = useToast();
  const [country, setCountry] = useState<string>("US");
  const [query, setQuery] = useState("");
  const [tableFilter, setTableFilter] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestedTerm[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [records, setRecords] = useState<Map<string, KeywordRecord>>(new Map());
  const [metrics, setMetrics] = useState<Map<string, KeywordMetrics>>(new Map());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const [trendingUnavailable, setTrendingUnavailable] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<{ total: number; failed: string[] } | null>(null);
  const [undoState, setUndoState] = useState<{
    keyword: string;
    metrics: KeywordMetrics | null;
    record: KeywordRecord | null;
  } | null>(null);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  const shareInitRef = useRef(false);
  const loadedCountryRef = useRef<string | null>(null);

  const { account, signedIn, accountsLive, loading, isPro, openAuth, openUpgrade, syncVersion } =
    useAccount();
  const explorerLimit =
    proEnabled() || accountsLive ? account.limits.explorerChecksPerDay : null;
  const historyDays = account.limits.historyDays;
  const historyWeeks = account.limits.historyWeeks;
  const isGuest = accountsLive && !signedIn && !loading;
  const usedToday = peekDayUsage(window.localStorage, EXPLORER_DAY_KEY);
  const limitHit = explorerLimit !== null && usedToday >= explorerLimit;

  const NUDGE_DISMISS_KEY = "appclimb:nudge:v1:dismissed";
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const isNudgeDismissed = () => {
    try {
      return window.localStorage.getItem(NUDGE_DISMISS_KEY) === "1";
    } catch {
      return true;
    }
  };

  useEffect(() => {
    if (limitHit && isGuest) {
      trackAppEvent("explorer_limit_hit", null, { oncePerDay: "default" });
    }
  }, [limitHit, isGuest]);

  const countryLabel =
    SUPPORTED_COUNTRIES.find((item) => item.code === country)?.label ?? country;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const list = loadKeywordList(window.localStorage, country);
      setKeywords(list);
      const nextRecords = new Map<string, KeywordRecord>();
      const nextMetrics = new Map<string, KeywordMetrics>();
      for (const keyword of list) {
        const record = loadRecord(window.localStorage, keyword, country);
        if (!record) continue;
        nextRecords.set(keyword, record);
        const restored = restoreMetricsFromRecord(record);
        if (restored) nextMetrics.set(keyword, restored);
      }
      setRecords(nextRecords);
      const sameCountry = loadedCountryRef.current === country;
      setMetrics((previous) => {
        if (!sameCountry) return nextMetrics;
        // Keep live results (top apps, related data) over the slimmer copy
        // rebuilt from storage when this is just a sync/restore reload.
        const merged = new Map(nextMetrics);
        for (const [keyword, live] of previous) {
          if (!live.restored && merged.has(keyword)) merged.set(keyword, live);
        }
        return merged;
      });
      // A sync/restore reload keeps the open keyword; a country switch closes it.
      if (loadedCountryRef.current !== country) {
        setSelected(null);
        setSelectedSet(new Set());
        setError(null);
      }
      loadedCountryRef.current = country;
    })();
    return () => {
      cancelled = true;
    };
  }, [country, refreshVersion, syncVersion]);

  const analyze = useCallback(
    async (
      keyword: string,
      options: {
        open?: boolean;
        reorder?: boolean;
        throwOnError?: boolean;
        country?: string;
      } = {},
    ) => {
      const clean = keyword.trim().replace(/\s+/gu, " ");
      const key = clean.toLocaleLowerCase();
      if (clean.length < 2 || busy.has(key)) return;
      const targetCountry = options.country ?? country;
      setSuggestionsOpen(false);

      const existingList = loadKeywordList(window.localStorage, targetCountry);
      const existingName = existingList.find((item) => item.toLocaleLowerCase() === key);
      const alreadyTracked = existingName !== undefined;
      const name = existingName ?? clean;
      let consumed = false;
      if (!alreadyTracked) {
        const gate = consumeDayUsage(window.localStorage, EXPLORER_DAY_KEY, explorerLimit);
        consumed = gate.consumed;
        // The limit banner explains what happened and offers Pro.
        if (!gate.allowed) return;
      }

      setBusy((previous) => new Set(previous).add(key));
      setError(null);
      if (!alreadyTracked) {
        setKeywords(addKeywordToList(window.localStorage, targetCountry, name));
        notifySyncChange("explorer");
      }
      if (options.open !== false) setSelected(name);
      try {
        const nextMetrics = await enrichMetricsWithOfficialPopularity(
          await estimateKeyword(name, targetCountry, { retryDelaysMs: [1500, 4000] }),
        );
        const record = recordSnapshot(window.localStorage, nextMetrics);
        if (options.reorder !== false) {
          setKeywords(addKeywordToList(window.localStorage, targetCountry, name));
          notifySyncChange("explorer");
        }
        setMetrics((previous) => new Map(previous).set(name, nextMetrics));
        setRecords((previous) => new Map(previous).set(name, record));
        trackAppEvent("keyword_analyzed_first", null, { onceEver: "default" });
        if (isGuest && !isNudgeDismissed()) {
          setNudgeVisible(true);
          trackAppEvent("account_nudge_shown", null, { onceEver: "default" });
        }
      } catch (caught) {
        if (!alreadyTracked) {
          setKeywords(removeKeywordFromList(window.localStorage, targetCountry, name));
          if (consumed) refundDayUsage(window.localStorage, EXPLORER_DAY_KEY);
          notifySyncChange("explorer");
          setSelected((current) => (current === name ? null : current));
        }
        if (options.throwOnError) throw caught;
        setError(
          `Could not analyze “${clean}”. The App Store may be rate-limiting requests — try again in a moment.`,
        );
      } finally {
        setBusy((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
      }
    },
    [busy, country, explorerLimit, isGuest],
  );

  const submitSearch = useCallback(
    (term: string) => {
      setQuery("");
      setSuggestions([]);
      setSuggestionsOpen(false);
      setActiveSuggestion(-1);
      void analyze(term);
    },
    [analyze],
  );

  useEffect(() => {
    if (shareInitRef.current) return;
    shareInitRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const sharedKeyword = params.get("kw")?.trim();
    if (!sharedKeyword) return;
    const requested = params.get("country")?.trim().toUpperCase() ?? "";
    const requestedCountry = SUPPORTED_COUNTRIES.some((item) => item.code === requested)
      ? requested
      : country;
    window.history.replaceState(null, "", window.location.pathname);
    // Runs once (guarded by the ref), so no cancellation: under StrictMode's
    // double effect a cleanup flag would swallow the only call.
    void Promise.resolve().then(() => {
      loadedCountryRef.current = requestedCountry;
      setCountry(requestedCountry);
      void analyze(sharedKeyword, { open: true, country: requestedCountry });
    });
  }, [country, analyze]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        Boolean(target?.isContentEditable);
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (isCmdK || (event.key === "/" && !typing)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (event.key === "Escape") {
        if (suggestionsOpen) setSuggestionsOpen(false);
        else if (!document.querySelector("[role=dialog]")) setSelected(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [suggestionsOpen]);

  // Autocomplete from Apple's published search terms.
  useEffect(() => {
    const term = query.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        if (term.length < 2) {
          setSuggestions([]);
          setSuggestionsOpen(false);
          return;
        }
        const found = await fetchTermSuggestions(country, term, controller.signal);
        if (controller.signal.aborted) return;
        setSuggestions(found);
        setActiveSuggestion(-1);
        setSuggestionsOpen(
          found.length > 0 && document.activeElement === searchRef.current,
        );
      })();
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, country]);

  useEffect(() => {
    if (!suggestionsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !searchFormRef.current?.contains(target)) setSuggestionsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [suggestionsOpen]);

  useEffect(() => {
    if (!undoState) return undefined;
    const frame = requestAnimationFrame(() => undoRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [undoState]);

  const refreshAll = useCallback(async () => {
    await runBatched(keywords, async (keyword) => {
      await analyze(keyword, { open: false, reorder: false });
    });
  }, [analyze, keywords]);

  const runBulk = useCallback(
    async (batch: string[]) => {
      setBulkOpen(false);
      setBatchResult(null);
      setBatchProgress({ done: 0, total: batch.length });
      let done = 0;
      const { failed } = await runBatched(batch, async (keyword) => {
        await analyze(keyword, { open: false, reorder: true, throwOnError: true });
        done += 1;
        setBatchProgress({ done, total: batch.length });
      });
      setBatchProgress(null);
      setBatchResult({ total: batch.length, failed });
    },
    [analyze],
  );

  const removeRow = useCallback(
    (keyword: string) => {
      setUndoState({
        keyword,
        metrics: metrics.get(keyword) ?? null,
        record: records.get(keyword) ?? null,
      });
      if (undoTimeoutRef.current !== null) window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = window.setTimeout(() => {
        if (undoRef.current === document.activeElement) searchRef.current?.focus();
        setUndoState(null);
        undoTimeoutRef.current = null;
      }, 6000);
      setKeywords(removeKeywordFromList(window.localStorage, country, keyword));
      deleteRecord(window.localStorage, keyword, country);
      notifySyncChange("explorer");
      setMetrics((previous) => {
        const next = new Map(previous);
        next.delete(keyword);
        return next;
      });
      setRecords((previous) => {
        const next = new Map(previous);
        next.delete(keyword);
        return next;
      });
      setSelected((current) => (current === keyword ? null : current));
      setSelectedSet((previous) => {
        const next = new Set(previous);
        next.delete(keyword);
        return next;
      });
    },
    [country, metrics, records],
  );

  const undoRemove = useCallback(() => {
    if (!undoState) return;
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    const { keyword, metrics: stashedMetrics, record: stashedRecord } = undoState;
    if (stashedRecord) saveRecord(window.localStorage, stashedRecord);
    setKeywords(addKeywordToList(window.localStorage, country, keyword));
    notifySyncChange("explorer");
    if (stashedMetrics) setMetrics((previous) => new Map(previous).set(keyword, stashedMetrics));
    if (stashedRecord) setRecords((previous) => new Map(previous).set(keyword, stashedRecord));
    setUndoState(null);
    searchRef.current?.focus();
  }, [undoState, country]);

  const exportCsv = useCallback(
    (customKeywords?: string[]) => {
      const targets = customKeywords ?? keywords;
      downloadTextFile(
        `appclimb-keywords-${country.toLowerCase()}.csv`,
        buildExplorerCsv(
          targets.map((keyword) => ({
            keyword,
            country,
            metrics: metrics.get(keyword) ?? null,
            record: records.get(keyword) ?? null,
          })),
        ),
      );
      showToast(`Exported ${targets.length} keywords to CSV`);
    },
    [keywords, metrics, records, country, showToast],
  );

  const backupJson = useCallback(() => {
    downloadTextFile(
      `appclimb-keyword-history-${toLocalDate()}.json`,
      exportExplorerBackup(window.localStorage),
      "application/json;charset=utf-8",
    );
    showToast("Downloaded a JSON backup of your keyword history");
  }, [showToast]);

  const handleRestoreFile = useCallback(async (file: File) => {
    const restored = restoreExplorerBackup(window.localStorage, await file.text());
    setRestoreMessage(
      restored > 0
        ? `Restored ${restored} keyword record${restored === 1 ? "" : "s"}.`
        : "No valid keyword records found in that file.",
    );
    setRefreshVersion((version) => version + 1);
    searchRef.current?.focus();
  }, []);

  const handleCopy100Ch = useCallback(
    async (targetKeywords: string[]) => {
      const optimized = optimizeKeywordField(targetKeywords, { stripSpaces: true });
      try {
        await navigator.clipboard?.writeText(optimized.optimized);
        showToast(`Copied a ${optimized.charCount}-character keyword field`);
      } catch {
        // Clipboard blocked; the optimizer modal offers a manual copy.
      }
    },
    [showToast],
  );

  const assessed = useMemo(() => {
    const map = new Map<string, ReturnType<typeof assessOpportunity>>();
    for (const keyword of keywords) {
      const metric = metrics.get(keyword);
      if (metric) map.set(keyword, assessOpportunity(metric));
    }
    return map;
  }, [keywords, metrics]);

  const trendOf = useCallback(
    (keyword: string) => {
      const history = metrics.get(keyword)?.popularityHistory ?? records.get(keyword)?.popularityHistory;
      return history ? historyDelta(history.slice(-historyWeeks), 4) : null;
    },
    [metrics, records, historyWeeks],
  );

  const counts = useMemo(() => {
    const out: Record<FilterTab, number> = {
      all: keywords.length,
      target: 0,
      longtail_win: 0,
      competitive: 0,
      dominated: 0,
      low_demand: 0,
    };
    let official = 0;
    for (const keyword of keywords) {
      const verdict = assessed.get(keyword)?.verdict;
      if (verdict) out[verdict] += 1;
      if (metrics.get(keyword)?.popularitySource === "official") official += 1;
    }
    return { ...out, official };
  }, [keywords, assessed, metrics]);

  const displayKeywords = useMemo(() => {
    let rows = keywords;
    const needle = tableFilter.trim().toLocaleLowerCase();
    if (needle) rows = rows.filter((keyword) => keyword.toLocaleLowerCase().includes(needle));
    if (filterTab !== "all") rows = rows.filter((keyword) => assessed.get(keyword)?.verdict === filterTab);
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const value = (keyword: string): number => {
      const metric = metrics.get(keyword);
      switch (sort.key) {
        case "popularity":
          return metric?.popularity ?? -1;
        case "difficulty":
          return metric?.difficulty ?? -1;
        case "opportunity":
          return assessed.get(keyword)?.score ?? -1;
        case "trend":
          return trendOf(keyword) ?? -1000;
        case "results":
          return metric?.results ?? -1;
        default:
          return 0;
      }
    };
    return [...rows].sort((left, right) =>
      sort.key === "keyword" ? dir * left.localeCompare(right) : dir * (value(left) - value(right)),
    );
  }, [keywords, tableFilter, filterTab, assessed, metrics, sort, trendOf]);

  const toggleSort = (key: SortKey) =>
    setSort((current) => {
      if (!current || current.key !== key) return { key, dir: key === "keyword" ? "asc" : "desc" };
      if (current.dir === (key === "keyword" ? "asc" : "desc")) {
        return { key, dir: key === "keyword" ? "desc" : "asc" };
      }
      return null;
    });

  const sortHeader = (key: SortKey, label: string, title?: string) => (
    <th
      aria-sort={
        sort?.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={`ex-th ex-th--${key}`}
    >
      <button type="button" onClick={() => toggleSort(key)} title={title}>
        {label}
        {sort?.key === key && <span aria-hidden="true">{sort.dir === "asc" ? " ▲" : " ▼"}</span>}
      </button>
    </th>
  );

  const allSelected = displayKeywords.length > 0 && selectedSet.size === displayKeywords.length;
  const toggleSelectAll = () =>
    setSelectedSet(allSelected ? new Set() : new Set(displayKeywords));
  const toggleSelectKeyword = (keyword: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedSet((previous) => {
      const next = new Set(previous);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });
  };

  const deleteSelectedKeywords = () => {
    if (selectedSet.size === 0) return;
    if (!window.confirm(`Delete ${selectedSet.size} selected keyword${selectedSet.size === 1 ? "" : "s"}?`)) {
      return;
    }
    const toDelete = Array.from(selectedSet);
    for (const keyword of toDelete) {
      removeKeywordFromList(window.localStorage, country, keyword);
      deleteRecord(window.localStorage, keyword, country);
    }
    setRefreshVersion((version) => version + 1);
    setSelectedSet(new Set());
    setSelected(null);
    notifySyncChange("explorer");
    showToast(`Removed ${toDelete.length} keywords`);
  };

  const selectedMetrics = selected ? metrics.get(selected) ?? null : null;
  const selectedRecord = selected ? records.get(selected) ?? null : null;
  const selectedBusy = selected ? busy.has(selected.toLocaleLowerCase()) : false;
  const hasList = keywords.length > 0;
  const trackTarget = trackTargets?.find((app) => app.country === country) ?? null;
  const remaining = explorerLimit !== null ? Math.max(0, explorerLimit - usedToday) : null;

  return (
    <main className={`tool-page ex${hasList ? " ex--has-list" : ""}`}>
      <section className="ex-hero marketing-container">
        {!hasList && (
          <>
            <span className="ex-eyebrow">
              <span className="ex-eyebrow-dot" aria-hidden="true" />
              Apple Ads popularity · updated weekly
            </span>
            <h1>Find App Store keywords you can actually rank for.</h1>
            <p className="ex-deck">
              Popularity straight from Apple, difficulty you can see the reasons for, and a
              plain verdict on every keyword. No sign-up to search.
            </p>
          </>
        )}

        <form
          className="ex-search"
          role="search"
          ref={searchFormRef}
          onSubmit={(event) => {
            event.preventDefault();
            const chosen =
              suggestionsOpen && activeSuggestion >= 0 ? suggestions[activeSuggestion]?.term : null;
            submitSearch(chosen ?? query);
          }}
        >
          <Search size={18} aria-hidden="true" className="ex-search-icon" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => {
              if (suggestions.length > 0 && query.trim().length >= 2) setSuggestionsOpen(true);
            }}
            onKeyDown={(event) => {
              if (!suggestionsOpen || suggestions.length === 0) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveSuggestion((index) => (index + 1) % suggestions.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveSuggestion((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
              }
            }}
            placeholder={hasList ? "Add a keyword…" : "Type a keyword, e.g. habit tracker"}
            maxLength={80}
            aria-label="Search keywords"
            role="combobox"
            aria-expanded={suggestionsOpen && suggestions.length > 0}
            aria-controls="keyword-suggestions"
            aria-activedescendant={
              activeSuggestion >= 0 ? `keyword-suggestion-${activeSuggestion}` : undefined
            }
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="ex-kbd" aria-hidden="true">
            ⌘K
          </kbd>
          <label className="ex-country" title={busy.size > 0 ? "Wait for the current analysis to finish" : "App Store country"}>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              aria-label="Store country"
              disabled={busy.size > 0}
            >
              {SUPPORTED_COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.code}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="ex-submit" disabled={query.trim().length < 2}>
            Analyze
          </button>
          {busy.size > 0 && <i className="ex-busy-line" aria-hidden="true" />}
          {suggestionsOpen && suggestions.length > 0 && (
            <div className="ex-suggestions" role="listbox" id="keyword-suggestions">
              <div className="ex-suggestions-head">Popular App Store searches</div>
              {suggestions.map((suggestion, index) => (
                <button
                  type="button"
                  role="option"
                  id={`keyword-suggestion-${index}`}
                  aria-selected={index === activeSuggestion}
                  className={index === activeSuggestion ? "is-active" : undefined}
                  key={`${suggestion.genre}:${suggestion.term}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => submitSearch(suggestion.term)}
                >
                  <Search size={13} aria-hidden="true" />
                  <span className="ex-suggestion-term">{suggestion.term}</span>
                  <small>{GENRE_LABELS[suggestion.genre]}</small>
                  <span className="ex-suggestion-pop" title="Apple Ads popularity">
                    {suggestion.popularity}
                  </span>
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="ex-meta">
          {!hasList && (
            <div className="ex-examples" aria-label="Example keywords">
              <span>Try</span>
              {EXAMPLE_KEYWORDS.map((keyword) => (
                <button
                  type="button"
                  key={keyword}
                  onClick={() => void analyze(keyword)}
                  disabled={busy.size > 0}
                >
                  {keyword}
                </button>
              ))}
            </div>
          )}
          <div className="ex-meta-right">
            {remaining !== null && (
              <span className={`ex-quota${remaining <= 2 ? " ex-quota--low" : ""}`}>
                {remaining} of {explorerLimit} free checks left today
              </span>
            )}
            <button type="button" className="ex-link" onClick={() => setBulkOpen(true)} disabled={busy.size > 0}>
              <ListPlus size={14} aria-hidden="true" />
              Analyze a list
            </button>
            <button type="button" className="ex-link" onClick={() => setOptimizerOpen(true)}>
              <Wand2 size={14} aria-hidden="true" />
              Keyword field builder
            </button>
          </div>
        </div>
      </section>

      <section className="ex-body marketing-container">
        {limitHit && (
          <div className="ex-banner ex-banner--limit" role="status">
            <Sparkles size={16} aria-hidden="true" />
            <span>
              You&apos;ve used today&apos;s <strong>{explorerLimit} free checks</strong>. They reset
              tomorrow — re-checking keywords already in your list is always free.
            </span>
            <button type="button" className="ex-btn ex-btn--primary" onClick={openUpgrade}>
              Unlimited with Pro
            </button>
          </div>
        )}

        {nudgeVisible && !limitHit && (
          <div className="ex-banner" role="status">
            <Star size={16} aria-hidden="true" />
            <span>
              <strong>Want to know where your app ranks for these?</strong> A free account tracks
              your app&apos;s position for 25 keywords and adds the ASO assistant.
            </span>
            <div className="ex-banner-actions">
              <button
                type="button"
                className="ex-btn ex-btn--primary"
                onClick={() => {
                  trackAppEvent("account_nudge_cta", null, { onceEver: "default" });
                  setNudgeVisible(false);
                  openAuth("track");
                }}
              >
                Create free account
              </button>
              <button
                type="button"
                className="ex-btn ex-btn--ghost"
                onClick={() => {
                  try {
                    window.localStorage.setItem(NUDGE_DISMISS_KEY, "1");
                  } catch {
                    // Ignore storage failures.
                  }
                  setNudgeVisible(false);
                }}
              >
                Not now
              </button>
            </div>
          </div>
        )}

        {batchProgress && (
          <div className="ex-banner ex-banner--info" role="status">
            <Loader2 className="spin" size={15} aria-hidden="true" />
            <span>
              Analyzing {batchProgress.done} of {batchProgress.total}…
            </span>
          </div>
        )}
        {batchResult && (
          <div className="ex-banner ex-banner--info" role="status">
            <span>
              {batchResult.failed.length === 0
                ? `Done — all ${batchResult.total} keywords analyzed.`
                : `Done — ${batchResult.failed.length} of ${batchResult.total} couldn’t be analyzed (the App Store may be rate-limiting). Try those again in a moment.`}
            </span>
            <button type="button" className="ex-btn ex-btn--ghost" onClick={() => setBatchResult(null)}>
              Dismiss
            </button>
          </div>
        )}
        {error && (
          <div className="ex-banner ex-banner--error" role="alert">
            {error}
          </div>
        )}
        {undoState && (
          <div className="ex-banner ex-banner--info" role="status">
            <span>Removed “{undoState.keyword}”</span>
            <button ref={undoRef} type="button" className="ex-btn ex-btn--ghost" onClick={undoRemove}>
              Undo
            </button>
          </div>
        )}
        {restoreMessage && (
          <div className="ex-banner ex-banner--info" role="status">
            <span>{restoreMessage}</span>
            <button type="button" className="ex-btn ex-btn--ghost" onClick={() => setRestoreMessage(null)}>
              Dismiss
            </button>
          </div>
        )}

        {!hasList ? (
          <>
            {!trendingUnavailable && (
              <TrendingSearches
                country={country}
                countryLabel={countryLabel}
                disabled={busy.size > 0}
                onAnalyze={(term) => void analyze(term)}
                onUnavailable={() => setTrendingUnavailable(true)}
              />
            )}
            <section className="ex-how" aria-labelledby="ex-how-title">
              <h2 id="ex-how-title">How to read the numbers</h2>
              <div className="ex-how-grid">
                <article>
                  <span className="ex-how-tag ex-how-tag--teal">Popularity</span>
                  <h3>Straight from Apple</h3>
                  <p>
                    Apple Ads publishes a 1–100 popularity score for the 500 most-searched terms in
                    each category, every week. Terms below that list are marked <b>long tail</b>{" "}
                    with the ceiling Apple implies. It&apos;s a relative score, not search volume.
                  </p>
                </article>
                <article>
                  <span className="ex-how-tag ex-how-tag--coral">Difficulty</span>
                  <h3>An estimate you can check</h3>
                  <p>
                    Built from the 10 apps ranking right now: their ratings, whether they target
                    the keyword in their name, and big-brand presence. Every score shows its
                    evidence.
                  </p>
                </article>
                <article>
                  <span className="ex-how-tag ex-how-tag--green">Verdict</span>
                  <h3>Should you go after it?</h3>
                  <p>
                    <b>Worth targeting</b>, <b>Long-tail win</b>, <b>Competitive</b>, or{" "}
                    <b>Dominated</b> — demand weighed against how beatable the first page is.
                  </p>
                </article>
              </div>
              <button
                type="button"
                className="ex-link ex-restore"
                onClick={() => restoreInputRef.current?.click()}
              >
                <Upload size={13} aria-hidden="true" />
                Restore a keyword backup
              </button>
            </section>
          </>
        ) : (
          <div className={`ex-split${selected ? " has-detail" : ""}`}>
            <div className="ex-list">
              <div className="ex-list-head">
                <div className="ex-list-title">
                  <h2>Your keywords</h2>
                  <span>
                    {keywords.length} in {countryLabel}
                    {counts.official > 0 ? ` · ${counts.official} with Apple popularity` : ""}
                  </span>
                </div>
                <div className="ex-list-tools">
                  <div className="ex-filter-input">
                    <Search size={13} aria-hidden="true" />
                    <input
                      value={tableFilter}
                      onChange={(event) => setTableFilter(event.target.value)}
                      placeholder="Filter…"
                      aria-label="Filter loaded keywords"
                    />
                    {tableFilter && (
                      <button type="button" onClick={() => setTableFilter("")} aria-label="Clear filter">
                        <X size={12} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ex-btn ex-btn--ghost"
                    onClick={() => void refreshAll()}
                    disabled={busy.size > 0}
                    title="Re-check every keyword (doesn't use free checks)"
                  >
                    <RefreshCw className={busy.size > 0 ? "spin" : ""} size={14} aria-hidden="true" />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="ex-filters" role="tablist" aria-label="Keyword filters">
                {FILTERS.filter((item) => item.id === "all" || counts[item.id] > 0 || filterTab === item.id).map(
                  (item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={filterTab === item.id}
                      className={`ex-filter ex-filter--${item.id}${filterTab === item.id ? " is-active" : ""}`}
                      onClick={() => setFilterTab(item.id)}
                      title={item.hint}
                    >
                      {item.label} <span>{counts[item.id]}</span>
                    </button>
                  ),
                )}
              </div>

              <div className="ex-table-scroll">
                <table className="ex-table">
                  <thead>
                    <tr>
                      <th className="ex-th ex-th--select">
                        <button
                          type="button"
                          className="ex-check"
                          onClick={toggleSelectAll}
                          aria-label={allSelected ? "Deselect all" : "Select all"}
                        >
                          {allSelected ? <CheckSquare size={15} /> : <Square size={15} />}
                        </button>
                      </th>
                      {sortHeader("keyword", "Keyword")}
                      {sortHeader("popularity", "Popularity", "Apple Ads popularity, 1–100")}
                      {sortHeader("trend", "12-wk trend", "Apple weekly popularity; change over 4 weeks")}
                      {sortHeader("difficulty", "Difficulty", "Estimated from today's top 10")}
                      {sortHeader("opportunity", "Verdict", "Demand weighed against difficulty")}
                      {sortHeader("results", "Apps", "Apps returned by App Store search (max 200)")}
                      <th aria-label="Actions" className="ex-th ex-th--actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayKeywords.map((keyword) => {
                      const metric = metrics.get(keyword);
                      const record = records.get(keyword);
                      const opportunity = assessed.get(keyword);
                      const isBusy = busy.has(keyword.toLocaleLowerCase());
                      const isChecked = selectedSet.has(keyword);
                      const source = metric ? popularitySourceOf(metric) : "estimated";
                      const weekly = (metric?.popularityHistory ?? record?.popularityHistory ?? [])
                        .slice(-12)
                        .map((point) => point.popularity);
                      const delta = trendOf(keyword);
                      return (
                        <tr
                          key={keyword}
                          className={`${selected === keyword ? "is-selected" : ""}${isChecked ? " is-checked" : ""}`}
                          onClick={() => setSelected(keyword)}
                        >
                          <td className="ex-td-select" onClick={(event) => toggleSelectKeyword(keyword, event)}>
                            <button
                              type="button"
                              className="ex-check"
                              aria-label={isChecked ? `Deselect ${keyword}` : `Select ${keyword}`}
                            >
                              {isChecked ? <CheckSquare size={15} /> : <Square size={15} />}
                            </button>
                          </td>
                          <td className="ex-td-keyword">
                            <strong>{keyword}</strong>
                            {isBusy && (
                              <span className="ex-busy-chip">
                                <Loader2 className="spin" size={11} aria-hidden="true" />
                                {metric ? "Re-checking" : "Analyzing"}
                              </span>
                            )}
                            {metric?.appleGenre && GENRE_LABELS[metric.appleGenre as keyof typeof GENRE_LABELS] && (
                              <small>{GENRE_LABELS[metric.appleGenre as keyof typeof GENRE_LABELS]}</small>
                            )}
                          </td>
                          <td className="ex-td-pop" data-label="Popularity">
                            {metric ? (
                              <span className="ex-pop" title={popularityCaption(source, metric.appleGenre)}>
                                <b className={source === "longtail" ? "is-muted" : undefined}>
                                  {formatPopularity(metric)}
                                </b>
                                <MetricBar value={metric.popularity} tone={source === "official" ? "popularity" : "muted"} />
                                <span className={`source-tag source-tag--${source}`}>
                                  {popularityShortLabel(source)}
                                </span>
                              </span>
                            ) : isBusy ? (
                              <span className="ex-skeleton" />
                            ) : (
                              <em className="ex-pending">—</em>
                            )}
                          </td>
                          <td className="ex-td-trend" data-label="Trend">
                            {weekly.length >= 2 ? (
                              <span className="ex-trend">
                                <Sparkline values={weekly} width={64} height={22} label="Apple popularity, weekly" />
                                <DeltaBadge delta={delta} />
                              </span>
                            ) : metric ? (
                              <em className="ex-pending" title="Apple publishes weekly history only for its top searches">
                                {source === "longtail" ? "n/a" : "—"}
                              </em>
                            ) : (
                              <em className="ex-pending">—</em>
                            )}
                          </td>
                          <td className="ex-td-diff" data-label="Difficulty">
                            {metric ? (
                              <span className="ex-diff">
                                <b>{metric.difficulty}</b>
                                <MetricBar value={metric.difficulty} tone="difficulty" />
                              </span>
                            ) : isBusy ? (
                              <span className="ex-skeleton" />
                            ) : (
                              <em className="ex-pending">—</em>
                            )}
                          </td>
                          <td className="ex-td-opp" data-label="Verdict">
                            {opportunity ? (
                              <OpportunityPill opportunity={opportunity} compact />
                            ) : isBusy ? (
                              <span className="ex-skeleton" />
                            ) : (
                              <em className="ex-pending">—</em>
                            )}
                          </td>
                          <td className="ex-td-results" data-label="Apps">
                            {metric && !(metric.restored && !record?.lastCheck) ? (
                              <span>{metric.saturated ? "200+" : metric.results}</span>
                            ) : (
                              <em className="ex-pending">—</em>
                            )}
                          </td>
                          <td className="ex-td-actions">
                            <button
                              type="button"
                              aria-label={`Open ${keyword}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelected(keyword);
                              }}
                            >
                              <ChevronRight size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${keyword}`}
                              className="ex-remove"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeRow(keyword);
                              }}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {displayKeywords.length === 0 && (
                      <tr>
                        <td colSpan={8}>
                          <em className="ex-pending">No keywords match this filter.</em>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {selectedSet.size > 0 && (
                <div className="ex-selection" role="toolbar" aria-label="Selection actions">
                  <span>
                    <strong>{selectedSet.size}</strong> selected
                  </span>
                  <div>
                    <button
                      type="button"
                      className="ex-btn ex-btn--primary"
                      onClick={() => void handleCopy100Ch(Array.from(selectedSet))}
                      title="Copy as an App Store Connect keyword field (100 characters)"
                    >
                      <Copy size={14} aria-hidden="true" />
                      Copy keyword field
                    </button>
                    <button type="button" className="ex-btn" onClick={() => setOptimizerOpen(true)}>
                      <Wand2 size={14} aria-hidden="true" />
                      Builder
                    </button>
                    <button type="button" className="ex-btn" onClick={() => exportCsv(Array.from(selectedSet))}>
                      <Download size={14} aria-hidden="true" />
                      CSV
                    </button>
                    <button type="button" className="ex-btn ex-btn--danger" onClick={deleteSelectedKeywords}>
                      <Trash2 size={14} aria-hidden="true" />
                      Delete
                    </button>
                    <button
                      type="button"
                      className="ex-icon-btn"
                      onClick={() => setSelectedSet(new Set())}
                      aria-label="Clear selection"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              <footer className="ex-foot">
                <div className="ex-foot-actions">
                  <button type="button" className="ex-btn ex-btn--ghost" onClick={() => exportCsv()}>
                    <Download size={14} aria-hidden="true" />
                    Export CSV
                  </button>
                  <button type="button" className="ex-btn ex-btn--ghost" onClick={backupJson}>
                    <Download size={14} aria-hidden="true" />
                    Backup
                  </button>
                  <button type="button" className="ex-btn ex-btn--ghost" onClick={() => restoreInputRef.current?.click()}>
                    <Upload size={14} aria-hidden="true" />
                    Restore
                  </button>
                </div>
                <span className="ex-foot-note">
                  {isPro
                    ? "Synced to your account."
                    : "Saved in this browser. One real snapshot per keyword per day — nothing is backfilled."}
                </span>
              </footer>
            </div>

            {selected && (
              <>
                <button
                  type="button"
                  className="ex-detail-backdrop"
                  aria-label="Close keyword detail"
                  onClick={() => setSelected(null)}
                />
                <div className="ex-detail">
                  <KeywordDetail
                    keyword={selected}
                    countryCode={country}
                    countryLabel={countryLabel}
                    metrics={selectedMetrics}
                    record={selectedRecord}
                    busy={selectedBusy}
                    historyDays={historyDays}
                    historyWeeks={historyWeeks}
                    canSeeFullHistory={isPro}
                    onUpgrade={openUpgrade}
                    onClose={() => setSelected(null)}
                    onRefresh={() => void analyze(selected, { open: true, reorder: false })}
                    onAnalyze={(keyword) => void analyze(keyword)}
                    onTrackApp={onTrackApp}
                    trackTarget={
                      trackTarget && onTrackKeyword
                        ? {
                            name: trackTarget.name,
                            iconUrl: trackTarget.iconUrl,
                            tracked: isKeywordTracked?.(trackTarget, selected) ?? false,
                            onTrack: () => {
                              onTrackKeyword(trackTarget, selected);
                              showToast(`Tracking “${selected}” for ${trackTarget.name}`);
                            },
                          }
                        : undefined
                    }
                  />
                </div>
              </>
            )}
          </div>
        )}

        <input
          ref={restoreInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          aria-label="Restore a keyword backup file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleRestoreFile(file);
            event.target.value = "";
          }}
        />

        <BulkKeywordsModal
          open={bulkOpen}
          countryLabel={countryLabel}
          onClose={() => setBulkOpen(false)}
          onConfirm={(batch) => void runBulk(batch)}
        />
        <AsoOptimizerModal
          open={optimizerOpen}
          initialKeywords={selectedSet.size > 0 ? Array.from(selectedSet) : keywords}
          onClose={() => setOptimizerOpen(false)}
        />
      </section>
    </main>
  );
}
