/**
 * Tools the remote MCP server exposes to AI agents (ADR 0008).
 *
 * They are the same building blocks as the site: Apple's published search
 * terms from the D1 store (as in the assistant, see ai-tools.ts) and live
 * App Store searches scored by the explorer's difficulty and verdict logic.
 * App Store searches go through the VPS proxy (itunes-proxy.ts) because
 * Apple rejects Worker IPs, and each one draws on the user's daily checks.
 *
 * Honesty rules carry over: popularity is Apple's relative 1–100 score, never
 * search volume; long-tail terms report only a ceiling; difficulty is an
 * estimate and always ships with its evidence.
 */
import { runAiTool, type AiToolData } from "./ai-tools";
import { consumeAgentChecks, refundAgentChecks, readAgentUsage, agentDailyChecks } from "./agent-usage";
import { optimizeKeywordField } from "./aso-optimizer";
import {
  SUPPORTED_COUNTRIES,
  assessOpportunity,
  fetchKeywordResults,
  estimateMetrics,
  type KeywordMetrics,
  type TopApp,
} from "./aso";
import {
  deriveKeywordSuggestions,
  lookupAppStoreApp,
  parseAppStoreIdInput,
  searchAppStoreCatalog,
} from "./itunes";
import { PLAN_NAMES, limitsForPlan, type PlanId } from "./plan";
import {
  DATASET_GENRES,
  GENRE_LABELS,
  datasetGenreFor,
  historyDelta,
  inferDatasetGenre,
  lookupTerm,
  normalizeTerm,
  type TermDataset,
} from "./search-terms";

export interface AgentToolContext {
  userId: string;
  plan: PlanId;
  db: D1Database;
  /** Apple's search-term store, or null when Apple Ads is not configured. */
  data: AiToolData | null;
  /** iTunes fetch through the VPS proxy, or null when it is not configured. */
  itunesFetch: typeof fetch | null;
  origin: string;
}

export interface AgentToolResult {
  structured: Record<string, unknown>;
  isError?: boolean;
}

export interface AgentToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    title: string;
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
}

const COUNTRY_CODES = SUPPORTED_COUNTRIES.map((country) => country.code);
const COUNTRY_SET = new Set(COUNTRY_CODES);
const MAX_ANALYZE_TERMS = 10;
const MAX_RANK_TERMS = 25;
const ANALYZE_RETRY_DELAYS_MS = [1_500];

const COUNTRY_PARAM = {
  type: "string",
  enum: COUNTRY_CODES,
  description: "App Store storefront (two-letter code). Defaults to US.",
};

const APP_ID_PARAM = {
  type: "string",
  description:
    "App Store app ID (digits, e.g. 1438388363) or an apps.apple.com link. Find it with search_apps.",
};

function tool(
  name: string,
  title: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  options: { appStore?: boolean } = {},
): AgentToolDefinition {
  return {
    name,
    title,
    description,
    inputSchema: { type: "object", properties, required, additionalProperties: false },
    annotations: {
      title,
      readOnlyHint: true,
      destructiveHint: false,
      // App Store results drift through the day; Apple's weekly data does not.
      idempotentHint: !options.appStore,
      openWorldHint: Boolean(options.appStore),
    },
  };
}

