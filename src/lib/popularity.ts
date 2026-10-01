// Client-safe official popularity overlay.
//
// The browser never talks to Apple Ads. It posts keywords (with a genre hint
// from the ranking apps) to POST /api/popularity; the Worker answers from
// Apple's weekly published search terms.

import type { KeywordMetrics, PopularityHistoryPoint, PopularitySource } from "@/lib/aso";
import {
  datasetGenreFor,
  genreLabel,
  inferDatasetGenre,
  normalizeTerm,
} from "@/lib/search-terms";

export type { PopularitySource };

export interface OfficialPopularity {
  term: string;
  found: boolean;
  genre?: string;
  searchPopularity1to100?: number;
  searchPopularityInGenre?: number;
  searchPopularity1to5?: number;
  rankInGenre?: number;
  weekStart?: string;
  weekEnd?: string;
  /** Not published: popularity is at or below this genre floor. */
  ceiling?: number;
  /** Apple's weekly scores for the term, oldest first. */
  history?: PopularityHistoryPoint[];
}

export interface PopularityLookupItem {
  term: string;
  /** iTunes genre name or Ads token; sharpens the long-tail ceiling. */
  genre?: string;
}

export function popularitySourceOf(
  metrics: Pick<KeywordMetrics, "popularitySource"> | null | undefined,
): PopularitySource {
  const source = metrics?.popularitySource;
  return source === "official" || source === "longtail" ? source : "estimated";
}

export function popularityCaption(source?: PopularitySource, genre?: string): string {
  if (source === "official") {
    return "Apple Ads popularity (relative 1–100, not search volume)";
  }
  if (source === "longtail") {
    return `Below Apple's top 500 searches${genre ? ` in ${genreLabel(genre)}` : ""} — a long-tail term`;
  }
  return "Apple data unavailable — rough estimate from App Store competition";
}

export function popularityShortLabel(source?: PopularitySource): string {
  if (source === "official") return "Apple";
  if (source === "longtail") return "Long tail";
  return "Est.";
}

/** "52", "≤48" for long tail, so the number never overstates what Apple said. */
export function formatPopularity(
  metrics: Pick<KeywordMetrics, "popularity" | "popularitySource">,
): string {
  return metrics.popularitySource === "longtail"
    ? `≤${metrics.popularity}`
    : String(metrics.popularity);
}

export function applyOfficialPopularity(
  metrics: KeywordMetrics,
  official: OfficialPopularity | null | undefined,
): KeywordMetrics {
  if (!official) {
    return { ...metrics, popularitySource: metrics.popularitySource ?? "estimated" };
  }
  const history =
    official.history && official.history.length > 0 ? official.history : undefined;
  const score = official.searchPopularity1to100;
  if (official.found && typeof score === "number" && Number.isFinite(score)) {
    return {
      ...metrics,
      popularity: Math.max(1, Math.min(100, Math.round(score))),
      popularitySource: "official",
      popularityCeiling: undefined,
      appleGenre: official.genre,
      searchPopularityInGenre: official.searchPopularityInGenre,
      searchPopularity1to5: official.searchPopularity1to5,
      rankInGenre: official.rankInGenre,
      dataWeek: official.weekStart,
      popularityHistory: history,
    };
  }
  if (!official.found && typeof official.ceiling === "number" && official.ceiling > 0) {
    return {
      ...metrics,
      popularity: Math.round(official.ceiling),
      popularitySource: "longtail",
      popularityCeiling: Math.round(official.ceiling),
      appleGenre: official.genre,
      dataWeek: official.weekStart,
      popularityHistory: history,
    };
  }
  return { ...metrics, popularitySource: metrics.popularitySource ?? "estimated" };
}

export function officialLookupItemsFor(
  metrics: Pick<KeywordMetrics, "keyword" | "topApps">,
  genreOverride?: string,
): PopularityLookupItem[] {
  const term = metrics.keyword.trim();
  if (!term) return [];
  const genre =
    (genreOverride ? datasetGenreFor(genreOverride) : null) ??
    inferDatasetGenre(metrics.topApps);
  return [genre ? { term, genre } : { term }];
}

interface PopularityApiResponse {
  results?: OfficialPopularity[];
  configured?: boolean;
  error?: string;
}

/** Session flag: skip further overlay calls after an unconfigured server. */
let overlayConfigured: boolean | null = null;

export function resetOfficialPopularityCache(): void {
  overlayConfigured = null;
}

/**
 * Look up official Apple Ads popularity for one or more terms.
 * Returns an empty map on any failure so callers can keep the estimate.
 */
export async function fetchOfficialPopularity(
  items: readonly PopularityLookupItem[],
  country: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal; history?: boolean } = {},
): Promise<Map<string, OfficialPopularity>> {
  const out = new Map<string, OfficialPopularity>();
  const clean = items
    .map((item) => ({
      term: item.term.trim(),
      ...(item.genre ? { genre: item.genre.trim() } : {}),
    }))
    .filter((item) => item.term.length > 0)
    .slice(0, 25);
  if (clean.length === 0) return out;
  if (overlayConfigured === false) return out;
  if (typeof window === "undefined" && !options.fetchImpl) return out;

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl("/api/popularity", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ country, items: clean, history: options.history ?? true }),
      signal: options.signal,
    });
    if (!response.ok) return out;
    const payload = (await response.json()) as PopularityApiResponse;
    if (payload.configured === false) {
      overlayConfigured = false;
      return out;
    }
    overlayConfigured = true;
    for (const row of payload.results ?? []) {
      if (!row?.term) continue;
      out.set(normalizeTerm(row.term), row);
    }
  } catch {
    return out;
  }
  return out;
}

export async function enrichAnalysisResult<T extends { metrics: KeywordMetrics }>(
  analysis: T,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    genre?: string;
  } = {},
): Promise<T> {
  return {
    ...analysis,
    metrics: await enrichMetricsWithOfficialPopularity(analysis.metrics, options),
  };
}

export async function enrichMetricsWithOfficialPopularity(
  metrics: KeywordMetrics,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    genre?: string;
  } = {},
): Promise<KeywordMetrics> {
  const items = officialLookupItemsFor(metrics, options.genre);
  if (items.length === 0) {
    return { ...metrics, popularitySource: metrics.popularitySource ?? "estimated" };
  }
  const found = await fetchOfficialPopularity(items, metrics.country, options);
  return applyOfficialPopularity(
    metrics,
    found.get(normalizeTerm(metrics.keyword)) ?? null,
  );
}

