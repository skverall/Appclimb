// Public SEO pages built from Apple's published search terms:
// /keywords, /keywords/[country], /keywords/[country]/[category].

import { SUPPORTED_COUNTRIES, type SupportedCountry } from "@/lib/aso";
import {
  DATASET_GENRES,
  GENRE_LABELS,
  moversFrom,
  type DatasetGenre,
  type TermMover,
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