export const AGENT_TOOLS: AgentToolDefinition[] = [
  tool(
    "analyze_keywords",
    "Analyze App Store keywords",
    "The main AppClimb check. For each keyword: Apple's official popularity (1–100, Apple Ads; not search volume), an estimated difficulty (1–99) with its evidence from the live top 10, a verdict (Worth targeting / Long-tail win / Competitive / Low demand / Dominated) with the reason, and the apps ranking now. Pass app_id to also get that app's current rank for each keyword. Each keyword uses one of the user's daily checks.",
    {
      keywords: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: MAX_ANALYZE_TERMS,
        description: "Search terms as users type them, e.g. 'habit tracker'.",
      },
      country: COUNTRY_PARAM,
      app_id: APP_ID_PARAM,
    },
    ["keywords"],
    { appStore: true },
  ),
  tool(
    "get_keyword_popularity",
    "Apple keyword popularity",
    "Apple's official popularity (1–100 relative score from Apple Ads, not search volume) for up to 25 exact search terms, with the change over 4 and 12 weeks and, optionally, Apple's weekly history (12 weeks on Free, 52 on Pro). Terms Apple does not publish are long tail: popularity is at or below the returned ceiling. Free; does not use daily checks.",
    {
      keywords: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 25 },
      country: COUNTRY_PARAM,
      include_history: { type: "boolean", description: "Return Apple's weekly popularity history. Default false." },
    },
    ["keywords"],
  ),
  tool(
    "find_related_keywords",
    "Related App Store searches",
    "Search terms Apple publishes that share words with a seed keyword, with Apple popularity — the seed's own category first. Use it to find keyword ideas backed by real Apple demand. Free; does not use daily checks.",
    {
      keyword: { type: "string", description: "Seed keyword, e.g. 'meditation'." },
      country: COUNTRY_PARAM,
      limit: { type: "integer", minimum: 3, maximum: 25, description: "Default 15." },
    },
    ["keyword"],
  ),
  tool(
    "autocomplete_keywords",
    "App Store search autocomplete",
    "Published search terms that start with a prefix (like App Store autocomplete), most popular first, with Apple popularity. Free; does not use daily checks.",
    {
      prefix: { type: "string", description: "At least 2 characters, e.g. 'budg'." },
      country: COUNTRY_PARAM,
      limit: { type: "integer", minimum: 3, maximum: 20, description: "Default 12." },
    },
    ["prefix"],
  ),
  tool(
    "get_trending_keywords",
    "Trending App Store searches",
    "Search terms whose Apple popularity rose most over the last 4 weeks, plus terms new to Apple's published top lists, optionally within one category. Free; does not use daily checks.",
    {
      category: { type: "string", enum: [...DATASET_GENRES], description: "Apple category. Default: all categories." },
      country: COUNTRY_PARAM,
      limit: { type: "integer", minimum: 3, maximum: 20, description: "Default 10." },
    },
    [],
  ),
  tool(
    "search_apps",
    "Find an app on the App Store",
    "Search the App Store by name and get app IDs, developers and categories — use it to find the user's app or a competitor before analyze_keywords, check_app_rankings or get_app_keyword_ideas. Free; does not use daily checks.",
    {
      query: { type: "string", description: "App name or words from it." },
      country: COUNTRY_PARAM,
    },
    ["query"],
    { appStore: true },
  ),
  tool(
    "get_app_keyword_ideas",
    "Keyword ideas for an app",
    "Reads an app's App Store listing and proposes candidate keywords from its title, category and description, each with Apple popularity. Good first step for 'find keywords for my app'; then run analyze_keywords on the best ones. Uses one daily check.",
    { app_id: APP_ID_PARAM, country: COUNTRY_PARAM },
    ["app_id"],
    { appStore: true },
  ),
  tool(
    "check_app_rankings",
    "Check an app's keyword rankings",
    "Where an app ranks right now in App Store search for up to 25 keywords (position 1–200, or not in the top 200). Each keyword uses one of the user's daily checks.",
    {
      app_id: APP_ID_PARAM,
      keywords: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_RANK_TERMS },
      country: COUNTRY_PARAM,
    },
    ["app_id", "keywords"],
    { appStore: true },
  ),
  tool(
    "build_keyword_field",
    "Build the 100-character keyword field",
    "Packs chosen keywords into App Store Connect's 100-character keyword field: comma-separated without spaces, deduplicated, and without words already in the app's title or subtitle (Apple indexes those already). Free.",
    {
      keywords: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 100 },
      title: { type: "string", description: "The app's title (name), to drop words already indexed." },
      subtitle: { type: "string", description: "The app's subtitle." },
    },
    ["keywords"],
  ),
  tool(
    "get_account",
    "AppClimb account and limits",
    "The connected AppClimb account's plan, how many App Store checks are left today, and how much Apple history it can see.",
    {},
    [],
  ),
];

