"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Download,
  ListPlus,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { useAccount } from "@/components/account-provider";
import { proEnabled } from "@/lib/flags";
import { notifySyncChange } from "@/lib/sync-client";
import { consumeDayUsage, EXPLORER_DAY_KEY, peekDayUsage, refundDayUsage } from "@/lib/usage";

import {
  SUPPORTED_COUNTRIES,
  addKeywordToList,
  buildExplorerCsv,
  deleteRecord,
  estimateKeyword,
  exportExplorerBackup,
  isGoldenKeyword,
  loadKeywordList,
  loadRecord,
  recordSnapshot,
  recentHistory,
  removeKeywordFromList,
  restoreMetricsFromRecord,
  restoreExplorerBackup,
  runBatched,
  saveRecord,
  suggestKeywords,
  toLocalDate,
  trendDelta,
  type KeywordMetrics,
  type KeywordRecord,
} from "@/lib/aso";
import {
  enrichMetricsWithOfficialPopularity,
  popularityShortLabel,
  popularitySourceOf,
} from "@/lib/popularity";
import { downloadTextFile } from "@/lib/file";
import { searchAppStoreCatalog } from "@/lib/itunes";
import { Sparkline } from "@/components/keyword-charts";
import { KeywordDetail } from "@/components/keyword-detail";
import { BulkKeywordsModal } from "@/components/bulk-keywords-modal";

function MetricBar({
  value,
  tone,
}: {
  value: number;
  tone: "popularity" | "difficulty";
}) {
  return (
    <span className={`metric-bar metric-bar--${tone}`} aria-hidden="true">
      <span className="metric-bar-track">
        <i style={{ width: `${value}%` }} />
      </span>
      <b>{value}</b>
    </span>
  );
}

const EXAMPLE_KEYWORDS = ["meditation", "habit tracker", "invoice scanner"];

type SortKey = "keyword" | "popularity" | "difficulty" | "results" | "trend";

