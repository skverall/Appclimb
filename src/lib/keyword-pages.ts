// Public SEO pages built from Apple's published search terms:
// /keywords, /keywords/[country], /keywords/[country]/[category].

import { SUPPORTED_COUNTRIES, type SupportedCountry } from "@/lib/aso";
import {
  DATASET_GENRES,
  GENRE_LABELS,
  moversFrom,
  normalizeTerm,
  relatedTermsFrom,
  type DatasetGenre,
  type RelatedTerm,
  type TermDataset,
  type TermHistoryPoint,
  type TermMover,
  type TermRow,
} from "@/lib/search-terms";

/** Apple Ads publishes no search terms for these storefronts. */
const NO_DATA_COUNTRIES = new Set(["RU"]);

export const PAGE_COUNTRIES: readonly SupportedCountry[] = SUPPORTED_COUNTRIES.filter(
  (country) => !NO_DATA_COUNTRIES.has(country.code),
);

export const GENRE_SLUGS: Record<DatasetGenre, string> = {
  BUSINESS: "business",
  EDUCATION: "education",
  ENTERTAINMENT: "entertainment",
  FINANCE: "finance",
  FOOD_DRINK: "food-drink",
  GAMES: "games",
  HEALTH_FITNESS: "health-fitness",
  LIFESTYLE: "lifestyle",
  NEW_PUBLICATION: "news-magazines",
  PHOTO_VIDEO: "photo-video",
  PRODUCTIVITY_UTILITIES: "productivity-utilities",
  SHOPPING: "shopping",
  SOCIAL_NETWORKING: "social-networking",
  SPORTS: "sports",
  TRAVEL: "travel",
};

const SLUG_TO_GENRE = new Map<string, DatasetGenre>(
  DATASET_GENRES.map((genre) => [GENRE_SLUGS[genre], genre]),
);

export function genreFromSlug(slug: string): DatasetGenre | null {
  return SLUG_TO_GENRE.get(slug.toLocaleLowerCase()) ?? null;
}

const WITH_ARTICLE = new Set(["US", "GB", "NL"]);

/** "the United States", "Germany" — for running text. */
export function countryInText(country: SupportedCountry): string {
  return WITH_ARTICLE.has(country.code) ? `the ${country.label}` : country.label;
}

export function countryFromSlug(slug: string): SupportedCountry | null {
  const code = slug.toUpperCase();
  return PAGE_COUNTRIES.find((country) => country.code === code) ?? null;
}

export function countryPath(country: string): string {
  return `/keywords/${country.toLowerCase()}`;
}

export function categoryPath(country: string, genre: DatasetGenre): string {
  return `${countryPath(country)}/${GENRE_SLUGS[genre]}`;
}

/** URL slug for a published search term: lowercase, words joined by "-". */
export function termSlug(term: string): string {
  return normalizeTerm(term).replace(/ /gu, "-");
}

/** Per-term page: /keywords/us/health-fitness/habit-tracker. */
export function termPath(country: string, genre: DatasetGenre, term: string): string {
  return `${categoryPath(country, genre)}/${encodeURIComponent(termSlug(term))}`;
}

/** Route params arrive percent-encoded for non-ASCII terms on some runtimes. */
export function decodeTermSlug(raw: string): string {
  let slug = raw;
  if (slug.includes("%")) {
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // Keep the raw slug; it simply won't match a term.
    }
  }
  return slug.toLocaleLowerCase();
}

/** Explorer deep link that analyzes the term in that storefront. */
export function explorerLink(term: string, country: string): string {
  return `/?kw=${encodeURIComponent(term)}&country=${country}`;
}

export function categoryLabel(genre: DatasetGenre): string {
  return GENRE_LABELS[genre];
}

/** Every country × category URL for the sitemap. */
export function allKeywordPagePaths(): string[] {
  const paths = ["/keywords"];
  for (const country of PAGE_COUNTRIES) {
    paths.push(countryPath(country.code));
    for (const genre of DATASET_GENRES) paths.push(categoryPath(country.code, genre));
  }
  return paths;
}

export interface KeywordPageData {
  week: string;
  compareWeek: string | null;
  termCount: number;
  top: TermMover[];
  rising: TermMover[];
  newcomers: TermMover[];
  /** Terms per category (country pages link to the busiest first). */
  genreCounts: Partial<Record<DatasetGenre, number>>;
}

/**
 * Shape a storefront's latest week (and the week four weeks earlier) into
 * page data. Pure, so it can be unit-tested with fixture datasets.
 */