const TOOL_NAMES = new Set(AGENT_TOOLS.map((definition) => definition.name));

export function isAgentTool(name: string): boolean {
  return TOOL_NAMES.has(name);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

class ToolInputError extends Error {}

function fail(message: string, extra: Record<string, unknown> = {}): AgentToolResult {
  return { structured: { error: message, ...extra }, isError: true };
}

function pickCountry(raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "US";
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!COUNTRY_SET.has(code)) {
    throw new ToolInputError(`Unsupported storefront. Use one of: ${COUNTRY_CODES.join(", ")}.`);
  }
  return code;
}

function pickTerms(raw: unknown, max: number): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\n,]+/u) : [];
  const terms = [
    ...new Set(
      list
        .filter((term): term is string => typeof term === "string")
        .map((term) => normalizeTerm(term).slice(0, 80))
        .filter((term) => term.length >= 2),
    ),
  ];
  if (terms.length === 0) throw new ToolInputError("Pass at least one keyword of 2+ characters.");
  if (terms.length > max) throw new ToolInputError(`Pass at most ${max} keywords per call.`);
  return terms;
}

function pickAppId(raw: unknown): string {
  const id = typeof raw === "string" || typeof raw === "number" ? parseAppStoreIdInput(String(raw)) : null;
  if (!id) throw new ToolInputError("app_id must be an App Store app ID (digits) or an apps.apple.com link.");
  return id;
}

function needAppStore(ctx: AgentToolContext): typeof fetch {
  if (!ctx.itunesFetch) throw new ToolInputError("Live App Store checks are not available on this server right now.");
  return ctx.itunesFetch;
}

function isAppleBusy(error: unknown): boolean {
  return /app_store_catalog_unavailable:(429|403|502|503)/u.test(String(error)) || error instanceof TypeError;
}

function appleBusyMessage(): string {
  return "The App Store is rate-limiting searches right now. Wait about a minute and retry the remaining keywords.";
}

/** What to tell the agent when a live search failed part-way through a batch. */
function searchFailedMessage(error: unknown): string {
  return isAppleBusy(error)
    ? appleBusyMessage()
    : "An App Store search failed. The remaining keywords were not checked or charged; retry them in a moment.";
}

function limitMessage(ctx: AgentToolContext, limit: number): string {
  return ctx.plan === "pro"
    ? `Today's fair-use limit of ${limit} App Store checks is used up. It resets at 00:00 UTC.`
    : `The ${PLAN_NAMES[ctx.plan]} plan includes ${limit} App Store checks a day and today's are used up. They reset at 00:00 UTC; Pro is unlimited: ${ctx.origin}/pricing`;
}

async function takeChecks(ctx: AgentToolContext, wanted: number): Promise<{ granted: number; limit: number }> {
  const limit = agentDailyChecks(ctx.plan);
  const granted = await consumeAgentChecks(ctx.db, `user:${ctx.userId}`, wanted, limit);
  return { granted, limit };
}

function topAppSummary(app: TopApp) {
  return {
    rank: app.position,
    app_id: app.appStoreId,
    name: app.name,
    developer: app.developer,
    ratings: app.ratingsCount,
    rating: app.ratingAverage ? Number(app.ratingAverage.toFixed(1)) : null,
  };
}

function popularityFields(metrics: KeywordMetrics) {
  switch (metrics.popularitySource) {
    case "official":
      return { popularity: metrics.popularity, popularity_source: "apple_official" };
    case "longtail":
      return {
        popularity: null,
        popularity_at_most: metrics.popularity,
        popularity_source: "apple_long_tail",
        popularity_note: "Not in Apple's published top searches this week: low traffic, at or below this ceiling.",
      };
    default:
      return {
        popularity: null,
        popularity_source: "unavailable",
        popularity_note: "Apple's popularity data is unavailable for this storefront right now.",
      };
  }
}

