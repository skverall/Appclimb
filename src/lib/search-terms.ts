// Apple's published App Store search terms — shared, client-safe helpers.
//
// Apple Ads Insights publishes, every week and for every storefront, the 500
// most-searched terms in each of 15 genres with an official relative
// popularity score (1–100). The Worker keeps those weekly lists in D1 (see
// search-terms-store.ts). This module holds the pure logic on top of them:
// lookup, the "below Apple's published range" ceiling for long-tail terms,
// related-term discovery, autocomplete, and week-over-week movers.
//
// Nothing here is search volume. Popularity is Apple's relative score.

import { appleInsightsGenreCandidates, mapItunesGenre } from "@/lib/apple-ads-genres";

/** Genres Apple publishes search-term popularity for (from live data). */
export const DATASET_GENRES = [
  "BUSINESS",
  "EDUCATION",
  "ENTERTAINMENT",
  "FINANCE",
  "FOOD_DRINK",
  "GAMES",
  "HEALTH_FITNESS",
  "LIFESTYLE",
  "NEW_PUBLICATION",
  "PHOTO_VIDEO",
  "PRODUCTIVITY_UTILITIES",
  "SHOPPING",
  "SOCIAL_NETWORKING",
  "SPORTS",
  "TRAVEL",
] as const;

export type DatasetGenre = (typeof DATASET_GENRES)[number];

export const GENRE_LABELS: Record<DatasetGenre, string> = {
  BUSINESS: "Business",
  EDUCATION: "Education",
  ENTERTAINMENT: "Entertainment",
  FINANCE: "Finance",
  FOOD_DRINK: "Food & Drink",
  GAMES: "Games",
  HEALTH_FITNESS: "Health & Fitness",
  LIFESTYLE: "Lifestyle",
  NEW_PUBLICATION: "News & Magazines",
  PHOTO_VIDEO: "Photo & Video",
  PRODUCTIVITY_UTILITIES: "Productivity & Utilities",
  SHOPPING: "Shopping",
  SOCIAL_NETWORKING: "Social Networking",
  SPORTS: "Sports",
  TRAVEL: "Travel",
};

const GENRE_SET = new Set<string>(DATASET_GENRES);

export function isDatasetGenre(value: unknown): value is DatasetGenre {
  return typeof value === "string" && GENRE_SET.has(value);
}

export function genreLabel(genre: string | null | undefined): string {
  return genre && isDatasetGenre(genre) ? GENRE_LABELS[genre] : "All categories";
}

/** Map an iTunes genre name (or an Ads token) to a published dataset genre. */
export function datasetGenreFor(genre: string | null | undefined): DatasetGenre | null {
  if (!genre) return null;
  if (isDatasetGenre(genre)) return genre;
  const token = mapItunesGenre(genre);
  if (!token) return null;
  const candidate = appleInsightsGenreCandidates(token)[0];
  return isDatasetGenre(candidate) ? candidate : null;
}

/** Most common dataset genre among a keyword's top apps (rank breaks ties). */
export function inferDatasetGenre(
  apps: ReadonlyArray<{ genre: string }>,
): DatasetGenre | null {
  const votes = new Map<DatasetGenre, { count: number; first: number }>();
  apps.slice(0, 10).forEach((app, index) => {
    const genre = datasetGenreFor(app.genre);
    if (!genre) return;
    const vote = votes.get(genre);
    if (vote) vote.count += 1;
    else votes.set(genre, { count: 1, first: index });
  });
  let best: DatasetGenre | null = null;
  let bestVote = { count: 0, first: Number.POSITIVE_INFINITY };
  for (const [genre, vote] of votes) {
    if (
      vote.count > bestVote.count ||
      (vote.count === bestVote.count && vote.first < bestVote.first)
    ) {
      best = genre;
      bestVote = vote;
    }
  }
  return best;
}

