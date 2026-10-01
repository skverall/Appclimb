// Server-only tools the ASO assistant can call. They read Apple's published
// App Store search terms (the same D1-backed weekly store behind the
// explorer), so every popularity number in a reply can come from Apple
// instead of the model's memory. Each call also yields a compact data card
// the chat shows under the answer.

import type { AiDataCard, AiToolName } from "@/lib/ai-chat";
import { SUPPORTED_COUNTRIES } from "@/lib/aso";
import {
  DATASET_GENRES,
  GENRE_LABELS,
  datasetGenreFor,
  historyDelta,
  isDatasetGenre,
  lookupTerm,
  moversFrom,
  normalizeTerm,
  relatedTermsFrom,
  suggestTermsFrom,
  termTokens,
  type DatasetGenre,
  type TermDataset,
  type TermHistoryPoint,
} from "@/lib/search-terms";
import {
  datasetWeeksBefore,
  latestDataset,
  termHistories,
  type StoreDeps,
} from "@/lib/search-terms-store";

export interface AiToolDefinition {
  type: "function";
  function: {
    name: AiToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const COUNTRY_PARAM = {
  type: "string",
  description:
    "Two-letter App Store storefront, e.g. US, GB, DE. Defaults to the user's tracked storefront.",
};

export const AI_TOOLS: AiToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "lookup_keywords",
      description:
        "Apple Ads popularity (Apple's official relative 1–100 score, not search volume) for exact App Store search terms in one storefront, with the change over 4 and 12 weeks. Terms Apple does not publish are long tail: their popularity is at or below the returned ceiling. Call this before quoting popularity for any term that is not already in the tracked-keyword context.",
      parameters: {
        type: "object",
        properties: {
          terms: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 20,
            description: "Exact search terms, lowercase, as a user would type them.",
          },
          country: COUNTRY_PARAM,
        },
        required: ["terms"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "related_keywords",
      description:
        "Published App Store search terms that share words with a seed keyword, with Apple popularity — terms from the app's own category first. Use this to find keyword ideas backed by real Apple demand.",
      parameters: {
        type: "object",
        properties: {
          term: { type: "string", description: "Seed keyword, e.g. 'habit tracker'." },
          country: COUNTRY_PARAM,
          limit: { type: "integer", minimum: 3, maximum: 25, description: "Default 15." },
        },
        required: ["term"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "autocomplete_terms",
      description:
        "Published search terms that start with a prefix (like App Store autocomplete), most popular first, with Apple popularity.",
      parameters: {
        type: "object",
        properties: {
          prefix: { type: "string", description: "At least 2 characters, e.g. 'car'." },
          country: COUNTRY_PARAM,
          limit: { type: "integer", minimum: 3, maximum: 20, description: "Default 12." },
        },
        required: ["prefix"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "trending_keywords",
      description:
        "Search terms whose Apple popularity rose most over the last 4 weeks, plus terms new to Apple's published top lists — optionally within one category.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [...DATASET_GENRES],
            description: "Apple category. Defaults to the tracked app's category.",
          },
          country: COUNTRY_PARAM,
          limit: { type: "integer", minimum: 3, maximum: 20, description: "Default 10." },
        },
      },
    },
  },
];

export interface AiToolOutcome {
  /** JSON handed back to the model. */
  content: string;
  /** What the chat shows, or null when there is nothing to show. */
  card: AiDataCard | null;
}

/** Data access the tools need; the store in production, fixtures in tests. */
export interface AiToolData {
  latest(country: string): Promise<TermDataset | null>;
  weeksBefore(dataset: TermDataset, weeks: number): Promise<TermDataset | null>;
  histories(dataset: TermDataset, terms: string[]): Promise<Map<string, TermHistoryPoint[]>>;
}

export function storeToolData(deps: StoreDeps): AiToolData {
  return {
    latest: (country) => latestDataset(deps, country),
    weeksBefore: (dataset, weeks) => datasetWeeksBefore(deps, dataset, weeks),
    histories: (dataset, terms) => termHistories(deps, dataset, terms),
  };
}

export interface AiToolDefaults {
  country: string;
  /** iTunes genre name or dataset genre of the tracked app. */
  genre?: string | null;
}

const SUPPORTED = new Set(SUPPORTED_COUNTRIES.map((country) => country.code));

function pickCountry(raw: unknown, fallback: string): string {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return SUPPORTED.has(code) ? code : fallback;
}

function pickLimit(raw: unknown, fallback: number, max: number): number {
  const value = Math.round(Number(raw));
  return Number.isFinite(value) && value >= 3 ? Math.min(max, value) : fallback;
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}") as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function quoted(text: string): string {
  const clean = text.trim().slice(0, 40);
  return `“${clean}”`;
}

