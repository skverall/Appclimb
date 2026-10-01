"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Flame, Sparkles, TrendingUp } from "lucide-react";

import Link from "next/link";

import { formatWeek } from "@/components/keyword-charts";
import { categoryPath, countryPath } from "@/lib/keyword-pages";
import { DATASET_GENRES, GENRE_LABELS, type DatasetGenre } from "@/lib/search-terms";
import { fetchTrendingTerms, type TrendingResponse, type TrendingTerm } from "@/lib/terms-client";

type Tab = "rising" | "top" | "newcomers";

const TABS: Array<{ id: Tab; label: string; icon: typeof Flame }> = [
  { id: "rising", label: "Rising", icon: TrendingUp },
  { id: "top", label: "Most searched", icon: Flame },
  { id: "newcomers", label: "New this month", icon: Sparkles },
];

/**
 * Live discovery from Apple's published search terms: what is climbing,
 * what is biggest, and what just entered the top 500 — per category.
 */
export function TrendingSearches({
  country,
  countryLabel,
  disabled,
  onAnalyze,
  onUnavailable,
}: {
  country: string;
  countryLabel: string;
  disabled?: boolean;
  onAnalyze: (term: string) => void;
  onUnavailable?: () => void;
}) {
  const [genre, setGenre] = useState<DatasetGenre | null>("HEALTH_FITNESS");
  const [tab, setTab] = useState<Tab>("rising");
  const [state, setState] = useState<{ key: string; data: TrendingResponse | null } | null>(null);
  const key = `${country}:${genre ?? "all"}`;

  useEffect(() => {
    let cancelled = false;
    void fetchTrendingTerms(country, genre, 12).then((data) => {
      if (cancelled) return;
      setState({ key, data });
      if (!data) onUnavailable?.();
    });
    return () => {
      cancelled = true;
    };
  }, [country, genre, key, onUnavailable]);

  const loading = state?.key !== key;
  const data = loading ? null : state?.data ?? null;
  if (!loading && !data) return null;

  const rows: TrendingTerm[] = data ? data[tab] : [];
  const effectiveRows = tab === "rising" && rows.length === 0 && data ? data.top : rows;

  return (
    <section className="trending" aria-labelledby="trending-title">
      <div className="trending-head">
        <div>
          <h2 id="trending-title">What people search in the {countryLabel} App Store</h2>
          <p>
            Apple&apos;s own list of the 500 most-searched terms per category
            {data?.week ? `, week of ${formatWeek(data.week)}` : ""}. Click a term to analyze it.
          </p>
        </div>
        <label className="trending-genre">
          <span className="sr-only">Category</span>
          <select
            value={genre ?? ""}
            onChange={(event) =>
              setGenre(event.target.value ? (event.target.value as DatasetGenre) : null)
            }
          >
            <option value="">All categories</option>
            {DATASET_GENRES.map((item) => (
              <option key={item} value={item}>
                {GENRE_LABELS[item]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="trending-tabs" role="tablist" aria-label="Trending lists">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "is-active" : undefined}
            onClick={() => setTab(id)}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        ))}
        {data?.compareWeek && tab !== "top" && (
          <span className="trending-compare">vs week of {formatWeek(data.compareWeek)}</span>
        )}
      </div>

      {loading ? (
        <ol className="trending-list trending-list--loading" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <li key={index}>
              <i />
            </li>
          ))}
        </ol>
      ) : effectiveRows.length === 0 ? (
        <p className="trending-empty">Nothing new in this category this month.</p>
      ) : (
        <ol className="trending-list">
          {effectiveRows.map((row, index) => (
            <li key={`${row.genre}:${row.term}`}>
              <button type="button" disabled={disabled} onClick={() => onAnalyze(row.term)}>
                <span className="trending-rank">{index + 1}</span>
                <span className="trending-term">
                  {row.term}
                  {!genre && <small>{GENRE_LABELS[row.genre]}</small>}
                </span>
                <span className="trending-pop" title="Apple Ads popularity (1–100)">
                  {row.popularity}
                </span>
                {tab === "rising" && row.delta !== null && row.delta > 0 ? (
                  <span className="trending-delta">+{row.delta}</span>
                ) : tab === "newcomers" ? (
                  <span className="trending-delta trending-delta--new">new</span>
                ) : (
                  <span className="trending-delta trending-delta--muted">
                    {row.rankInGenre ? `#${row.rankInGenre}` : ""}
                  </span>
                )}
                <ArrowUpRight size={14} aria-hidden="true" className="trending-go" />
              </button>
            </li>
          ))}
        </ol>
      )}
      {!loading && data && country !== "RU" && (
        <Link
          className="trending-more"
          href={genre ? categoryPath(country, genre) : countryPath(country)}
        >
          See the full top 100{genre ? ` for ${GENRE_LABELS[genre]}` : ""} →
        </Link>
      )}
    </section>
  );
}