/** Apple stores terms as typed, lowercased. Match the same way. */
export function normalizeTerm(term: string): string {
  return term.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

export interface TermRow {
  term: string;
  genre: DatasetGenre;
  /** Apple's searchPopularity1to100 for the week. */
  popularity: number;
  popularityInGenre?: number;
  popularity1to5?: number;
  /** Position among the genre's published terms (1 = most searched). */
  rankInGenre?: number;
}

export interface TermHistoryPoint {
  /** Sunday that starts the Apple Ads week (YYYY-MM-DD). */
  week: string;
  popularity: number;
}

export interface TermDataset {
  country: string;
  /** Sunday that starts the week (YYYY-MM-DD). */
  week: string;
  rows: TermRow[];
  byTerm: Map<string, TermRow>;
  /** Lowest published popularity per genre — the long-tail ceiling. */
  floors: Partial<Record<DatasetGenre, number>>;
  globalFloor: number;
}

/** Compact storage tuple: [term, popularity, inGenre, 1to5, rankInGenre]. */
export type PackedTermRow = [string, number, number | null, number | null, number | null];

export function packRows(rows: readonly TermRow[]): PackedTermRow[] {
  return rows.map((row) => [
    row.term,
    row.popularity,
    row.popularityInGenre ?? null,
    row.popularity1to5 ?? null,
    row.rankInGenre ?? null,
  ]);
}

export function unpackRows(genre: DatasetGenre, packed: unknown): TermRow[] {
  if (!Array.isArray(packed)) return [];
  const rows: TermRow[] = [];
  for (const entry of packed) {
    if (!Array.isArray(entry)) continue;
    const [term, popularity, inGenre, oneToFive, rank] = entry as unknown[];
    if (typeof term !== "string" || typeof popularity !== "number") continue;
    rows.push({
      term,
      genre,
      popularity,
      popularityInGenre: typeof inGenre === "number" ? inGenre : undefined,
      popularity1to5: typeof oneToFive === "number" ? oneToFive : undefined,
      rankInGenre: typeof rank === "number" ? rank : undefined,
    });
  }
  return rows;
}

export function buildDataset(
  country: string,
  week: string,
  rows: readonly TermRow[],
): TermDataset {
  const byTerm = new Map<string, TermRow>();
  const floors: Partial<Record<DatasetGenre, number>> = {};
  let globalFloor = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const key = normalizeTerm(row.term);
    const existing = byTerm.get(key);
    if (!existing || row.popularity > existing.popularity) byTerm.set(key, row);
    const floor = floors[row.genre];
    if (floor === undefined || row.popularity < floor) floors[row.genre] = row.popularity;
    if (row.popularity < globalFloor) globalFloor = row.popularity;
  }
  return {
    country,
    week,
    rows: [...rows],
    byTerm,
    floors,
    globalFloor: Number.isFinite(globalFloor) ? globalFloor : 0,
  };
}

export interface TermLookup {
  term: string;
  found: boolean;
  row?: TermRow;
  /**
   * For a term Apple does not publish this week: the lowest published score
   * in its genre. The term's own popularity is at or below this value.
   */
  ceiling?: number;
  ceilingGenre?: DatasetGenre;
}

export function lookupTerm(
  dataset: TermDataset,
  term: string,
  genreHint?: string | null,
): TermLookup {
  const row = dataset.byTerm.get(normalizeTerm(term));
  if (row) return { term, found: true, row };
  const genre = datasetGenreFor(genreHint);
  const ceiling = (genre ? dataset.floors[genre] : undefined) ?? dataset.globalFloor;
  return {
    term,
    found: false,
    ceiling: ceiling > 0 ? ceiling : undefined,
    ceilingGenre: genre && dataset.floors[genre] !== undefined ? genre : undefined,
  };
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "app",
  "apps",
  "by",
  "de",
  "for",
  "free",
  "in",
  "my",
  "of",
  "on",
  "the",
  "to",
  "with",
]);

export function termTokens(term: string): string[] {
  return (
    normalizeTerm(term)
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length >= 2 && !STOP_WORDS.has(token)) ?? []
  );
}

export interface RelatedTerm {
  term: string;
  genre: DatasetGenre;
  popularity: number;
  /** How many of the query's words the term shares. */
  shared: number;
}

/**
 * Published terms that share a word with the query (or contain it, for a
 * single-word query). Terms in the query's own genre come first (the query's
 * published genre, else `genreHint`), then the best word match, then the
 * most popular — so "flight tracker" only fills in after every
 * productivity match for "habit tracker".
 */
export function relatedTermsFrom(
  dataset: TermDataset,
  query: string,
  limit = 12,
  genreHint?: string | null,
): RelatedTerm[] {
  const genre =
    dataset.byTerm.get(normalizeTerm(query))?.genre ?? datasetGenreFor(genreHint);
  const self = normalizeTerm(query);
  const tokens = termTokens(query);
  if (tokens.length === 0) return [];
  const single = tokens.length === 1 && tokens[0].length >= 4 ? tokens[0] : null;
  const seen = new Set<string>();
  const out: RelatedTerm[] = [];
  for (const row of dataset.rows) {
    const key = normalizeTerm(row.term);
    if (key === self || seen.has(key)) continue;
    const words = new Set(termTokens(row.term));
    let shared = 0;
    for (const token of tokens) if (words.has(token)) shared += 1;
    if (shared === 0 && single && key.includes(single)) shared = 0.5;
    if (shared === 0) continue;
    seen.add(key);
    out.push({ term: row.term, genre: row.genre, popularity: row.popularity, shared });
  }
  const sameGenre = (item: RelatedTerm) => (genre && item.genre === genre ? 1 : 0);
  out.sort(
    (left, right) =>
      sameGenre(right) - sameGenre(left) ||
      right.shared - left.shared ||
      right.popularity - left.popularity ||
      left.term.localeCompare(right.term),
  );
  // Off-genre terms sharing only part of a multi-word query are filler;
  // keep a few for inspiration, not a whole list of them.
  let filler = 0;
  return out
    .filter((item) => {
      const partial = genre && item.genre !== genre && item.shared < tokens.length;
      if (!partial) return true;
      filler += 1;
      return filler <= 5;
    })
    .slice(0, limit);
}