/** Merge Apple's weekly score (or long-tail ceiling) into live metrics. */
function withApplePopularity(metrics: KeywordMetrics, dataset: TermDataset | null): KeywordMetrics {
  if (!dataset) return { ...metrics, popularitySource: "estimated" };
  const lookup = lookupTerm(dataset, metrics.keyword, inferDatasetGenre(metrics.topApps));
  if (lookup.found && lookup.row) {
    return { ...metrics, popularity: lookup.row.popularity, popularitySource: "official", dataWeek: dataset.week };
  }
  if (lookup.ceiling) {
    return { ...metrics, popularity: lookup.ceiling, popularitySource: "longtail", dataWeek: dataset.week };
  }
  return { ...metrics, popularitySource: "estimated" };
}

async function latestOrNull(ctx: AgentToolContext, country: string): Promise<TermDataset | null> {
  if (!ctx.data) return null;
  try {
    return await ctx.data.latest(country);
  } catch {
    return null;
  }
}

function parsedAiTool(content: string): AgentToolResult {
  const structured = JSON.parse(content) as Record<string, unknown>;
  return typeof structured.error === "string" ? { structured, isError: true } : { structured };
}

/* ------------------------------------------------------------------ */
/* Tools                                                                */
/* ------------------------------------------------------------------ */