/** Short progress line shown while a tool runs. */
export function aiToolStatus(name: string, rawArgs: string): string {
  const args = parseArgs(rawArgs);
  switch (name) {
    case "lookup_keywords": {
      const count = Array.isArray(args.terms) ? args.terms.length : 0;
      return count === 1
        ? `Checking Apple popularity for ${quoted(String((args.terms as unknown[])[0]))}`
        : `Checking Apple popularity for ${count || "a few"} keywords`;
    }
    case "related_keywords":
      return `Finding Apple searches related to ${quoted(String(args.term ?? ""))}`;
    case "autocomplete_terms":
      return `Looking up searches that start with ${quoted(String(args.prefix ?? ""))}`;
    case "trending_keywords": {
      const genre = isDatasetGenre(args.category) ? GENRE_LABELS[args.category] : null;
      return genre ? `Checking what is rising in ${genre}` : "Checking what is rising on the App Store";
    }
    default:
      return "Checking Apple data";
  }
}

function unavailable(country: string): AiToolOutcome {
  return {
    content: JSON.stringify({
      error: `Apple has not published search-term data for the ${country} storefront, so popularity is unknown there. Say so; do not guess numbers.`,
    }),
    card: null,
  };
}

async function lookupKeywords(
  data: AiToolData,
  args: Record<string, unknown>,
  defaults: AiToolDefaults,
): Promise<AiToolOutcome> {
  const country = pickCountry(args.country, defaults.country);
  const terms = [
    ...new Set(
      (Array.isArray(args.terms) ? args.terms : [])
        .filter((term): term is string => typeof term === "string")
        .map((term) => normalizeTerm(term).slice(0, 80))
        .filter((term) => term.length >= 2),
    ),
  ].slice(0, 20);
  if (terms.length === 0) {
    return { content: JSON.stringify({ error: "Pass at least one search term." }), card: null };
  }
  const dataset = await data.latest(country);
  if (!dataset) return unavailable(country);
  const lookups = terms.map((term) => lookupTerm(dataset, term, defaults.genre));
  const found = lookups.filter((lookup) => lookup.found).map((lookup) => normalizeTerm(lookup.term));
  let histories = new Map<string, TermHistoryPoint[]>();
  if (found.length > 0) {
    try {
      histories = await data.histories(dataset, found);
    } catch {
      // Trends are a bonus; the current scores still stand without them.
    }
  }
  const results = lookups.map((lookup) => {
    if (lookup.found && lookup.row) {
      const history = histories.get(normalizeTerm(lookup.term)) ?? [];
      return {
        term: lookup.term,
        source: "official",
        popularity: lookup.row.popularity,
        category: GENRE_LABELS[lookup.row.genre],
        rank_in_category: lookup.row.rankInGenre ?? null,
        change_4w: historyDelta(history, 4),
        change_12w: historyDelta(history, 12),
      };
    }
    return {
      term: lookup.term,
      source: "long_tail",
      popularity_at_most: lookup.ceiling ?? null,
      meaning: "Not in Apple's published top searches this week: low traffic, at or below the ceiling.",
    };
  });
  return {
    content: JSON.stringify({ storefront: country, week: dataset.week, results }),
    card: {
      tool: "lookup_keywords",
      title: "Apple popularity",
      country,
      week: dataset.week,
      rows: results.map((result) =>
        result.source === "official"
          ? {
              term: result.term,
              popularity: result.popularity as number,
              change: result.change_4w as number | null,
              category: result.category as string,
            }
          : {
              term: result.term,
              popularity: (result.popularity_at_most as number | null) ?? 0,
              longTail: true,
            },
      ),
    },
  };
}

async function relatedKeywords(
  data: AiToolData,
  args: Record<string, unknown>,
  defaults: AiToolDefaults,
): Promise<AiToolOutcome> {
  const country = pickCountry(args.country, defaults.country);
  const term = typeof args.term === "string" ? args.term.trim().slice(0, 80) : "";
  if (term.length < 2) {
    return { content: JSON.stringify({ error: "Pass a seed keyword." }), card: null };
  }
  const dataset = await data.latest(country);
  if (!dataset) return unavailable(country);
  const genre = dataset.byTerm.get(normalizeTerm(term))?.genre ?? datasetGenreFor(defaults.genre);
  const words = termTokens(term).length;
  const related = relatedTermsFrom(dataset, term, pickLimit(args.limit, 15, 25), genre);
  const inCategory = related.filter((row) => !genre || row.genre === genre);
  // Off-category terms that only share one word of a phrase ("car parking"
  // for "car dealer") are noise on the card; the model still sees them.
  const shown = related.filter(
    (row) => !genre || row.genre === genre || row.shared >= Math.max(1, words),
  );
  const label = genre ? GENRE_LABELS[genre] : null;
  const floor = genre ? dataset.floors[genre] : dataset.globalFloor;
  const note =
    inCategory.length === 0
      ? `Apple publishes no ${label ?? ""} search term sharing a word with “${term}” in ${country}: this niche is long tail there (popularity at or below ${floor ?? "the category floor"}). Stop searching for it; recommend specific long-tail phrases and confirm them with lookup_keywords.`
      : undefined;
  return {
    content: JSON.stringify({
      storefront: country,
      week: dataset.week,
      seed: term,
      app_category: label,
      related: related.map((row) => ({
        term: row.term,
        popularity: row.popularity,
        category: GENRE_LABELS[row.genre],
        same_category: !genre || row.genre === genre,
      })),
      note,
    }),
    card:
      shown.length > 0
        ? {
            tool: "related_keywords",
            title: `Apple searches related to ${quoted(term)}`,
            country,
            week: dataset.week,
            rows: shown.map((row) => ({
              term: row.term,
              popularity: row.popularity,
              category: GENRE_LABELS[row.genre],
            })),
          }
        : null,
  };
}