/** Autocomplete: terms that start with the prefix, then terms with a word that does. */
export function suggestTermsFrom(
  dataset: TermDataset,
  prefix: string,
  limit = 8,
): Array<{ term: string; genre: DatasetGenre; popularity: number }> {
  const needle = normalizeTerm(prefix);
  if (needle.length < 2) return [];
  const starts: TermRow[] = [];
  const inner: TermRow[] = [];
  const seen = new Set<string>();
  for (const row of dataset.rows) {
    const key = normalizeTerm(row.term);
    if (seen.has(key)) continue;
    if (key.startsWith(needle)) {
      starts.push(row);
      seen.add(key);
    } else if (key.includes(` ${needle}`)) {
      inner.push(row);
      seen.add(key);
    }
  }
  const byPopularity = (left: TermRow, right: TermRow) =>
    right.popularity - left.popularity || left.term.localeCompare(right.term);
  return [...starts.sort(byPopularity), ...inner.sort(byPopularity)]
    .slice(0, limit)
    .map((row) => ({ term: row.term, genre: row.genre, popularity: row.popularity }));
}

export interface TermMover {
  term: string;
  genre: DatasetGenre;
  popularity: number;
  /** Popularity change vs the comparison week; null when newly published. */
  delta: number | null;
  rankInGenre?: number;
  /** Rank change in the genre list (positive = climbed). */
  rankDelta: number | null;
}

/**
 * Week-over-period movers: terms whose Apple popularity climbed the most
 * since `previous`, plus terms that newly entered the published list.
 */
export function moversFrom(
  current: TermDataset,
  previous: TermDataset | null,
  options: { genre?: DatasetGenre | null; limit?: number } = {},
): { rising: TermMover[]; newcomers: TermMover[]; top: TermMover[] } {
  const limit = options.limit ?? 20;
  const rows = current.rows.filter(
    (row) => !options.genre || row.genre === options.genre,
  );
  const previousByKey = new Map<string, TermRow>();
  for (const row of previous?.rows ?? []) {
    if (options.genre && row.genre !== options.genre) continue;
    previousByKey.set(`${row.genre}:${normalizeTerm(row.term)}`, row);
  }
  const movers: TermMover[] = rows.map((row) => {
    const before = previousByKey.get(`${row.genre}:${normalizeTerm(row.term)}`);
    return {
      term: row.term,
      genre: row.genre,
      popularity: row.popularity,
      delta: before ? row.popularity - before.popularity : null,
      rankInGenre: row.rankInGenre,
      rankDelta:
        before?.rankInGenre !== undefined && row.rankInGenre !== undefined
          ? before.rankInGenre - row.rankInGenre
          : null,
    };
  });
  const rising = previous
    ? movers
        .filter((mover) => mover.delta !== null && mover.delta > 0)
        .sort(
          (left, right) =>
            (right.delta ?? 0) - (left.delta ?? 0) ||
            (right.rankDelta ?? 0) - (left.rankDelta ?? 0) ||
            right.popularity - left.popularity,
        )
        .slice(0, limit)
    : [];
  const newcomers = previous
    ? movers
        .filter((mover) => mover.delta === null)
        .sort((left, right) => right.popularity - left.popularity)
        .slice(0, limit)
    : [];
  const top = [...movers]
    .sort(
      (left, right) =>
        right.popularity - left.popularity || left.term.localeCompare(right.term),
    )
    .slice(0, limit);
  return { rising, newcomers, top };
}

/** Dedupe Apple history rows (one per week, highest score wins), oldest first. */
export function normalizeHistory(
  points: ReadonlyArray<{ week: string; popularity: number }>,
): TermHistoryPoint[] {
  const byWeek = new Map<string, number>();
  for (const point of points) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(point.week)) continue;
    if (!Number.isFinite(point.popularity)) continue;
    const existing = byWeek.get(point.week);
    if (existing === undefined || point.popularity > existing) {
      byWeek.set(point.week, Math.round(point.popularity));
    }
  }
  return [...byWeek.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([week, popularity]) => ({ week, popularity }));
}

/** Change between the latest point and the one `weeksBack` weeks earlier. */
export function historyDelta(
  history: readonly TermHistoryPoint[],
  weeksBack = 4,
): number | null {
  if (history.length < 2) return null;
  const last = history[history.length - 1];
  const target = new Date(`${last.week}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() - weeksBack * 7);
  const targetWeek = target.toISOString().slice(0, 10);
  let base: TermHistoryPoint | null = null;
  for (const point of history) {
    if (point.week <= targetWeek) base = point;
  }
  base ??= history[0];
  if (base.week === last.week) return null;
  return last.popularity - base.popularity;
}