async function analyzeKeywords(ctx: AgentToolContext, args: Record<string, unknown>): Promise<AgentToolResult> {
  const country = pickCountry(args.country);
  const terms = pickTerms(args.keywords, MAX_ANALYZE_TERMS);
  const appId = args.app_id === undefined || args.app_id === "" ? null : pickAppId(args.app_id);
  const fetchImpl = needAppStore(ctx);
  const { granted, limit } = await takeChecks(ctx, terms.length);
  if (granted === 0) return fail(limitMessage(ctx, limit), { limit_reached: true });

  const dataset = await latestOrNull(ctx, country);
  const results: Record<string, unknown>[] = [];
  const skipped: string[] = terms.slice(granted);
  let failed = 0;
  let failure: unknown = null;
  for (const term of terms.slice(0, granted)) {
    if (failed > 0) {
      skipped.push(term);
      continue;
    }
    try {
      let search: Awaited<ReturnType<typeof fetchKeywordResults>> | null = null;
      for (let attempt = 0; search === null; attempt += 1) {
        try {
          search = await fetchKeywordResults(term, country, { fetchImpl });
        } catch (error) {
          const delay = ANALYZE_RETRY_DELAYS_MS[attempt];
          if (delay === undefined || !isAppleBusy(error)) throw error;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      const metrics = withApplePopularity(estimateMetrics(term, country, search.apps, search.saturated), dataset);
      const opportunity = assessOpportunity(metrics);
      const yourRank = appId ? (search.apps.find((app) => app.appStoreId === appId)?.position ?? null) : undefined;
      results.push({
        keyword: term,
        ...popularityFields(metrics),
        difficulty: metrics.difficulty,
        difficulty_evidence: {
          top_results_sampled: metrics.evidence?.sampled ?? 0,
          median_ratings_top10: metrics.evidence?.medianRatings ?? 0,
          weakest_app_ratings: metrics.evidence?.weakestRatings ?? 0,
          weakest_app_rank: metrics.evidence?.weakestPosition ?? null,
          top10_names_matching_keyword: metrics.evidence?.titleMatches ?? 0,
          big_brand_apps_in_top10: metrics.evidence?.brandApps ?? 0,
          brand_search: metrics.evidence?.navigational ?? false,
        },
        verdict: opportunity.verdict,
        verdict_label: opportunity.label,
        reason: opportunity.reason,
        opportunity_score: opportunity.score,
        apps_in_results: metrics.results,
        results_capped_at_200: metrics.saturated,
        top_apps: search.apps.slice(0, 5).map(topAppSummary),
        ...(appId ? { app_rank: yourRank, app_rank_note: yourRank ? undefined : "Not in the top 200." } : {}),
      });
    } catch (error) {
      failed += 1;
      failure = error;
      skipped.push(term);
      console.error("[agent-tools] analyze failed:", error instanceof Error ? error.message : String(error));
    }
  }
  const unused = skipped.length - (terms.length - granted);
  if (unused > 0) await refundAgentChecks(ctx.db, `user:${ctx.userId}`, unused);
  if (results.length === 0) return fail(searchFailedMessage(failure), { not_checked: skipped });

  const notes: string[] = [];
  if (terms.length > granted) notes.push(limitMessage(ctx, limit));
  if (failed > 0) notes.push(searchFailedMessage(failure));
  return {
    structured: {
      storefront: country,
      apple_week: dataset?.week ?? null,
      app_id: appId ?? undefined,
      results,
      not_checked: skipped.length > 0 ? skipped : undefined,
      notes: notes.length > 0 ? notes : undefined,
      scale:
        "popularity: Apple's relative 1–100 search popularity (not volume). difficulty: AppClimb's 1–99 estimate from the top 10 results. opportunity_score: 0–100 balance of the two, a ranking aid.",
    },
  };
}

async function keywordPopularity(ctx: AgentToolContext, args: Record<string, unknown>): Promise<AgentToolResult> {
  const country = pickCountry(args.country);
  const terms = pickTerms(args.keywords, 25);
  if (!ctx.data) return fail("Apple's popularity data is not available on this server right now.");
  const dataset = await ctx.data.latest(country);
  if (!dataset) return fail(`Apple has not published search-term data for the ${country} storefront.`);
  const lookups = terms.map((term) => lookupTerm(dataset, term));
  const found = lookups.filter((lookup) => lookup.found).map((lookup) => normalizeTerm(lookup.term));
  const histories = found.length > 0 ? await ctx.data.histories(dataset, found).catch(() => new Map()) : new Map();
  const weeks = limitsForPlan(ctx.plan).historyWeeks;
  const withHistory = args.include_history === true;
  return {
    structured: {
      storefront: country,
      apple_week: dataset.week,
      results: lookups.map((lookup) => {
        if (lookup.found && lookup.row) {
          const history = histories.get(normalizeTerm(lookup.term)) ?? [];
          return {
            keyword: lookup.term,
            popularity: lookup.row.popularity,
            popularity_source: "apple_official",
            category: GENRE_LABELS[lookup.row.genre],
            rank_in_category: lookup.row.rankInGenre ?? null,
            change_4w: historyDelta(history, 4),
            change_12w: historyDelta(history, 12),
            history: withHistory ? history.slice(-weeks) : undefined,
          };
        }
        return {
          keyword: lookup.term,
          popularity: null,
          popularity_at_most: lookup.ceiling ?? null,
          popularity_source: "apple_long_tail",
          popularity_note: "Not in Apple's published top searches this week: low traffic, at or below this ceiling.",
        };
      }),
      history_weeks_available: withHistory ? weeks : undefined,
    },
  };
}

async function appleDataTool(
  ctx: AgentToolContext,
  aiTool: "related_keywords" | "autocomplete_terms" | "trending_keywords",
  args: Record<string, unknown>,
): Promise<AgentToolResult> {
  const country = pickCountry(args.country);
  if (!ctx.data) return fail("Apple's popularity data is not available on this server right now.");
  const aiArgs: Record<string, unknown> = { ...args, country };
  if (aiTool === "related_keywords") aiArgs.term = args.keyword;
  const outcome = await runAiTool(ctx.data, aiTool, JSON.stringify(aiArgs), { country });
  return parsedAiTool(outcome.content);
}

async function searchApps(ctx: AgentToolContext, args: Record<string, unknown>): Promise<AgentToolResult> {
  const country = pickCountry(args.country);
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (query.length < 2 || query.length > 80) throw new ToolInputError("query must be 2–80 characters.");
  const apps = await searchAppStoreCatalog(query, country, { fetchImpl: needAppStore(ctx) });
  return {
    structured: {
      storefront: country,
      query,
      apps: apps.map((app) => ({
        app_id: app.appStoreId,
        name: app.name,
        developer: app.developer,
        category: app.genre,
        bundle_id: app.bundleId || undefined,
        url: app.storeUrl || undefined,
      })),
    },
  };
}

async function appKeywordIdeas(ctx: AgentToolContext, args: Record<string, unknown>): Promise<AgentToolResult> {
  const country = pickCountry(args.country);
  const appId = pickAppId(args.app_id);
  const fetchImpl = needAppStore(ctx);
  const { granted, limit } = await takeChecks(ctx, 1);
  if (granted === 0) return fail(limitMessage(ctx, limit), { limit_reached: true });
  let raw;
  try {
    raw = await lookupAppStoreApp(appId, country, { fetchImpl });
  } catch (error) {
    await refundAgentChecks(ctx.db, `user:${ctx.userId}`, 1);
    if (isAppleBusy(error)) return fail(appleBusyMessage());
    throw error;
  }
  if (!raw.trackId) {
    await refundAgentChecks(ctx.db, `user:${ctx.userId}`, 1);
    return fail(`No app with ID ${appId} in the ${country} App Store. Check the ID with search_apps.`);
  }
  const name = String(raw.trackName ?? "");
  const genre = datasetGenreFor(raw.primaryGenreName);
  const dataset = await latestOrNull(ctx, country);
  const ideas = deriveKeywordSuggestions(raw, name, { limit: 20 }).map((suggestion) => {
    const lookup = dataset ? lookupTerm(dataset, suggestion.keyword, genre) : null;
    return {
      keyword: suggestion.keyword,
      source: suggestion.reason,
      ...(lookup?.found && lookup.row
        ? { popularity: lookup.row.popularity, popularity_source: "apple_official" }
        : lookup?.ceiling
          ? { popularity: null, popularity_at_most: lookup.ceiling, popularity_source: "apple_long_tail" }
          : { popularity: null, popularity_source: "unavailable" }),
    };
  });
  ideas.sort((left, right) => (right.popularity ?? 0) - (left.popularity ?? 0));
  const description = String(raw.description ?? "");
  return {
    structured: {
      storefront: country,
      apple_week: dataset?.week ?? null,
      app: {
        app_id: appId,
        name,
        developer: typeof raw.sellerName === "string" ? raw.sellerName : undefined,
        category: typeof raw.primaryGenreName === "string" ? raw.primaryGenreName : undefined,
        url: typeof raw.trackViewUrl === "string" ? raw.trackViewUrl : undefined,
        description_start: description ? description.slice(0, 600) : undefined,
      },
      ideas,
      next_step:
        "Pick the most relevant ideas (add your own phrases too), check related demand with find_related_keywords, then run analyze_keywords with app_id to see difficulty, verdict and the app's current rank.",
    },
  };
}

async function checkAppRankings(ctx: AgentToolContext, args: Record<string, unknown>): Promise<AgentToolResult> {
  const country = pickCountry(args.country);
  const appId = pickAppId(args.app_id);
  const terms = pickTerms(args.keywords, MAX_RANK_TERMS);
  const fetchImpl = needAppStore(ctx);
  const { granted, limit } = await takeChecks(ctx, terms.length);
  if (granted === 0) return fail(limitMessage(ctx, limit), { limit_reached: true });
  const rankings: Record<string, unknown>[] = [];
  const skipped = terms.slice(granted);
  let refunds = 0;
  let failure: unknown = null;
  for (const term of terms.slice(0, granted)) {
    // After one failure, stop searching: later keywords are skipped and refunded.
    if (refunds > 0) {
      skipped.push(term);
      refunds += 1;
      continue;
    }
    try {
      const { apps } = await fetchKeywordResults(term, country, { fetchImpl });
      const position = apps.find((app) => app.appStoreId === appId)?.position ?? null;
      rankings.push({ keyword: term, rank: position, ranked: position !== null, leader: apps[0]?.name ?? null });
    } catch (error) {
      failure = error;
      skipped.push(term);
      refunds += 1;
      console.error("[agent-tools] rank check failed:", error instanceof Error ? error.message : String(error));
    }
  }
  await refundAgentChecks(ctx.db, `user:${ctx.userId}`, refunds);
  if (rankings.length === 0) return fail(searchFailedMessage(failure), { not_checked: skipped });
  const notes: string[] = [];
  if (terms.length > granted) notes.push(limitMessage(ctx, limit));
  if (refunds > 0) notes.push(searchFailedMessage(failure));
  return {
    structured: {
      storefront: country,
      app_id: appId,
      checked_at: new Date().toISOString(),
      rankings,
      not_checked: skipped.length > 0 ? skipped : undefined,
      notes: notes.length > 0 ? notes : undefined,
      scale: "rank: position in App Store search results (1 = top). null = not in the top 200.",
    },
  };
}

function buildKeywordField(args: Record<string, unknown>): AgentToolResult {
  const keywords = Array.isArray(args.keywords)
    ? args.keywords.filter((keyword): keyword is string => typeof keyword === "string").slice(0, 100)
    : [];
  if (keywords.length === 0) throw new ToolInputError("Pass at least one keyword.");
  const result = optimizeKeywordField(keywords, {
    appTitle: typeof args.title === "string" ? args.title.slice(0, 100) : "",
    appSubtitle: typeof args.subtitle === "string" ? args.subtitle.slice(0, 100) : "",
  });
  return {
    structured: {
      keyword_field: result.optimized,
      characters: result.charCount,
      characters_left: result.remainingChars,
      included: result.keywordsIncluded,
      did_not_fit: result.keywordsTruncated,
      removed_duplicates: result.duplicateWordsRemoved,
      removed_already_in_title_or_subtitle: result.redundantWordsRemoved,
      note: "Apple combines single words from the title, subtitle and this field into phrases, so list words, not phrases.",
    },
  };
}

async function account(ctx: AgentToolContext): Promise<AgentToolResult> {
  const limits = limitsForPlan(ctx.plan);
  const daily = agentDailyChecks(ctx.plan);
  const used = await readAgentUsage(ctx.db, `user:${ctx.userId}`);
  return {
    structured: {
      plan: PLAN_NAMES[ctx.plan],
      app_store_checks_per_day: daily,
      app_store_checks_used_today: used,
      app_store_checks_left_today: Math.max(0, daily - used),
      resets: "00:00 UTC",
      apple_history_weeks: limits.historyWeeks,
      storefronts: COUNTRY_CODES,
      upgrade_url: ctx.plan === "pro" ? undefined : `${ctx.origin}/pricing`,
    },
  };
}

/** Run one tool. Never throws: problems come back as a tool error the agent can read. */
export async function runAgentTool(
  ctx: AgentToolContext,
  name: string,
  rawArgs: unknown,
): Promise<AgentToolResult> {
  const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? (rawArgs as Record<string, unknown>) : {};
  try {
    switch (name) {
      case "analyze_keywords":
        return await analyzeKeywords(ctx, args);
      case "get_keyword_popularity":
        return await keywordPopularity(ctx, args);
      case "find_related_keywords":
        return await appleDataTool(ctx, "related_keywords", args);
      case "autocomplete_keywords":
        return await appleDataTool(ctx, "autocomplete_terms", args);
      case "get_trending_keywords":
        return await appleDataTool(ctx, "trending_keywords", args);
      case "search_apps":
        return await searchApps(ctx, args);
      case "get_app_keyword_ideas":
        return await appKeywordIdeas(ctx, args);
      case "check_app_rankings":
        return await checkAppRankings(ctx, args);
      case "build_keyword_field":
        return buildKeywordField(args);
      case "get_account":
        return await account(ctx);
      default:
        return fail(`Unknown tool ${name}.`);
    }
  } catch (error) {
    if (error instanceof ToolInputError) return fail(error.message);
    if (isAppleBusy(error)) return fail(appleBusyMessage());
    console.error("[agent-tools] tool failed:", name, error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    return fail("Something went wrong on AppClimb's side. Try again in a moment.");
  }
}
