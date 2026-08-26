"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckSquare,
  ChevronRight,
  Copy,
  Download,
  ListPlus,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Target,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";

import { useAccount } from "@/components/account-provider";
import { proEnabled } from "@/lib/flags";
import { notifySyncChange } from "@/lib/sync-client";
import { consumeDayUsage, EXPLORER_DAY_KEY, peekDayUsage, refundDayUsage } from "@/lib/usage";
import { useToast } from "@/components/toast";
import { AsoOptimizerModal } from "@/components/aso-optimizer-modal";
import { optimizeKeywordField } from "@/lib/aso-optimizer";

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

const EXAMPLE_KEYWORDS = [
  { keyword: "meditation", label: "meditation", emoji: "🧘" },
  { keyword: "habit tracker", label: "habit tracker", emoji: "✅" },
  { keyword: "invoice scanner", label: "invoice scanner", emoji: "🧾" },
  { keyword: "podcast player", label: "podcast player", emoji: "🎙️" },
  { keyword: "pomodoro timer", label: "pomodoro timer", emoji: "⏱️" },
  { keyword: "budget planner", label: "budget planner", emoji: "💰" },
];

interface ShowcaseSample {
  keyword: string;
  category: string;
  popularity: number;
  popularityLabel: string;
  difficulty: number;
  difficultyTone: "low" | "mid" | "high";
  difficultyLabel: string;
  results: number;
  isGolden: boolean;
  topAppName: string;
  topAppDev: string;
  topAppIcon: string;
  sparkline: number[];
}

const SHOWCASE_SAMPLES: ShowcaseSample[] = [
  {
    keyword: "meditation",
    category: "Health & Fitness",
    popularity: 68,
    popularityLabel: "Official Apple Ads",
    difficulty: 34,
    difficultyTone: "low",
    difficultyLabel: "Low barrier",
    results: 184,
    isGolden: false,
    topAppName: "Headspace: Sleep & Meditation",
    topAppDev: "Headspace Inc.",
    topAppIcon: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/9c/e6/73/9ce673b0-7389-cf7a-3be3-0b04c86e09e1/AppIcon-0-0-1x_U007emarketing-0-7-0-85-220.png/100x100bb.png",
    sparkline: [62, 64, 65, 68, 67, 68, 68],
  },
  {
    keyword: "invoice scanner",
    category: "Business",
    popularity: 48,
    popularityLabel: "Official Apple Ads",
    difficulty: 22,
    difficultyTone: "low",
    difficultyLabel: "Achievable",
    results: 52,
    isGolden: true,
    topAppName: "Invoice Simple: Receipt Maker",
    topAppDev: "Invoice Simple",
    topAppIcon: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/28/7f/ee/287fee56-9721-39bb-a2f0-7b24cfd83bc7/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/100x100bb.png",
    sparkline: [44, 45, 46, 47, 48, 48, 48],
  },
  {
    keyword: "habit tracker",
    category: "Productivity",
    popularity: 56,
    popularityLabel: "Official Apple Ads",
    difficulty: 38,
    difficultyTone: "mid",
    difficultyLabel: "Moderate",
    results: 142,
    isGolden: false,
    topAppName: "Streaks - Daily Habit Tracker",
    topAppDev: "Crunchy Bagel Pty Ltd",
    topAppIcon: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/64/00/cb/6400cbf7-0cf1-3ce1-2d7c-88e9323c3482/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/100x100bb.png",
    sparkline: [52, 53, 55, 54, 56, 56, 56],
  },
  {
    keyword: "podcast player",
    category: "Entertainment",
    popularity: 51,
    popularityLabel: "Official Apple Ads",
    difficulty: 32,
    difficultyTone: "low",
    difficultyLabel: "Low barrier",
    results: 98,
    isGolden: true,
    topAppName: "Overcast: Podcast Player",
    topAppDev: "Overcast Radio, LLC",
    topAppIcon: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/f4/38/54/f438541c-bce0-681b-fb2d-05701c456ba1/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/100x100bb.png",
    sparkline: [48, 49, 50, 50, 51, 51, 51],
  },
];

type SortKey = "keyword" | "popularity" | "difficulty" | "results" | "trend";
type ExplorerFilterTab = "all" | "golden" | "official" | "high_demand" | "low_diff";