export function buildKeywordPageData(
  current: Parameters<typeof moversFrom>[0],
  previous: Parameters<typeof moversFrom>[1],
  genre: DatasetGenre | null,
  limits: { top: number; movers: number } = { top: 100, movers: 15 },
): KeywordPageData | null {
  const genreCounts: Partial<Record<DatasetGenre, number>> = {};
  for (const row of current.rows) genreCounts[row.genre] = (genreCounts[row.genre] ?? 0) + 1;
  const termCount = genre ? genreCounts[genre] ?? 0 : current.rows.length;
  if (termCount === 0) return null;
  const top = moversFrom(current, previous, { genre, limit: limits.top }).top;
  const { rising, newcomers } = moversFrom(current, previous, { genre, limit: limits.movers });
  return {
    week: current.week,
    compareWeek: previous?.week ?? null,
    termCount,
    top,
    rising,
    newcomers,
    genreCounts,
  };
}

export function formatWeekLong(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return week;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export interface TermPageData {
  term: string;
  genre: DatasetGenre;
  week: string;
  compareWeek: string | null;
  popularity: number;
  rankInGenre: number | null;
  /** Published terms in this genre this week (Apple publishes up to 500). */
  genreSize: number;
  /** Popularity four weeks earlier; null when the term was not published then. */
  previousPopularity: number | null;
  /** The same term in other categories, most popular first. */
  otherGenres: Array<{ genre: DatasetGenre; popularity: number; rankInGenre: number | null }>;
  related: RelatedTerm[];
  /** Up to 52 weeks of Apple's score, oldest first (may be empty). */
  history: TermHistoryPoint[];
}

export type TermResolution =
  | { kind: "found"; row: TermRow; primaryGenre: DatasetGenre }
  | { kind: "missing" };

/**
 * Find a term by its slug in one category's published list. `primaryGenre`
 * is the category where the term scores highest — its canonical page.
 */
export function resolveTermSlug(
  dataset: TermDataset,
  genre: DatasetGenre,
  slug: string,
): TermResolution {
  const wanted = decodeTermSlug(slug);
  let match: TermRow | null = null;
  for (const row of dataset.rows) {
    if (row.genre === genre && termSlug(row.term) === wanted) {
      match = row;
      break;
    }
  }
  if (!match) {
    // The term may be published under another category only.
    for (const row of dataset.rows) {
      if (termSlug(row.term) === wanted) {
        match = row;
        break;
      }
    }
  }
  if (!match) return { kind: "missing" };
  const primary = dataset.byTerm.get(normalizeTerm(match.term));
  return { kind: "found", row: match, primaryGenre: primary?.genre ?? match.genre };
}

/** Shape one term's page from the week's dataset (pure; unit-tested). */
export function buildTermPageData(
  current: TermDataset,
  previous: TermDataset | null,
  row: TermRow,
  history: readonly TermHistoryPoint[],
  options: { related?: number } = {},
): TermPageData {
  const key = normalizeTerm(row.term);
  const sameTerm = current.rows.filter((item) => normalizeTerm(item.term) === key);
  const before = previous?.rows.find(
    (item) => item.genre === row.genre && normalizeTerm(item.term) === key,
  );
  return {
    term: row.term,
    genre: row.genre,
    week: current.week,
    compareWeek: previous?.week ?? null,
    popularity: row.popularity,
    rankInGenre: row.rankInGenre ?? null,
    genreSize: current.rows.filter((item) => item.genre === row.genre).length,
    previousPopularity: before ? before.popularity : null,
    otherGenres: sameTerm
      .filter((item) => item.genre !== row.genre)
      .sort((left, right) => right.popularity - left.popularity)
      .map((item) => ({ genre: item.genre, popularity: item.popularity, rankInGenre: item.rankInGenre ?? null })),
    related: relatedTermsFrom(current, row.term, options.related ?? 16, row.genre),
    history: [...history],
  };
}

/** Terms near this one in its category, to warm their history in one Apple call. */
export function historyNeighbors(dataset: TermDataset, row: TermRow, count = 24): string[] {
  const list = dataset.rows
    .filter((item) => item.genre === row.genre)
    .sort((left, right) => (left.rankInGenre ?? 9999) - (right.rankInGenre ?? 9999));
  const index = list.findIndex((item) => normalizeTerm(item.term) === normalizeTerm(row.term));
  if (index < 0) return [];
  const start = Math.max(0, Math.min(index - Math.floor(count / 2), list.length - count - 1));
  return list
    .slice(start, start + count + 1)
    .map((item) => item.term)
    .filter((term) => normalizeTerm(term) !== normalizeTerm(row.term))
    .slice(0, count);
}

/** Canonical term-page paths for each category's top `perCategory` terms. */
export function termSitemapEntries(dataset: TermDataset, perCategory: number): string[] {
  const paths: string[] = [];
  for (const genre of DATASET_GENRES) {
    const rows = dataset.rows
      .filter((row) => row.genre === genre)
      .sort((left, right) => (left.rankInGenre ?? 9999) - (right.rankInGenre ?? 9999) || right.popularity - left.popularity)
      .slice(0, perCategory);
    for (const row of rows) {
      // Only the category where the term scores highest is canonical.
      if (dataset.byTerm.get(normalizeTerm(row.term))?.genre !== genre) continue;
      paths.push(termPath(dataset.country, genre, row.term));
    }
  }
  return paths;
}
