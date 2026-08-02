"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import {
  SUPPORTED_COUNTRIES,
  addKeywordToList,
  deleteRecord,
  estimateKeyword,
  loadKeywordList,
  loadRecord,
  recordSnapshot,
  recentHistory,
  removeKeywordFromList,
  suggestKeywords,
  trendDelta,
  type KeywordMetrics,
  type KeywordRecord,
} from "@/lib/aso";
import { searchAppStoreCatalog } from "@/lib/itunes";
import { Sparkline } from "@/components/keyword-charts";
import { KeywordDetail } from "@/components/keyword-detail";

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

const EXAMPLE_KEYWORDS = ["meditation", "habit tracker", "invoice scanner"];

export function KeywordExplorer() {
  const [country, setCountry] = useState<string>("US");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [records, setRecords] = useState<Map<string, KeywordRecord>>(new Map());
  const [metrics, setMetrics] = useState<Map<string, KeywordMetrics>>(new Map());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const countryLabel = SUPPORTED_COUNTRIES.find(
    (item) => item.code === country,
  )?.label ?? country;

  /* Rehydrate persisted rows whenever the country changes. The read is
     deferred out of the effect body so state updates happen in the async
     callback, not synchronously during the render commit. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const list = loadKeywordList(window.localStorage, country);
      setKeywords(list);
      const nextRecords = new Map<string, KeywordRecord>();
      for (const keyword of list) {
        const record = loadRecord(window.localStorage, keyword, country);
        if (record) nextRecords.set(keyword, record);
      }
      setRecords(nextRecords);
      setSelected(null);
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [country]);

  const analyze = useCallback(
    async (keyword: string, options: { open?: boolean; reorder?: boolean } = {}) => {
      const clean = keyword.trim();
      const key = clean.toLocaleLowerCase();
      if (!clean || busy.has(key)) return;
      setBusy((previous) => new Set(previous).add(key));
      setError(null);
      try {
        const nextMetrics = await estimateKeyword(clean, country);
        const record = recordSnapshot(window.localStorage, nextMetrics);
        if (options.reorder !== false) {
          setKeywords(addKeywordToList(window.localStorage, country, clean));
        }
        setMetrics((previous) => new Map(previous).set(clean, nextMetrics));
        setRecords((previous) => new Map(previous).set(clean, record));
        if (options.open !== false) setSelected(clean);
      } catch {
        setError(
          `Could not analyze “${clean}”. The App Store may be rate-limiting requests — try again in a moment.`,
        );
      } finally {
        setBusy((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
        setQuery("");
        setSuggestionsOpen(false);
      }
    },
    [busy, country],
  );

  const refreshAll = useCallback(async () => {
    for (const keyword of keywords) {
      await analyze(keyword, { open: false, reorder: false });
    }
  }, [analyze, keywords]);

  const removeRow = useCallback(
    (keyword: string) => {
      setKeywords(removeKeywordFromList(window.localStorage, country, keyword));
      deleteRecord(window.localStorage, keyword, country);
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
    [country],
  );

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

  const selectedMetrics = selected ? metrics.get(selected) : null;
  const selectedRecord = selected ? records.get(selected) : null;
  const selectedBusy = selected ? busy.has(selected.toLocaleLowerCase()) : false;

  return (
    <main className="tool-page">
      <section className="keyword-hero marketing-container">
        <span className="marketing-eyebrow">App Store keyword intelligence</span>
        <h1>Find keywords worth ranking for</h1>
        <p className="keyword-hero-deck">
          Search any keyword for estimated popularity and difficulty — or use{" "}
          <strong>My Apps</strong> in the sidebar to track your app’s position
          on public App Store search. Free, local, no account.
        </p>
        <div className="keyword-estimate-note">
          <Info size={15} aria-hidden="true" />
          <span>
            Popularity and difficulty are <strong>estimates</strong> from public
            iTunes data (competition and top-result strength). They are not
            Apple Ads search volume. Position in My Apps is the observed rank in
            the first 200 public results.
          </span>
        </div>
      </section>

      <section className="keyword-tool marketing-container">
        <div className="keyword-search-row">
          <form
            className="keyword-search-form"
            role="search"
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
              placeholder="Try “meditation”, “habit tracker”, “invoice scanner”…"
              maxLength={80}
              aria-label="Search keywords"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" disabled={query.trim().length < 2 || busy.size > 0}>
              {busy.size > 0 ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                "Analyze"
              )}
            </button>
            {suggestionsOpen && suggestions.length > 0 && (
              <div className="keyword-suggestions" role="listbox">
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
          <label className="country-select">
            <span>Store country</span>
            <select
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              aria-label="Store country"
            >
              {SUPPORTED_COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="refresh-all-button"
            onClick={() => void refreshAll()}
            disabled={keywords.length === 0 || busy.size > 0}
          >
            <RefreshCw className={busy.size > 0 ? "spin" : ""} size={15} aria-hidden="true" />
            Refresh all
          </button>
        </div>

        {error && (
          <div className="keyword-error" role="alert">
            {error}
          </div>
        )}

        {keywords.length === 0 ? (
          <div className="keyword-empty">
            <Search size={24} aria-hidden="true" />
            <strong>No keywords yet</strong>
            <span>
              Search above or start with one of these:
            </span>
            <div className="keyword-examples">
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
          </div>
        ) : (
          <div className="keyword-table-wrap">
            <table className="keyword-table">
              <thead>
                <tr>
                  <th>Keyword</th>
                  <th>Popularity</th>
                  <th>Difficulty</th>
                  <th>Trend</th>
                  <th>Results</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {keywords.map((keyword) => {
                  const record = records.get(keyword);
                  const metric = metrics.get(keyword);
                  const history = record
                    ? recentHistory(record).map((point) => point.popularity)
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
                        <strong className="keyword-name">{keyword}</strong>
                        <small>{countryLabel}</small>
                      </td>
                      <td>
                        {metric ? (
                          <MetricBar value={metric.popularity} tone="popularity" />
                        ) : (
                          <em className="keyword-pending">
                            {isBusy ? "Analyzing…" : "Pending"}
                          </em>
                        )}
                      </td>
                      <td>
                        {metric ? (
                          <MetricBar value={metric.difficulty} tone="difficulty" />
                        ) : (
                          <em className="keyword-pending">—</em>
                        )}
                      </td>
                      <td className="keyword-trend-cell">
                        {record ? (
                          <>
                            <Sparkline values={history} />
                            {delta !== null && delta !== 0 && (
                              <span className={delta > 0 ? "trend-up" : "trend-down"}>
                                {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
                              </span>
                            )}
                          </>
                        ) : (
                          <em className="keyword-pending">—</em>
                        )}
                      </td>
                      <td className="keyword-results-cell">
                        {metric ? (
                          <span>
                            <b>{metric.results}</b>
                            <small>{metric.saturated ? "200+ found" : "apps"}</small>
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
              </tbody>
            </table>
            <footer className="keyword-table-foot">
              <span>
                Saved in your browser — history grows with one snapshot per day
                per keyword.
              </span>
              <span>
                {keywords.length} keyword{keywords.length === 1 ? "" : "s"} ·{" "}
                {countryLabel}
              </span>
            </footer>
          </div>
        )}

        {selected && (
          <KeywordDetail
            keyword={selected}
            countryLabel={countryLabel}
            metrics={selectedMetrics ?? null}
            record={selectedRecord ?? null}
            busy={selectedBusy}
            onClose={() => setSelected(null)}
            onRefresh={() => void analyze(selected, { open: true, reorder: false })}
            onAnalyze={(keyword) => void analyze(keyword)}
          />
        )}
      </section>
    </main>
  );
}
