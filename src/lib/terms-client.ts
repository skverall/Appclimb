// Browser client for /api/terms/* — Apple's published search terms.
// Every call fails soft (empty result) so the explorer keeps working when
// the Worker has no Apple Ads credentials (local dev, previews).

import type { DatasetGenre } from "@/lib/search-terms";

export interface SuggestedTerm {
  term: string;
  genre: DatasetGenre;
  popularity: number;
}

export interface RelatedTermResult extends SuggestedTerm {
  shared: number;
}

export interface TrendingTerm extends SuggestedTerm {
  delta: number | null;
  rankInGenre?: number;
  rankDelta: number | null;
}

export interface TrendingResponse {
  configured: boolean;
  week: string | null;
  compareWeek: string | null;
  termCount?: number;
  rising: TrendingTerm[];
  newcomers: TrendingTerm[];
  top: TrendingTerm[];
}

const cache = new Map<string, Promise<unknown>>();

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  const cached = cache.get(url) as Promise<T | null> | undefined;
  if (cached) return cached;
  const request = (async () => {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    }
  })();
  cache.set(url, request);
  const result = await request;
  // Do not pin failures (or aborted calls) in the cache.
  if (result === null) cache.delete(url);
  if (cache.size > 300) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return result;
}

export async function fetchTermSuggestions(
  country: string,
  query: string,
  signal?: AbortSignal,
): Promise<SuggestedTerm[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = await getJson<{ suggestions?: SuggestedTerm[] }>(
    `/api/terms/suggest?country=${encodeURIComponent(country)}&q=${encodeURIComponent(q.toLocaleLowerCase())}`,
    signal,
  );
  return data?.suggestions ?? [];
}

export async function fetchRelatedTerms(
  country: string,
  term: string,
  genre?: string | null,
): Promise<RelatedTermResult[]> {
  const params = new URLSearchParams({ country, term: term.trim().toLocaleLowerCase(), limit: "12" });
  if (genre) params.set("genre", genre);
  const data = await getJson<{ related?: RelatedTermResult[] }>(`/api/terms/related?${params}`);
  return data?.related ?? [];
}

export async function fetchTrendingTerms(
  country: string,
  genre: DatasetGenre | null,
  limit = 12,
): Promise<TrendingResponse | null> {
  const params = new URLSearchParams({ country, limit: String(limit) });
  if (genre) params.set("genre", genre);
  const data = await getJson<TrendingResponse>(`/api/terms/trending?${params}`);
  if (!data || data.configured === false) return null;
  return data;
}