export function KeywordExplorer() {
  const { showToast } = useToast();
  const [country, setCountry] = useState<string>("US");
  const [query, setQuery] = useState("");
  const [tableFilter, setTableFilter] = useState("");
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
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{
    key: SortKey;
    dir: "asc" | "desc";
  } | null>(null);
  const [filterTab, setFilterTab] = useState<ExplorerFilterTab>("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [optimizerOpen, setOptimizerOpen] = useState(false);
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
  const historyDays = account.limits.historyDays;
  const isGuest = accountsLive && !signedIn && !loading;
  const limitHit =
    explorerLimit !== null &&
    peekDayUsage(window.localStorage, EXPLORER_DAY_KEY) >= explorerLimit;

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
      setMetrics(nextMetrics);
      setSelected(null);
      setSelectedSet(new Set());
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
        country?: string;
        clearInput?: boolean;
      } = {},
    ) => {
      const clean = keyword.trim();
      const key = clean.toLocaleLowerCase();
      if (!clean || busy.has(key)) return;
      const targetCountry = options.country ?? country;

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
        if (!gate.allowed) return;
      }

      setBusy((previous) => new Set(previous).add(key));
      setError(null);
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
          setQuery((current) => (current.trim() === clean ? "" : current));
        }
        setSuggestionsOpen(false);
      }
    },
    [busy, country, explorerLimit],
  );

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
      void analyze(sharedKeyword, { open: true, country: requestedCountry });
    })();
    return () => {
      cancelled = true;
    };
  }, [country, analyze]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;

      const activeTag = document.activeElement?.tagName;
      const isInput =
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "SELECT" ||
        Boolean((document.activeElement as HTMLElement)?.isContentEditable);

      if (isCmdK || (isSlash && !isInput)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const refreshAll = useCallback(async () => {
    await runBatched(keywords, async (keyword) => {
      await analyze(keyword, {
        open: false,
        reorder: false,
        clearInput: false,
      });
    });
  }, [analyze, keywords]);

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
      setUndoState({
        keyword,
        metrics: metrics.get(keyword) ?? null,
        record: records.get(keyword) ?? null,
      });
      if (undoTimeoutRef.current !== null) {
        window.clearTimeout(undoTimeoutRef.current);
      }
      undoTimeoutRef.current = window.setTimeout(() => {
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
      setSelectedSet((prev) => {
        const next = new Set(prev);
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
    searchRef.current?.focus();
  }, [undoState, country]);

  const exportCsv = useCallback(
    (customKeywords?: string[]) => {
      const targets = customKeywords ?? keywords;
      const rows = targets.map((keyword) => ({
        keyword,
        country,
        metrics: metrics.get(keyword) ?? null,
        record: records.get(keyword) ?? null,
      }));
      downloadTextFile(
        `appclimb-keywords-${country.toLowerCase()}.csv`,
        buildExplorerCsv(rows),
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
    showToast("Downloaded complete JSON history backup");
  }, [showToast]);

  const handleRestoreFile = useCallback(async (file: File) => {
    const text = await file.text();
    const restored = restoreExplorerBackup(window.localStorage, text);
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
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(optimized.optimized);
          showToast(`Copied ${optimized.charCount}ch ASO keyword field!`);
        }
      } catch {
        // Ignore clipboard failure
      }
    },
    [showToast],
  );

  const counts = useMemo(() => {
    let golden = 0;
    let official = 0;
    let highDemand = 0;
    let lowDiff = 0;

    for (const kw of keywords) {
      const m = metrics.get(kw);
      if (!m) continue;
      if (isGoldenKeyword(m)) golden++;
      if (popularitySourceOf(m) === "official") official++;
      if (m.popularity >= 50) highDemand++;
      if (m.difficulty <= 35) lowDiff++;
    }

    return {
      all: keywords.length,
      golden,
      official,
      high_demand: highDemand,
      low_diff: lowDiff,
    };
  }, [keywords, metrics]);

  const avgMetrics = useMemo(() => {
    let popSum = 0;
    let diffSum = 0;
    let count = 0;
    for (const kw of keywords) {
      const m = metrics.get(kw);
      if (!m) continue;
      popSum += m.popularity;
      diffSum += m.difficulty;
      count++;
    }
    if (count === 0) return null;
    return {
      avgPop: Math.round(popSum / count),
      avgDiff: Math.round(diffSum / count),
    };
  }, [keywords, metrics]);

  const displayKeywords = useMemo(() => {
    let rows = keywords;

    // Instant table text filter
    if (tableFilter.trim()) {
      const needle = tableFilter.trim().toLowerCase();
      rows = rows.filter((kw) => kw.toLowerCase().includes(needle));
    }

    // Filter tab
    if (filterTab === "golden") {
      rows = rows.filter((kw) => {
        const m = metrics.get(kw);
        return m ? isGoldenKeyword(m) : false;
      });
    } else if (filterTab === "official") {
      rows = rows.filter((kw) => {
        const m = metrics.get(kw);
        return m ? popularitySourceOf(m) === "official" : false;
      });
    } else if (filterTab === "high_demand") {
      rows = rows.filter((kw) => {
        const m = metrics.get(kw);
        return m ? m.popularity >= 50 : false;
      });
    } else if (filterTab === "low_diff") {
      rows = rows.filter((kw) => {
        const m = metrics.get(kw);
        return m ? m.difficulty <= 35 : false;
      });
    }

    if (!sort) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    const getTrend = (kw: string) => {
      const rec = records.get(kw);
      if (!rec || rec.history.length < 2) return -1_000_000;
      return trendDelta(rec.history) ?? -1_000_000;
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
          return dir * (getTrend(left) - getTrend(right));
      }
    });
  }, [keywords, tableFilter, filterTab, metrics, records, sort]);

  const toggleSelectAll = () => {
    if (selectedSet.size === displayKeywords.length) {
      setSelectedSet(new Set());
    } else {
      setSelectedSet(new Set(displayKeywords));
    }
  };

  const toggleSelectKeyword = (keyword: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) {
        next.delete(keyword);
      } else {
        next.add(keyword);
      }
      return next;
    });
  };

  const deleteSelectedKeywords = () => {
    if (selectedSet.size === 0) return;
    if (
      !window.confirm(
        `Delete ${selectedSet.size} selected keyword${selectedSet.size === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    const toDelete = Array.from(selectedSet);
    for (const kw of toDelete) {
      removeKeywordFromList(window.localStorage, country, kw);
      deleteRecord(window.localStorage, kw, country);
    }
    setRefreshVersion((v) => v + 1);
    setSelectedSet(new Set());
    setSelected(null);
    notifySyncChange("explorer");
    showToast(`Removed ${toDelete.length} keywords`);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        Boolean(target?.isContentEditable);
      if ((event.key === "/" || (event.key === "k" && (event.metaKey || event.ctrlKey))) && !typing) {
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

  useEffect(() => {
    if (!undoState) return undefined;
    const frame = requestAnimationFrame(() => undoRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [undoState]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, dir: key === "keyword" ? "asc" : "desc" };
      }
      if (current.dir === "asc") return { key, dir: "desc" };
      return null;
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
          <div className="guest-access-banner" role="status">
            <span className="guest-access-dot" aria-hidden="true" />
            <span className="guest-access-text">
              You&apos;re using AppClimb as a <strong>guest</strong>. Search is
              open
              {explorerLimit !== null ? ` — ${explorerLimit} checks/day` : ""}.
              Sign in free to track an app or use the assistant.
            </span>
            <button
              type="button"
              className="guest-access-link"
              onClick={() => openAuth("default")}
            >
              Sign in
            </button>
          </div>
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
            placeholder="Search a keyword, e.g. meditation"
            maxLength={80}
            aria-label="Search keywords"
            role="combobox"
            aria-expanded={suggestionsOpen && suggestions.length > 0}
            aria-controls="keyword-suggestions"
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="keyword-search-kbd" title="Press ⌘K or / to search" aria-hidden="true">
            ⌘K
          </kbd>
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
            <span className="keyword-examples-label">Try:</span>
            {EXAMPLE_KEYWORDS.map((item) => (
              <button
                type="button"
                key={item.keyword}
                className="keyword-example-chip"
                onClick={() => void analyze(item.keyword)}
                disabled={busy.size > 0}
              >
                <span className="keyword-chip-icon" aria-hidden="true">
                  {item.emoji}
                </span>
                <span>{item.label}</span>
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
              className="keyword-meta-link keyword-meta-link--primary"
              onClick={() => setOptimizerOpen(true)}
              title="Optimize App Store 100-character keyword field"
            >
              <Wand2 size={14} aria-hidden="true" />
              100ch Optimizer
            </button>
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
                : `Done — ${batchResult.failed.length} of ${batchResult.total} couldn’t be analyzed (the App Store may be rate-limiting). Existing data was kept — wait a moment and analyze them again.`}
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
          <section className="explorer-showcase" aria-label="Live ASO preview">
            <div className="showcase-header">
              <div className="showcase-header-copy">
                <span className="showcase-badge">
                  <Sparkles size={13} aria-hidden="true" />
                  Live Product Showcase
                </span>
                <h2>See How AppClimb Evaluates App Store Keywords</h2>
                <p>
                  Explore real App Store keyword metrics below. Click any sample card to inspect live scores,
                  competitor app density, and 30-day trends — or run a live search above.
                </p>
              </div>
              <div className="showcase-header-actions">
                <button
                  type="button"
                  className="tracker-button-secondary showcase-sample-btn"
                  onClick={() =>
                    void runBulk(["meditation", "habit tracker", "invoice scanner"])
                  }
                  disabled={busy.size > 0}
                >
                  <Play size={14} aria-hidden="true" />
                  Try 3 sample keywords
                </button>
              </div>
            </div>

            <div className="showcase-grid">
              {SHOWCASE_SAMPLES.map((sample) => (
                <div
                  key={sample.keyword}
                  className={`showcase-card ${sample.isGolden ? "is-golden" : ""}`}
                  onClick={() => void analyze(sample.keyword)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void analyze(sample.keyword);
                    }
                  }}
                >
                  <div className="showcase-card-top">
                    <div className="showcase-card-title-wrap">
                      <span className="showcase-card-category">{sample.category}</span>
                      <h3 className="showcase-card-keyword">{sample.keyword}</h3>
                    </div>
                    {sample.isGolden && (
                      <span className="keyword-golden-badge" title="High demand & achievable difficulty">
                        ⭐ Golden
                      </span>
                    )}
                  </div>

                  <div className="showcase-metrics-row">
                    <div className="showcase-metric-box">
                      <span className="showcase-metric-label">Popularity</span>
                      <div className="showcase-metric-val">
                        <strong>{sample.popularity}</strong>
                        <small>/100</small>
                      </div>
                      <span className="showcase-metric-source">
                        <span className="source-dot source-dot--official" aria-hidden="true" />
                        {sample.popularityLabel}
                      </span>
                    </div>

                    <div className="showcase-metric-box">
                      <span className="showcase-metric-label">Difficulty</span>
                      <div className="showcase-metric-val">
                        <strong>{sample.difficulty}</strong>
                        <small>/100</small>
                      </div>
                      <span className={`showcase-difficulty-tag is-${sample.difficultyTone}`}>
                        {sample.difficultyLabel}
                      </span>
                    </div>

                    <div className="showcase-metric-box">
                      <span className="showcase-metric-label">App Results</span>
                      <div className="showcase-metric-val">
                        <strong>{sample.results}</strong>
                        <small>apps</small>
                      </div>
                      <span className="showcase-metric-source">App Store ({country})</span>
                    </div>
                  </div>

                  <div className="showcase-app-preview">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sample.topAppIcon}
                      alt=""
                      width={32}
                      height={32}
                      className="showcase-app-icon"
                      loading="lazy"
                    />
                    <div className="showcase-app-info">
                      <span className="showcase-app-rank">#1 Ranking App</span>
                      <span className="showcase-app-name">{sample.topAppName}</span>
                    </div>
                    <span className="showcase-card-cta">
                      Analyze Live <ArrowRight size={13} aria-hidden="true" />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Feature Value Props */}
            <div className="showcase-pillars-grid">
              <div className="showcase-pillar-card">
                <div className="pillar-icon pillar-icon--teal">
                  <Target size={18} aria-hidden="true" />
                </div>
                <h4>Official Apple Ads Popularity</h4>
                <p>
                  1–100 relative popularity direct from Apple Ads API. Never an unexplained third-party estimate.
                </p>
              </div>

              <div className="showcase-pillar-card">
                <div className="pillar-icon pillar-icon--amber">
                  <ShieldCheck size={18} aria-hidden="true" />
                </div>
                <h4>Real App Store Difficulty</h4>
                <p>
                  Calculated from live competitor ratings, title match strength, and catalog density in real time.
                </p>
              </div>

              <div className="showcase-pillar-card">
                <div className="pillar-icon pillar-icon--green">
                  <Star size={18} aria-hidden="true" />
                </div>
                <h4>Golden Keyword Detection</h4>
                <p>
                  Instant algorithmic spotting of high-demand keywords with low competition to help indie apps rank fast.
                </p>
              </div>

              <div className="showcase-pillar-card">
                <div className="pillar-icon pillar-icon--blue">
                  <Wand2 size={18} aria-hidden="true" />
                </div>
                <h4>100ch Metadata Optimizer</h4>
                <p>
                  Generate space-optimized, deduplicated comma-separated keyword fields for App Store Connect.
                </p>
              </div>
            </div>

            <div className="keyword-empty-slim">
              <span>No keywords yet — try an example above or paste a list.</span>
              <button
                type="button"
                className="keyword-empty-restore"
                onClick={() => restoreInputRef.current?.click()}
              >
                <Upload size={13} aria-hidden="true" />
                Restore a backup
              </button>
            </div>
          </section>
        ) : (
          <>
            <section
              className="tracker-scorecard-grid explorer-scorecards"
              aria-label="Keyword list summary"
            >
              <div className="tracker-scorecard-card">
                <span className="tracker-scorecard-label">Keywords Analyzed</span>
                <div className="tracker-scorecard-value">
                  <strong>{counts.all}</strong>
                  <small>in {country}</small>
                </div>
                <span className="tracker-scorecard-meta">Saved in local browser</span>
              </div>

              <div className="tracker-scorecard-card">
                <span className="tracker-scorecard-label">Golden Opportunities</span>
                <div className="tracker-scorecard-value">
                  <strong>{counts.golden}</strong>
                  {counts.golden > 0 && (
                    <span className="tracker-badge-top1" title="High demand, achievable difficulty">
                      ⭐ {Math.round((counts.golden / counts.all) * 100)}%
                    </span>
                  )}
                </div>
                <span className="tracker-scorecard-meta">Pop ≥55 & Diff ≤40</span>
              </div>

              <div className="tracker-scorecard-card">
                <span className="tracker-scorecard-label">Official Apple Ads</span>
                <div className="tracker-scorecard-value">
                  <strong>{counts.official}</strong>
                  <small>/ {counts.all}</small>
                </div>
                <span className="tracker-scorecard-meta">Verified Platform API v1</span>
              </div>

              <div className="tracker-scorecard-card">
                <span className="tracker-scorecard-label">Avg Demand / Barrier</span>
                <div className="tracker-scorecard-value">
                  <strong>{avgMetrics ? avgMetrics.avgPop : "—"}</strong>
                  <small>/ {avgMetrics ? avgMetrics.avgDiff : "—"}</small>
                </div>
                <span className="tracker-scorecard-meta">Pop (1–100) / Diff (1–100)</span>
              </div>
            </section>

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
                    aria-selected={filterTab === "all"}
                    className={
                      filterTab === "all"
                        ? "keyword-status-chip is-active"
                        : "keyword-status-chip"
                    }
                    onClick={() => setFilterTab("all")}
                  >
                    All <span>{counts.all}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filterTab === "golden"}
                    className={
                      filterTab === "golden"
                        ? "keyword-status-chip is-active"
                        : "keyword-status-chip"
                    }
                    onClick={() => setFilterTab("golden")}
                    title="Popularity ≥ 55 and Difficulty ≤ 40"
                  >
                    Golden <span>{counts.golden}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filterTab === "official"}
                    className={
                      filterTab === "official"
                        ? "keyword-status-chip is-active"
                        : "keyword-status-chip"
                    }
                    onClick={() => setFilterTab("official")}
                    title="Official Apple Ads verified popularity"
                  >
                    Apple Ads <span>{counts.official}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filterTab === "high_demand"}
                    className={
                      filterTab === "high_demand"
                        ? "keyword-status-chip is-active"
                        : "keyword-status-chip"
                    }
                    onClick={() => setFilterTab("high_demand")}
                    title="Popularity score ≥ 50"
                  >
                    High Demand <span>{counts.high_demand}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={filterTab === "low_diff"}
                    className={
                      filterTab === "low_diff"
                        ? "keyword-status-chip is-active"
                        : "keyword-status-chip"
                    }
                    onClick={() => setFilterTab("low_diff")}
                    title="Difficulty score ≤ 35"
                  >
                    Low Diff <span>{counts.low_diff}</span>
                  </button>
                </div>

                <div className="keyword-topbar-right">
                  <div className="keyword-instant-search">
                    <Search size={13} aria-hidden="true" />
                    <input
                      value={tableFilter}
                      onChange={(e) => setTableFilter(e.target.value)}
                      placeholder="Filter list…"
                      aria-label="Filter loaded keywords"
                    />
                    {tableFilter && (
                      <button
                        type="button"
                        onClick={() => setTableFilter("")}
                        aria-label="Clear filter"
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="refresh-all-button keyword-topbar-refresh"
                    onClick={() => void refreshAll()}
                    disabled={keywords.length === 0 || busy.size > 0}
                    title="Refresh scores for all keywords"
                  >
                    <RefreshCw
                      className={busy.size > 0 ? "spin" : ""}
                      size={15}
                      aria-hidden="true"
                    />
                    Refresh all
                  </button>
                </div>
              </div>

              {filterTab === "golden" && (
                <p className="keyword-heuristic-note">
                  “Golden” means popularity ≥ 55 and estimated difficulty ≤ 40 —
                  terms with solid demand and a low barrier, worth fighting for.
                </p>
              )}

              <div className="keyword-table-scroll">
                <table className="keyword-table">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: "auto", minWidth: 160 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 125 }} />
                    <col style={{ width: 100 }} />
                    <col style={{ width: 90 }} />
                    <col style={{ width: 54 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="keyword-th-select">
                        <button
                          type="button"
                          className="keyword-select-all-btn"
                          onClick={toggleSelectAll}
                          aria-label={
                            selectedSet.size === displayKeywords.length
                              ? "Deselect all"
                              : "Select all"
                          }
                          title="Select / Deselect all"
                        >
                          {selectedSet.size > 0 &&
                          selectedSet.size === displayKeywords.length ? (
                            <CheckSquare size={16} className="keyword-checkbox-icon" />
                          ) : (
                            <Square size={16} className="keyword-checkbox-icon" />
                          )}
                        </button>
                      </th>
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
                      const isSelected = selectedSet.has(keyword);

                      return (
                        <tr
                          key={keyword}
                          className={`${selected === keyword ? "is-selected" : ""} ${
                            isSelected ? "is-row-checked" : ""
                          }`}
                          onClick={() => setSelected(keyword)}
                        >
                          <td
                            className="keyword-td-select"
                            onClick={(e) => toggleSelectKeyword(keyword, e)}
                          >
                            <button
                              type="button"
                              className="keyword-row-checkbox"
                              aria-label={isSelected ? `Deselect ${keyword}` : `Select ${keyword}`}
                            >
                              {isSelected ? (
                                <CheckSquare size={16} className="keyword-checkbox-icon is-checked" />
                              ) : (
                                <Square size={16} className="keyword-checkbox-icon" />
                              )}
                            </button>
                          </td>
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
                                <Sparkline values={history} width={64} height={22} />
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
                        <td colSpan={7}>
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

              {/* Floating Multi-Select Action Bar */}
              {selectedSet.size > 0 && (
                <div className="keyword-selection-bar" role="toolbar" aria-label="Selection actions">
                  <div className="keyword-selection-info">
                    <CheckSquare size={16} aria-hidden="true" />
                    <span>
                      <strong>{selectedSet.size}</strong> keyword{selectedSet.size === 1 ? "" : "s"} selected
                    </span>
                  </div>
                  <div className="keyword-selection-actions">
                    <button
                      type="button"
                      className="tracker-button-primary"
                      onClick={() => void handleCopy100Ch(Array.from(selectedSet))}
                      title="Copy selected keywords optimized for App Store 100ch field"
                    >
                      <Copy size={14} aria-hidden="true" />
                      Copy 100ch
                    </button>
                    <button
                      type="button"
                      className="tracker-button-secondary"
                      onClick={() => setOptimizerOpen(true)}
                    >
                      <Wand2 size={14} aria-hidden="true" />
                      Optimizer
                    </button>
                    <button
                      type="button"
                      className="tracker-button-secondary"
                      onClick={() => exportCsv(Array.from(selectedSet))}
                    >
                      <Download size={14} aria-hidden="true" />
                      Export CSV
                    </button>
                    <button
                      type="button"
                      className="tracker-button-secondary keyword-btn-danger"
                      onClick={deleteSelectedKeywords}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Delete
                    </button>
                    <button
                      type="button"
                      className="keyword-selection-dismiss"
                      onClick={() => setSelectedSet(new Set())}
                      aria-label="Clear selection"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              <footer className="keyword-table-foot">
                <div className="keyword-table-actions">
                  <button
                    type="button"
                    className="refresh-all-button"
                    onClick={() => exportCsv()}
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
          </>
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
          onConfirm={(keywords) => void runBulk(keywords)}
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