export function KeywordExplorer() {
  const [country, setCountry] = useState<string>("US");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [records, setRecords] = useState<Map<string, KeywordRecord>>(new Map());
  const [metrics, setMetrics] = useState<Map<string, KeywordMetrics>>(
    new Map(),
  );
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sort, setSort] = useState<{
    key: SortKey;
    dir: "asc" | "desc";
  } | null>(null);
  const [goldenOnly, setGoldenOnly] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [batchResult, setBatchResult] = useState<{
    total: number;
    failed: string[];
  } | null>(null);
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

  const { account, signedIn, accountsLive, loading, openAuth, openUpgrade, syncVersion } =
    useAccount();
  const explorerLimit =
    proEnabled() || accountsLive ? account.limits.explorerChecksPerDay : null;
  // Plan history window for trend charts (30 free / 90 Pro).
  const historyDays = account.limits.historyDays;
  const isGuest = accountsLive && !signedIn && !loading;
  // Derived from the day counter rather than a sticky flag: the limit banner
  // must clear automatically when the day rolls over (or the plan lifts the
  // cap) instead of lingering until the next successful check.
  const limitHit =
    explorerLimit !== null &&
    peekDayUsage(window.localStorage, EXPLORER_DAY_KEY) >= explorerLimit;

  const countryLabel =
    SUPPORTED_COUNTRIES.find((item) => item.code === country)?.label ?? country;

  /* Rehydrate persisted rows whenever the country changes (or after a
     restore). The read is deferred out of the effect body so state updates
     happen in the async callback, not synchronously during render commit. */
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
      setMetrics(nextMetrics);
      setSelected(null);
      setError(null);
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
        /** Explicit storefront for share links (before country state settles). */
        country?: string;
        /**
         * Clear the search box after the run. Defaults to true for direct
         * searches; background runs (refresh all, bulk, detail refresh) pass
         * false so the user's typing is never wiped mid-queue.
         */
        clearInput?: boolean;
      } = {},
    ) => {
      const clean = keyword.trim();
      const key = clean.toLocaleLowerCase();
      if (!clean || busy.has(key)) return;
      const targetCountry = options.country ?? country;

      // Daily check cap (free tier). Only a keyword not already in the list
      // consumes a check; refreshing tracked keywords stays free.
      const alreadyTracked = loadKeywordList(
        window.localStorage,
        targetCountry,
      ).some((item) => item.toLocaleLowerCase() === key);
      let consumed = false;
      if (!alreadyTracked) {
        const gate = consumeDayUsage(
          window.localStorage,
          EXPLORER_DAY_KEY,
          explorerLimit,
        );
        consumed = gate.consumed;
        // The limit banner is derived from the day counter, so a blocked
        // attempt needs no state of its own.
        if (!gate.allowed) return;
      }

      setBusy((previous) => new Set(previous).add(key));
      setError(null);
      // Show the row immediately: the keyword lands in the table as a
      // shimmering "Analyzing" row and fills in when the data arrives.
      if (!alreadyTracked) {
        setKeywords(
          addKeywordToList(window.localStorage, targetCountry, clean),
        );
        notifySyncChange("explorer");
      }
      try {
        const nextMetrics = await enrichMetricsWithOfficialPopularity(
          await estimateKeyword(clean, targetCountry),
        );
        const record = recordSnapshot(window.localStorage, nextMetrics);
        if (options.reorder !== false) {
          setKeywords(
            addKeywordToList(window.localStorage, targetCountry, clean),
          );
          notifySyncChange("explorer");
        }
        setMetrics((previous) => new Map(previous).set(clean, nextMetrics));
        setRecords((previous) => new Map(previous).set(clean, record));
        if (options.open !== false) setSelected(clean);
      } catch (error) {
        // A failed first check leaves no half-empty row behind and refunds the
        // daily-check unit it consumed — a failed attempt is not a check.
        if (!alreadyTracked) {
          setKeywords(
            removeKeywordFromList(window.localStorage, targetCountry, clean),
          );
          if (consumed) {
            refundDayUsage(window.localStorage, EXPLORER_DAY_KEY);
          }
          notifySyncChange("explorer");
        }
        if (options.throwOnError) throw error;
        setError(
          `Could not analyze “${clean}”. The App Store may be rate-limiting requests — try again in a moment.`,
        );
      } finally {
        setBusy((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
        if (options.clearInput !== false) {
          setQuery("");
        }
        setSuggestionsOpen(false);
      }
    },
    [busy, country, explorerLimit],
  );

  /* Shareable deep link: ?kw=meditation&country=DE analyzes on load, then the
     URL is cleaned so a refresh does not re-analyze. Runs once on mount; the
     deferred async body matches the rehydrate pattern and avoids synchronous
     setState inside the effect. */
  useEffect(() => {
    if (shareInitRef.current) return;
    shareInitRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const sharedKeyword = params.get("kw")?.trim();
    if (!sharedKeyword) return;
    const requested = params.get("country")?.trim().toUpperCase() ?? "";
    const requestedCountry = SUPPORTED_COUNTRIES.some(
      (item) => item.code === requested,
    )
      ? requested
      : country;
    window.history.replaceState(null, "", window.location.pathname);
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setCountry(requestedCountry);
      // Explicit country so the analysis is not racing the country rehydrate.
      void analyze(sharedKeyword, { open: true, country: requestedCountry });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Refresh all with bounded concurrency and a small gap between starts so a
     large list does not trip iTunes rate limits. */
  const refreshAll = useCallback(async () => {
    await runBatched(keywords, async (keyword) => {
      await analyze(keyword, {
        open: false,
        reorder: false,
        clearInput: false,
      });
    });
  }, [analyze, keywords]);

  /* Bulk: analyze a pasted list with bounded concurrency; failures are
     collected and reported in a summary banner instead of stopping the run. */
  const runBulk = useCallback(
    async (batch: string[]) => {
      setBulkOpen(false);
      setBatchResult(null);
      setBatchProgress({ done: 0, total: batch.length });
      const { failed } = await runBatched(batch, async (keyword, index) => {
        await analyze(keyword, {
          open: false,
          reorder: true,
          throwOnError: true,
          clearInput: false,
        });
        setBatchProgress({ done: index + 1, total: batch.length });
      });
      setBatchProgress(null);
      setBatchResult({ total: batch.length, failed });
    },
    [analyze],
  );

  const removeRow = useCallback(
    (keyword: string) => {
      // Stash the row for undo before deleting anything from storage.
      setUndoState({
        keyword,
        metrics: metrics.get(keyword) ?? null,
        record: records.get(keyword) ?? null,
      });
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current);
      }
      undoTimeoutRef.current = window.setTimeout(() => {
        // The bar disappears on its own; keep focus from dropping to <body>.
        if (undoRef.current === document.activeElement) {
          searchRef.current?.focus();
        }
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
    },
    [country, metrics, records],
  );

  const undoRemove = useCallback(() => {
    if (!undoState) return;
    if (undoTimeoutRef.current !== null) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    const {
      keyword,
      metrics: stashedMetrics,
      record: stashedRecord,
    } = undoState;
    if (stashedRecord) {
      saveRecord(window.localStorage, stashedRecord);
    }
    setKeywords(addKeywordToList(window.localStorage, country, keyword));
    notifySyncChange("explorer");
    if (stashedMetrics) {
      setMetrics((previous) => new Map(previous).set(keyword, stashedMetrics));
    }
    if (stashedRecord) {
      setRecords((previous) => new Map(previous).set(keyword, stashedRecord));
    }
    setUndoState(null);
    // Keyboard users removed the row and restored it; land focus back on the
    // primary input instead of leaving it on a button that just unmounted.
    searchRef.current?.focus();
  }, [undoState, country]);

  const exportCsv = useCallback(() => {
    const rows = keywords.map((keyword) => ({
      keyword,
      country,
      metrics: metrics.get(keyword) ?? null,
      record: records.get(keyword) ?? null,
    }));
    downloadTextFile(
      `appclimb-keywords-${country.toLowerCase()}.csv`,
      buildExplorerCsv(rows),
    );
  }, [keywords, metrics, records, country]);

  const backupJson = useCallback(() => {
    downloadTextFile(
      `appclimb-keyword-history-${toLocalDate()}.json`,
      exportExplorerBackup(window.localStorage),
      "application/json;charset=utf-8",
    );
  }, []);

  const handleRestoreFile = useCallback(async (file: File) => {
    const text = await file.text();
    const restored = restoreExplorerBackup(window.localStorage, text);
    setRestoreMessage(
      restored > 0
        ? `Restored ${restored} keyword record${restored === 1 ? "" : "s"}.`
        : "No valid keyword records found in that file.",
    );
    setRefreshVersion((version) => version + 1);
  }, []);

  /* Global shortcuts: "/" focuses the search box, Escape closes the detail
     panel. Skipped while typing in a form control. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        Boolean(target?.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "Escape") {
        setSuggestionsOpen(false);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Debounced live suggestions while typing. All state updates run inside the
     debounce callback, never synchronously in the effect body. */
  useEffect(() => {
    const term = query.trim();
    const timer = window.setTimeout(() => {
      void (async () => {
        if (term.length < 2) {
          setSuggestions([]);
          setSuggestionsOpen(false);
          return;
        }
        try {
          const apps = await searchAppStoreCatalog(term, country);
          setSuggestions(suggestKeywords(term, apps));
          setSuggestionsOpen(true);
        } catch {
          setSuggestions([]);
          setSuggestionsOpen(false);
        }
      })();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, country]);

  /* A pointer-down anywhere outside the search form dismisses the open
     suggestions dropdown (same affordance as Escape). */
  useEffect(() => {
    if (!suggestionsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && !searchFormRef.current?.contains(target)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [suggestionsOpen]);

  /* Move focus to the Undo action when a row is removed, so keyboard users
     can restore with one keystroke instead of dropping to <body>. */
  useEffect(() => {
    if (!undoState) return undefined;
    const frame = requestAnimationFrame(() => undoRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [undoState]);

  const goldenCount = useMemo(
    () =>
      keywords.filter((keyword) => {
        const metric = metrics.get(keyword);
        return metric ? isGoldenKeyword(metric) : false;
      }).length,
    [keywords, metrics],
  );

  const displayKeywords = useMemo(() => {
    let rows = keywords;
    if (goldenOnly) {
      rows = keywords.filter((keyword) => {
        const metric = metrics.get(keyword);
        return metric ? isGoldenKeyword(metric) : false;
      });
    }
    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const trendValue = (keyword: string): number => {
      const record = records.get(keyword);
      if (!record || record.history.length < 2) return -1_000_000;
      return trendDelta(record.history) ?? -1_000_000;
    };
    return [...rows].sort((left, right) => {
      switch (sort.key) {
        case "keyword":
          return dir * left.localeCompare(right);
        case "popularity":
          return (
            dir *
            ((metrics.get(left)?.popularity ?? -1) -
              (metrics.get(right)?.popularity ?? -1))
          );
        case "difficulty":
          return (
            dir *
            ((metrics.get(left)?.difficulty ?? -1) -
              (metrics.get(right)?.difficulty ?? -1))
          );
        case "results":
          return (
            dir *
            ((metrics.get(left)?.results ?? -1) -
              (metrics.get(right)?.results ?? -1))
          );
        case "trend":
          return dir * (trendValue(left) - trendValue(right));
      }
    });
  }, [keywords, goldenOnly, metrics, records, sort]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, dir: key === "keyword" ? "asc" : "desc" };
      }
      if (current.dir === "asc") return { key, dir: "desc" };
      return null; // third click returns to insertion order
    });
  }, []);

  const selectedMetrics = selected ? metrics.get(selected) : null;
  const selectedRecord = selected ? records.get(selected) : null;
  const selectedBusy = selected
    ? busy.has(selected.toLocaleLowerCase())
    : false;

  return (
    <main className="tool-page">
      <section className="keyword-hero marketing-container">
        <span className="marketing-eyebrow keyword-hero-eyebrow">
          Official Apple Ads data
        </span>
        <h1>Popularity from Apple. Not a black box.</h1>
        <p className="keyword-hero-deck">
          Type a keyword to see Apple&apos;s official Ads popularity (1–100) and
          an estimated difficulty — every score labeled with its source.
        </p>
        {isGuest && (
          <p className="guest-access-banner" role="status">
            <span>
              You&apos;re using AppClimb as a <strong>guest</strong>. Search is
              open
              {explorerLimit !== null ? ` — ${explorerLimit} checks/day` : ""}.
              Sign in free to track an app or use the assistant.
            </span>
            <button
              type="button"
              className="tracker-button-secondary"
              onClick={() => openAuth("default")}
            >
              Sign in
            </button>
          </p>
        )}
      </section>

      <section className="keyword-tool marketing-container">
        <form
          className="keyword-search-form"
          role="search"
          ref={searchFormRef}
          onSubmit={(event) => {
            event.preventDefault();
            void analyze(query);
          }}
        >
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a keyword, e.g. “meditation”"
            maxLength={80}
            aria-label="Search keywords"
            role="combobox"
            aria-expanded={suggestionsOpen && suggestions.length > 0}
            aria-controls="keyword-suggestions"
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <label
            className="keyword-country-chip"
            title={
              busy.size > 0
                ? "Wait for the current analysis to finish"
                : "App Store country"
            }
          >
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
          <button
            type="submit"
            disabled={query.trim().length < 2 || busy.size > 0}
          >
            {busy.size > 0 ? (
              <Loader2 className="spin" size={16} aria-hidden="true" />
            ) : (
              "Analyze"
            )}
          </button>
          {busy.size > 0 && (
            <i className="keyword-busy-line" aria-hidden="true" />
          )}
          {suggestionsOpen && suggestions.length > 0 && (
            <div
              className="keyword-suggestions"
              role="listbox"
              id="keyword-suggestions"
            >
              {suggestions.map((suggestion) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  key={suggestion}
                  onClick={() => void analyze(suggestion)}
                >
                  <Search size={13} aria-hidden="true" />
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </form>

        <div className="keyword-meta-row">
          <div className="keyword-examples" aria-label="Example keywords">
            <span>Try:</span>
            {EXAMPLE_KEYWORDS.map((example) => (
              <button
                type="button"
                key={example}
                onClick={() => void analyze(example)}
                disabled={busy.size > 0}
              >
                {example}
              </button>
            ))}
          </div>
          <div className="keyword-meta-right">
            {!limitHit &&
              explorerLimit !== null &&
              peekDayUsage(window.localStorage, EXPLORER_DAY_KEY) > 0 && (
                <span className="explorer-checks-remaining">
                  {Math.max(
                    0,
                    explorerLimit -
                      peekDayUsage(window.localStorage, EXPLORER_DAY_KEY),
                  )}{" "}
                  of {explorerLimit} free checks left today
                </span>
              )}
            <button
              type="button"
              className="keyword-meta-link"
              onClick={() => setBulkOpen(true)}
              disabled={busy.size > 0}
            >
              <ListPlus size={14} aria-hidden="true" />
              Analyze list
            </button>
          </div>
        </div>

        {limitHit && (
          <div className="explorer-limit-banner" role="status">
            <Sparkles size={16} aria-hidden="true" />
            <span>
              You&apos;ve used your{" "}
              <strong>{explorerLimit} free keyword checks</strong> for today.
              Upgrade to Pro for unlimited checks, sync, and 90-day history.
            </span>
            <button
              type="button"
              className="tracker-button-primary"
              onClick={openUpgrade}
            >
              Upgrade to Pro
            </button>
          </div>
        )}

        {batchProgress && (
          <div className="keyword-batch-banner" role="status">
            <Loader2 className="spin" size={15} aria-hidden="true" />
            <span>
              Analyzing {batchProgress.done} of {batchProgress.total}…
            </span>
          </div>
        )}

        {batchResult && (
          <div
            className="keyword-batch-banner keyword-batch-banner--done"
            role="status"
          >
            <span>
              {batchResult.failed.length === 0
                ? `Done — all ${batchResult.total} keywords analyzed.`
                : `Done — ${batchResult.failed.length} of ${batchResult.total} couldn’t be analyzed (the App Store may be rate-limiting).`}
            </span>
            <button type="button" onClick={() => setBatchResult(null)}>
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="keyword-error" role="alert">
            {error}
          </div>
        )}

        {undoState && (
          <div className="keyword-undo-bar" role="status">
            <span>Removed “{undoState.keyword}”</span>
            <button ref={undoRef} type="button" onClick={undoRemove}>
              Undo
            </button>
          </div>
        )}

        {restoreMessage && (
          <div className="keyword-undo-bar" role="status">
            <span>{restoreMessage}</span>
            <button type="button" onClick={() => setRestoreMessage(null)}>
              Dismiss
            </button>
          </div>
        )}

        {keywords.length === 0 ? (
          <div className="keyword-empty-slim">
            <span>No keywords yet — try an example or paste a list.</span>
            <button
              type="button"
              className="keyword-empty-restore"
              onClick={() => restoreInputRef.current?.click()}
            >
              <Upload size={13} aria-hidden="true" />
              Restore a backup
            </button>
          </div>
        ) : (
          <div className={`explorer-split${selected ? " has-detail" : ""}`}>
            <div className="keyword-table-wrap">
              <div className="keyword-table-topbar">
                <div
                  className="keyword-status-filters"
                  role="tablist"
                  aria-label="Keyword filters"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!goldenOnly}
                    className={
                      !goldenOnly
                        ? "keyword-status-chip is-active"
                        : "keyword-status-chip"
                    }
                    onClick={() => setGoldenOnly(false)}
                  >
                    All <span>{keywords.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={goldenOnly}
                    className={
                      goldenOnly
                        ? "keyword-status-chip is-active"
                        : "keyword-status-chip"
                    }
                    onClick={() => setGoldenOnly(true)}
                  >
                    Golden <span>{goldenCount}</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="refresh-all-button keyword-topbar-refresh"
                  onClick={() => void refreshAll()}
                  disabled={keywords.length === 0 || busy.size > 0}
                >
                  <RefreshCw
                    className={busy.size > 0 ? "spin" : ""}
                    size={15}
                    aria-hidden="true"
                  />
                  Refresh all
                </button>
              </div>
              {goldenOnly && (
                <p className="keyword-heuristic-note">
                  “Golden” means popularity ≥ 55 and estimated difficulty ≤ 40 —
                  terms with solid demand and a low barrier, worth fighting for.
                </p>
              )}
              <div className="keyword-table-scroll">
                <table className="keyword-table">
                  <thead>
                    <tr>
                      <th
                        aria-sort={
                          sort?.key === "keyword"
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort("keyword")}
                        >
                          Keyword
                          {sort?.key === "keyword" &&
                            (sort.dir === "asc" ? " ▲" : " ▼")}
                        </button>
                      </th>
                      <th
                        aria-sort={
                          sort?.key === "popularity"
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort("popularity")}
                        >
                          Popularity
                          {sort?.key === "popularity" &&
                            (sort.dir === "asc" ? " ▲" : " ▼")}
                        </button>
                      </th>
                      <th
                        aria-sort={
                          sort?.key === "difficulty"
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort("difficulty")}
                        >
                          Difficulty
                          {sort?.key === "difficulty" &&
                            (sort.dir === "asc" ? " ▲" : " ▼")}
                        </button>
                      </th>
                      <th
                        aria-sort={
                          sort?.key === "trend"
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort("trend")}
                        >
                          Trend
                          {sort?.key === "trend" &&
                            (sort.dir === "asc" ? " ▲" : " ▼")}
                        </button>
                      </th>
                      <th
                        aria-sort={
                          sort?.key === "results"
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort("results")}
                        >
                          Results
                          {sort?.key === "results" &&
                            (sort.dir === "asc" ? " ▲" : " ▼")}
                        </button>
                      </th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayKeywords.map((keyword) => {
                      const record = records.get(keyword);
                      const metric = metrics.get(keyword);
                      const history = record
                        ? recentHistory(record, historyDays).map(
                            (point) => point.popularity,
                          )
                        : [];
                      const delta = record ? trendDelta(record.history) : null;
                      const isBusy = busy.has(keyword.toLocaleLowerCase());
                      return (
                        <tr
                          key={keyword}
                          className={selected === keyword ? "is-selected" : ""}
                          onClick={() => setSelected(keyword)}
                        >
                          <td>
                            <span className="keyword-name-row">
                              <strong className="keyword-name">
                                {keyword}
                              </strong>
                              {isBusy && (
                                <span className="keyword-busy-chip">
                                  <Loader2
                                    className="spin"
                                    size={11}
                                    aria-hidden="true"
                                  />
                                  {metric ? "Re-checking" : "Analyzing"}
                                </span>
                              )}
                              {metric && isGoldenKeyword(metric) && (
                                <span className="keyword-golden-badge">
                                  Golden
                                </span>
                              )}
                            </span>
                            <small>{countryLabel}</small>
                          </td>
                          <td>
                            {metric ? (
                              <span className="metric-with-source">
                                <MetricBar
                                  value={metric.popularity}
                                  tone="popularity"
                                />
                                <span
                                  className={
                                    popularitySourceOf(metric) === "official"
                                      ? "source-pill source-pill--official"
                                      : "source-pill"
                                  }
                                  title={
                                    popularitySourceOf(metric) === "official"
                                      ? "Official Apple Ads data"
                                      : "Estimated from iTunes"
                                  }
                                >
                                  {popularityShortLabel(
                                    popularitySourceOf(metric),
                                  )}
                                  <span className="sr-only">
                                    {popularitySourceOf(metric) === "official"
                                      ? "Apple Ads"
                                      : "Estimated"}
                                  </span>
                                </span>
                              </span>
                            ) : isBusy ? (
                              <span className="metric-skeleton">
                                <i className="skeleton-bar" />
                                <i className="skeleton-pill" />
                              </span>
                            ) : (
                              <em className="keyword-pending">Pending</em>
                            )}
                          </td>
                          <td>
                            {metric ? (
                              <MetricBar
                                value={metric.difficulty}
                                tone="difficulty"
                              />
                            ) : isBusy ? (
                              <span className="metric-skeleton">
                                <i className="skeleton-bar" />
                              </span>
                            ) : (
                              <em className="keyword-pending">—</em>
                            )}
                          </td>
                          <td className="keyword-trend-cell">
                            {record ? (
                              <>
                                <Sparkline values={history} />
                                {delta !== null && delta !== 0 && (
                                  <span
                                    className={
                                      delta > 0 ? "trend-up" : "trend-down"
                                    }
                                  >
                                    {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
                                  </span>
                                )}
                              </>
                            ) : isBusy ? (
                              <span className="metric-skeleton">
                                <i className="skeleton-spark" />
                              </span>
                            ) : (
                              <em className="keyword-pending">—</em>
                            )}
                          </td>
                          <td className="keyword-results-cell">
                            {metric &&
                            !(
                              metric.restored &&
                              record &&
                              !record.lastCheck
                            ) ? (
                              <span>
                                <b>{metric.results}</b>
                                <small>
                                  {metric.saturated ? "200+ found" : "apps"}
                                </small>
                              </span>
                            ) : metric && isBusy ? (
                              <span className="metric-skeleton">
                                <i className="skeleton-num" />
                              </span>
                            ) : (
                              <em className="keyword-pending">—</em>
                            )}
                          </td>
                          <td className="keyword-row-actions">
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
                              className="keyword-remove"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeRow(keyword);
                              }}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {displayKeywords.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <em className="keyword-pending">
                            No keywords match this filter yet — analyze more
                            terms or switch the filter.
                          </em>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <footer className="keyword-table-foot">
                <div className="keyword-table-actions">
                  <button
                    type="button"
                    className="refresh-all-button"
                    onClick={exportCsv}
                    disabled={keywords.length === 0}
                  >
                    <Download size={14} aria-hidden="true" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    className="refresh-all-button"
                    onClick={backupJson}
                    disabled={keywords.length === 0}
                  >
                    <Download size={14} aria-hidden="true" />
                    Backup
                  </button>
                  <button
                    type="button"
                    className="refresh-all-button"
                    onClick={() => restoreInputRef.current?.click()}
                  >
                    <Upload size={14} aria-hidden="true" />
                    Restore
                  </button>
                </div>
                <div className="keyword-table-foot-meta">
                  <span>
                    Saved in your browser — history grows with one snapshot per
                    day per keyword.
                  </span>
                  <span>
                    {keywords.length} keyword{keywords.length === 1 ? "" : "s"}{" "}
                    · {countryLabel}
                  </span>
                </div>
              </footer>
            </div>

            {selected && (
              <KeywordDetail
                keyword={selected}
                countryCode={country}
                countryLabel={countryLabel}
                metrics={selectedMetrics ?? null}
                record={selectedRecord ?? null}
                busy={selectedBusy}
                historyDays={historyDays}
                onClose={() => setSelected(null)}
                onRefresh={() =>
                  void analyze(selected, {
                    open: true,
                    reorder: false,
                    clearInput: false,
                  })
                }
                onAnalyze={(keyword) => void analyze(keyword)}
              />
            )}
          </div>
        )}

        {/* Shared restore picker: rendered in both empty and table states so a
            wiped list can always be recovered from a backup. */}
        <input
          ref={restoreInputRef}
          type="file"
          accept=".json,application/json"
          hidden
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
          onConfirm={(keywords) => void runBulk(keywords)}
        />
      </section>
    </main>
  );
}