async function autocompleteTerms(
  data: AiToolData,
  args: Record<string, unknown>,
  defaults: AiToolDefaults,
): Promise<AiToolOutcome> {
  const country = pickCountry(args.country, defaults.country);
  const prefix = typeof args.prefix === "string" ? args.prefix.trim().slice(0, 60) : "";
  if (prefix.length < 2) {
    return { content: JSON.stringify({ error: "Pass a prefix of at least 2 characters." }), card: null };
  }
  const dataset = await data.latest(country);
  if (!dataset) return unavailable(country);
  const terms = suggestTermsFrom(dataset, prefix, pickLimit(args.limit, 12, 20));
  return {
    content: JSON.stringify({
      storefront: country,
      week: dataset.week,
      prefix,
      terms: terms.map((row) => ({
        term: row.term,
        popularity: row.popularity,
        category: GENRE_LABELS[row.genre],
      })),
    }),
    card:
      terms.length > 0
        ? {
            tool: "autocomplete_terms",
            title: `Searches starting with ${quoted(prefix)}`,
            country,
            week: dataset.week,
            rows: terms.map((row) => ({
              term: row.term,
              popularity: row.popularity,
              category: GENRE_LABELS[row.genre],
            })),
          }
        : null,
  };
}

async function trendingKeywords(
  data: AiToolData,
  args: Record<string, unknown>,
  defaults: AiToolDefaults,
): Promise<AiToolOutcome> {
  const country = pickCountry(args.country, defaults.country);
  const genre: DatasetGenre | null = isDatasetGenre(args.category)
    ? args.category
    : datasetGenreFor(defaults.genre);
  const limit = pickLimit(args.limit, 10, 20);
  const dataset = await data.latest(country);
  if (!dataset) return unavailable(country);
  const previous = await data.weeksBefore(dataset, 4).catch(() => null);
  const { rising, newcomers } = moversFrom(dataset, previous, { genre, limit });
  const label = genre ? GENRE_LABELS[genre] : "all categories";
  return {
    content: JSON.stringify({
      storefront: country,
      week: dataset.week,
      compared_with_week: previous?.week ?? null,
      category: label,
      rising: rising.map((row) => ({ term: row.term, popularity: row.popularity, change_4w: row.delta })),
      new_to_top_lists: newcomers.map((row) => ({ term: row.term, popularity: row.popularity })),
    }),
    card:
      rising.length + newcomers.length > 0
        ? {
            tool: "trending_keywords",
            title: `Rising in ${label}`,
            country,
            week: dataset.week,
            rows: [
              ...rising.map((row) => ({ term: row.term, popularity: row.popularity, change: row.delta })),
              ...newcomers.map((row) => ({ term: row.term, popularity: row.popularity, isNew: true })),
            ],
          }
        : null,
  };
}

/** Run one tool call. Never throws: failures go back to the model as JSON. */
export async function runAiTool(
  data: AiToolData,
  name: string,
  rawArgs: string,
  defaults: AiToolDefaults,
): Promise<AiToolOutcome> {
  const args = parseArgs(rawArgs);
  try {
    switch (name) {
      case "lookup_keywords":
        return await lookupKeywords(data, args, defaults);
      case "related_keywords":
        return await relatedKeywords(data, args, defaults);
      case "autocomplete_terms":
        return await autocompleteTerms(data, args, defaults);
      case "trending_keywords":
        return await trendingKeywords(data, args, defaults);
      default:
        return { content: JSON.stringify({ error: `Unknown tool ${name}.` }), card: null };
    }
  } catch (error) {
    console.error(
      "[ai-tools] tool failed:",
      name,
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
    return {
      content: JSON.stringify({
        error: "Apple data could not be loaded right now. Say so briefly and continue without numbers.",
      }),
      card: null,
    };
  }
}
