// Client-safe official popularity overlay.
//
// The browser never talks to Apple Ads. It posts keyword + inferred genre to
// POST /api/popularity; the Worker holds the founder Ads credentials.

import {
  inferAppleGenre,
  mapItunesGenre,
  type AppleAdsGenre,
} from "@/lib/apple-ads-genres";
import type { KeywordMetrics } from "@/lib/aso";

export type PopularitySource = "official" | "estimated";

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
}

export interface PopularityLookupItem {
  term: string;
  genre: string;
}

export function popularitySourceOf(
  metrics: Pick<KeywordMetrics, "popularitySource"> | null | undefined,
): PopularitySource {
  return metrics?.popularitySource === "official" ? "official" : "estimated";
}

export function popularityCaption(source?: PopularitySource): string {
  return source === "official"
    ? "Apple Ads popularity (relative 1–100, not search volume)"
    : "Estimated demand from public iTunes signals";
}

export function popularityShortLabel(source?: PopularitySource): string {
  return source === "official" ? "Apple Ads" : "Est.";
}

export function applyOfficialPopularity(
  metrics: KeywordMetrics,
  official: OfficialPopularity | null | undefined,
): KeywordMetrics {
  const score = official?.searchPopularity1to100;
  if (!official?.found || typeof score !== "number" || !Number.isFinite(score)) {
    return {
      ...metrics,
      popularitySource: metrics.popularitySource ?? "estimated",
    };
  }
  const clamped = Math.max(1, Math.min(100, Math.round(score)));
  return {
    ...metrics,
    popularity: clamped,
    popularitySource: "official",
    appleGenre: official.genre,
    searchPopularityInGenre: official.searchPopularityInGenre,
    searchPopularity1to5: official.searchPopularity1to5,
    rankInGenre: official.rankInGenre,
  };
}

export function officialLookupItemsFor(
  metrics: Pick<KeywordMetrics, "keyword" | "topApps">,
  genreOverride?: string,
): PopularityLookupItem[] {
  const term = metrics.keyword.trim();
  if (!term) return [];
  const mappedOverride = genreOverride ? mapItunesGenre(genreOverride) : null;
  const genre = mappedOverride ?? inferAppleGenre(metrics.topApps);
  if (!genre) return [];
  return [{ term, genre }];
}

interface PopularityApiResponse {
  results?: OfficialPopularity[];
  configured?: boolean;
  error?: string;
}

function normalizeTerm(term: string): string {
  return term.trim().toLocaleLowerCase();
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
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<Map<string, OfficialPopularity>> {
  const out = new Map<string, OfficialPopularity>();
  const clean = items
    .map((item) => ({
      term: item.term.trim(),
      genre: item.genre.trim().toUpperCase(),
    }))
    .filter((item) => item.term.length > 0 && item.genre.length > 0)
    .slice(0, 25);
  if (clean.length === 0) return out;
  if (overlayConfigured === false) return out;
  if (typeof window === "undefined" && !options.fetchImpl) return out;

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl("/api/popularity", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ country, items: clean }),
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

export type { AppleAdsGenre };
