// App Store keyword scoring, client-side.
//
// Difficulty is always an estimate, computed from the apps that rank for the
// term in Apple's public iTunes Search API (the only catalog source a browser
// can reach). It is explainable: the evidence behind it travels with it.
//
// Popularity comes from Apple: POST /api/popularity returns Apple Ads'
// official relative score (1–100) for terms Apple publishes, or a ceiling for
// long-tail terms below Apple's published range. Only when that service is
// unreachable does a rough iTunes-based estimate stand in, labeled "Est.".
// None of these numbers is search volume.
//
// Local history: one real snapshot per keyword per day. Nothing is
// backfilled or invented; the long-range popularity trend is Apple's own
// weekly history.

import {
  boundedStorefront,
  requestSignal,
  storefrontLang,
  type CatalogApp,
} from "@/lib/itunes";
import { csvEscape } from "@/lib/file";

export const ITUNES_ORIGIN = "https://itunes.apple.com";

export interface SupportedCountry {
  code: string;
  label: string;
  flag: string;
}

export const SUPPORTED_COUNTRIES: readonly SupportedCountry[] = [
  { code: "US", label: "United States", flag: "🇺🇸" },
  { code: "GB", label: "United Kingdom", flag: "🇬🇧" },
  { code: "DE", label: "Germany", flag: "🇩🇪" },
  { code: "FR", label: "France", flag: "🇫🇷" },
  { code: "RU", label: "Russia", flag: "🇷🇺" },
  { code: "JP", label: "Japan", flag: "🇯🇵" },
  { code: "CA", label: "Canada", flag: "🇨🇦" },
  { code: "AU", label: "Australia", flag: "🇦🇺" },
  { code: "IN", label: "India", flag: "🇮🇳" },
  { code: "BR", label: "Brazil", flag: "🇧🇷" },
  { code: "MX", label: "Mexico", flag: "🇲🇽" },
  { code: "KR", label: "South Korea", flag: "🇰🇷" },
  { code: "IT", label: "Italy", flag: "🇮🇹" },
  { code: "ES", label: "Spain", flag: "🇪🇸" },
  { code: "NL", label: "Netherlands", flag: "🇳🇱" },
  { code: "SE", label: "Sweden", flag: "🇸🇪" },
] as const;

export interface TopApp {
  appStoreId: string;
  name: string;
  developer: string;
  genre: string;
  iconUrl: string;
  storeUrl: string;
  ratingsCount: number;
  ratingAverage: number;
  position: number;
}

/**
 * official  — Apple Ads published score for this exact term.
 * longtail  — Apple does not publish the term: popularity is at or below
 *             `popularityCeiling` (the lowest published score in its genre).
 * estimated — Apple data unavailable; rough iTunes-based stand-in.
 */
export type PopularitySource = "official" | "longtail" | "estimated";

export interface PopularityHistoryPoint {
  /** Sunday that starts the Apple Ads week (YYYY-MM-DD). */
  week: string;
  popularity: number;
}

/** What the difficulty score is made of — shown next to it in the UI. */
export interface DifficultyEvidence {
  /** Top results considered (at most 10). */
  sampled: number;
  medianRatings: number;
  /** Fewest ratings among the top 10 — the weakest app already ranking. */
  weakestRatings: number;
  weakestPosition: number | null;
  /** Top-10 apps whose name contains the phrase or every word of it. */
  titleMatches: number;
  /** Top-10 apps from big-brand publishers. */
  brandApps: number;
  /** #1 is an entrenched app named after the term (a brand search). */
  navigational: boolean;
}

export interface KeywordMetrics {
  keyword: string;
  country: string;
  /**
   * 1–100. Official Apple Ads score; for long-tail terms the ceiling it sits
   * at or below; otherwise the rough estimate. See popularitySource.
   */
  popularity: number;
  popularitySource?: PopularitySource;
  /** Long-tail only: Apple's lowest published score in the term's genre. */
  popularityCeiling?: number;
  /** Apple's weekly popularity for this term, oldest first (real data). */
  popularityHistory?: PopularityHistoryPoint[];
  /** Apple Ads week the official numbers describe (Sunday, YYYY-MM-DD). */
  dataWeek?: string;
  /** Apple Ads genre token used for the official lookup, if any. */
  appleGenre?: string;
  searchPopularityInGenre?: number;
  searchPopularity1to5?: number;
  rankInGenre?: number;
  /** Estimated 0–100 difficulty (barrier to rank in top results). */
  difficulty: number;
  /** Inputs behind the difficulty estimate. Absent on restored rows. */
  evidence?: DifficultyEvidence;
  /** Number of apps returned by the search (capped at 200 by iTunes). */
  results: number;
  /** True when the result list hit the 200-item cap (heavy competition). */
  saturated: boolean;
  topApps: TopApp[];
  sampledAt: string;
  /**
   * True when rebuilt from a stored snapshot after a reload instead of a
   * live check: topApps is empty (and results is 0 when the legacy record
   * predates lastCheck persistence).
   */
  restored?: boolean;
}

export interface KeywordHistoryPoint {
  /** Local date, YYYY-MM-DD. */
  date: string;
  popularity: number;
  difficulty: number;
  popularitySource?: PopularitySource;
}

export interface KeywordRecord {
  keyword: string;
  country: string;
  firstSeen: string;
  /**
   * Legacy flag: records written before October 2026 started with an
   * invented 29-day baseline. Those points are dropped on load and this is
   * always false for new records.
   */
  backfilled: boolean;
  /** Real daily measurements, sorted ascending by date. */
  history: KeywordHistoryPoint[];
  /**
   * Results/saturated of the most recent check. Kept alongside the history
   * point (which already has popularity/difficulty/source) so the table can
   * be restored fully after a reload. Absent on legacy records.
   */
  lastCheck?: {
    results: number;
    saturated: boolean;
    popularityCeiling?: number;
    dataWeek?: string;
    evidence?: DifficultyEvidence;
    appleGenre?: string;
    rankInGenre?: number;
  };
  /** Latest Apple weekly popularity history (official terms only). */
  popularityHistory?: PopularityHistoryPoint[];
}

export const HISTORY_DAYS = 30;
/** Stored history cap: 90-day Pro view plus a margin. */
export const MAX_STORED_HISTORY_DAYS = 92;
export const SEARCH_LIMIT = 200;

/* ------------------------------------------------------------------ */
/* Raw iTunes fetch                                                    */
/* ------------------------------------------------------------------ */

interface RawSearchResult {
  trackId?: number;
  trackName?: string;
  sellerName?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
  userRatingCount?: number;
  averageUserRating?: number;
}

export function toTopApp(
  result: RawSearchResult,
  position: number,
): TopApp | null {
  const appStoreId = Number(result.trackId);
  const name =
    typeof result.trackName === "string" ? result.trackName.trim() : "";
  if (!Number.isInteger(appStoreId) || appStoreId <= 0 || !name) return null;
  return {
    appStoreId: String(appStoreId),
    name: name.slice(0, 120),
    developer:
      typeof result.sellerName === "string"
        ? result.sellerName.slice(0, 160)
        : "",
    genre:
      typeof result.primaryGenreName === "string"
        ? result.primaryGenreName.slice(0, 80)
        : "",
    iconUrl:
      typeof result.artworkUrl100 === "string" ? result.artworkUrl100 : "",
    storeUrl:
      typeof result.trackViewUrl === "string" ? result.trackViewUrl : "",
    ratingsCount: Math.max(0, Number(result.userRatingCount) || 0),
    ratingAverage: Math.min(
      5,
      Math.max(0, Number(result.averageUserRating) || 0),
    ),
    position,
  };
}

/** Fetch the full result set for one keyword from the public catalog. */
export async function fetchKeywordResults(
  keyword: string,
  country: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<{ apps: TopApp[]; saturated: boolean }> {
  const term = keyword.trim();
  if (term.length < 2 || term.length > 80) {
    throw new Error("invalid_keyword_search");
  }
  const storefront = boundedStorefront(country);
  const parameters = new URLSearchParams({
    term,
    country: storefront,
    lang: storefrontLang(storefront),
    media: "software",
    entity: "software",
    limit: String(SEARCH_LIMIT),
    explicit: "No",
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${ITUNES_ORIGIN}/search?${parameters}`, {
    headers: { accept: "application/json" },
    signal: requestSignal(options.signal),
  });
  if (!response.ok) {
    throw new Error(`app_store_catalog_unavailable:${response.status}`);
  }
  const payload = (await response.json()) as { results?: RawSearchResult[] };
  const results = Array.isArray(payload.results) ? payload.results : [];
  const apps = results
    .map((result, index) => toTopApp(result, index + 1))
    .filter((app): app is TopApp => app !== null);
  return { apps, saturated: results.length >= SEARCH_LIMIT };
}

/* ------------------------------------------------------------------ */
/* Estimation heuristics                                               */
/* ------------------------------------------------------------------ */

/** Sellers whose presence in the top 10 signals a hard, fought-over term. */
const MEGA_BRANDS = new Set([
  "google",
  "meta platforms",
  "facebook",
  "instagram",
  "amazon",
  "apple",
  "microsoft",
  "adobe",
  "netflix",
  "spotify",
  "tiktok",
  "youtube",
  "samsung",
  "linkedin",
  "uber",
  "airbnb",
  "telegram",
  "whatsapp",
  "zoom",
  "slack",
  "pinterest",
  "snap",
  "discord",
  "roblox",
  "canva",
  "duolingo",
  "dropbox",
  "notion labs",
  "figma",
  "x corp",
]);

function clampScore(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

function normalizeForMatch(value: string): string {
  return ` ${value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
}

/**
 * How well an app's name targets the keyword: 1 = the exact phrase,
 * 0.75 = every word (plurals count), partial credit for some words.
 */
export function titleMatchScore(title: string, keyword: string): number {
  const haystack = normalizeForMatch(title);
  const phrase = normalizeForMatch(keyword).trim();
  if (!phrase) return 0;
  if (haystack.includes(` ${phrase} `)) return 1;
  const words = phrase.split(" ");
  const hits = words.filter(
    (word) =>
      haystack.includes(` ${word} `) ||
      haystack.includes(` ${word}s `) ||
      (word.endsWith("s") && haystack.includes(` ${word.slice(0, -1)} `)),
  ).length;
  if (hits === words.length) return 0.75;
  return hits > 0 ? (0.35 * hits) / words.length : 0;
}

/** 0–1 strength of an incumbent from its lifetime ratings (log scale). */
export function ratingStrength(ratingsCount: number): number {
  // 10 ratings → 0, 1k → 0.44, 10k → 0.67, 100k → 0.89, ~300k+ → 1.
  return Math.max(0, Math.min(1, (Math.log10(1 + Math.max(0, ratingsCount)) - 1) / 4.5));
}

const POSITION_WEIGHTS = Array.from({ length: 10 }, (_, index) => 1 / Math.sqrt(index + 1));
const POSITION_WEIGHT_SUM = POSITION_WEIGHTS.reduce((sum, weight) => sum + weight, 0);

/**
 * Difficulty 1–99 from the top 10 results: each position is weighted
 * (#1 counts most), and each incumbent scores by rating strength (or being a
 * big brand), discounted when its name does not target the keyword. Fewer
 * than 10 results leaves empty slots that count as zero.
 */
export function scoreDifficulty(
  keyword: string,
  apps: readonly TopApp[],
): { difficulty: number; evidence: DifficultyEvidence } {
  const top = apps.slice(0, 10);
  let weighted = 0;
  let titleMatches = 0;
  let brandApps = 0;
  top.forEach((app, index) => {
    const brand = MEGA_BRANDS.has(app.developer.toLocaleLowerCase());
    if (brand) brandApps += 1;
    const match = titleMatchScore(app.name, keyword);
    if (match >= 0.75) titleMatches += 1;
    const strength = Math.max(ratingStrength(app.ratingsCount), brand ? 1 : 0);
    weighted += POSITION_WEIGHTS[index] * strength * (0.6 + 0.4 * match);
  });

  const leader = top[0];
  const navigational = Boolean(
    leader &&
      leader.ratingsCount >= 250_000 &&
      normalizeForMatch(leader.name).startsWith(normalizeForMatch(keyword)),
  );

  const ratings = top.map((app) => app.ratingsCount).sort((left, right) => left - right);
  const median =
    ratings.length === 0
      ? 0
      : ratings.length % 2 === 1
        ? ratings[(ratings.length - 1) / 2]
        : Math.round((ratings[ratings.length / 2 - 1] + ratings[ratings.length / 2]) / 2);
  let weakest: TopApp | null = null;
  for (const app of top) {
    if (!weakest || app.ratingsCount < weakest.ratingsCount) weakest = app;
  }

  let difficulty = top.length === 0 ? 1 : clampScore((100 * weighted) / POSITION_WEIGHT_SUM);
  if (navigational) difficulty = Math.max(difficulty, 92);

  return {
    difficulty,
    evidence: {
      sampled: top.length,
      medianRatings: median,
      weakestRatings: weakest?.ratingsCount ?? 0,
      weakestPosition: weakest?.position ?? null,
      titleMatches,
      brandApps,
      navigational,
    },
  };
}

/**
 * Rough popularity stand-in used only when Apple's data is unreachable:
 * how crowded the term is and how strong the apps chasing it are. Labeled
 * "Est." everywhere it appears.
 */
export function roughPopularity(apps: readonly TopApp[], saturated: boolean): number {
  if (apps.length === 0) return 1;
  const competition = saturated ? 1 : Math.sqrt(apps.length / SEARCH_LIMIT);
  const top = apps.slice(0, 10);
  const averageRatings = top.reduce((sum, app) => sum + app.ratingsCount, 0) / top.length;
  const strength = Math.min(1, Math.log10(1 + averageRatings) / 5);
  return clampScore(10 + competition * 45 + strength * 30);
}

/**
 * Score raw search results. Pure — no network, no randomness — so the same
 * results always give the same numbers.
 */
export function estimateMetrics(
  keyword: string,
  country: string,
  apps: TopApp[],
  saturated: boolean,
  sampledAt = new Date().toISOString(),
): KeywordMetrics {
  const { difficulty, evidence } = scoreDifficulty(keyword, apps);
  return {
    keyword: keyword.trim(),
    country,
    popularity: roughPopularity(apps, saturated),
    popularitySource: "estimated",
    difficulty,
    evidence,
    results: apps.length,
    saturated,
    topApps: apps.slice(0, 10),
    sampledAt,
  };
}

/** Fetch + estimate in one step. */
export async function estimateKeyword(
  keyword: string,
  country: string,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    /** Waits before each retry; Apple rate-limits bursts briefly. */
    retryDelaysMs?: readonly number[];
  } = {},
): Promise<KeywordMetrics> {
  const delays = options.retryDelaysMs ?? [];
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { apps, saturated } = await fetchKeywordResults(keyword, country, options);
      return estimateMetrics(keyword, country, apps, saturated);
    } catch (error) {
      const delay = delays[attempt];
      const transient =
        error instanceof TypeError ||
        /app_store_catalog_unavailable:(429|403|5\d\d)/u.test(String(error));
      if (delay === undefined || !transient || options.signal?.aborted) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/* ------------------------------------------------------------------ */
/* History (localStorage)                                              */
/* ------------------------------------------------------------------ */

export function historyStorageKey(keyword: string, country: string): string {
  return `appclimb:kw:v1:${country}:${keyword.trim().toLocaleLowerCase()}`;
}

export function listStorageKey(country: string): string {
  return `appclimb:kw:v1:list:${country}`;
}

export type KeywordStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

/** Structural check for a persisted keyword record (used by load + restore). */
export function isKeywordRecord(parsed: unknown): parsed is KeywordRecord {
  if (typeof parsed !== "object" || parsed === null) return false;
  const record = parsed as Record<string, unknown>;
  return (
    typeof record.keyword === "string" &&
    typeof record.country === "string" &&
    Array.isArray(record.history)
  );
}

/** Remove a keyword's persisted history entirely. */
export function deleteRecord(
  storage: KeywordStorage,
  keyword: string,
  country: string,
): void {
  storage.removeItem(historyStorageKey(keyword, country));
}

export function toLocalDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Records saved before October 2026 began with 29 invented "baseline" days
 * (a pseudo-random walk). Those points carry no popularitySource; real
 * measurements always do. Keep only real points.
 */
export function dropLegacyBackfill(record: KeywordRecord): KeywordRecord {
  if (!record.backfilled) return record;
  return {
    ...record,
    backfilled: false,
    history: record.history.filter((point) => point.popularitySource !== undefined),
  };
}

export function loadRecord(
  storage: KeywordStorage,
  keyword: string,
  country: string,
): KeywordRecord | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(historyStorageKey(keyword, country));
  } catch {
    // Storage blocked (private mode) — treat as no record.
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isKeywordRecord(parsed) ? dropLegacyBackfill(parsed) : null;
  } catch {
    return null;
  }
}

export function saveRecord(
  storage: KeywordStorage,
  record: KeywordRecord,
): void {
  try {
    storage.setItem(
      historyStorageKey(record.keyword, record.country),
      JSON.stringify(record),
    );
  } catch {
    // Storage full or unavailable — fail open rather than break the tool.
  }
}

/** Append (or refresh) today's measured snapshot and persist the record. */
export function recordSnapshot(
  storage: KeywordStorage,
  metrics: KeywordMetrics,
): KeywordRecord {
  const existing = loadRecord(storage, metrics.keyword, metrics.country);
  const today = toLocalDate();
  const history = existing?.history ?? [];
  const last = history[history.length - 1];
  if (last && last.date === today) {
    // Same-day refresh: keep the day's single measured point, update values.
    history[history.length - 1] = {
      date: today,
      popularity: metrics.popularity,
      difficulty: metrics.difficulty,
      popularitySource: metrics.popularitySource,
    };
  } else {
    history.push({
      date: today,
      popularity: metrics.popularity,
      difficulty: metrics.difficulty,
      popularitySource: metrics.popularitySource,
    });
  }
  // Local history is capped (90-day Pro view + margin) so a long-lived
  // keyword cannot grow without bound and eventually exhaust localStorage
  // for every other keyword in the list.
  if (history.length > MAX_STORED_HISTORY_DAYS) {
    history.splice(0, history.length - MAX_STORED_HISTORY_DAYS);
  }
  const record: KeywordRecord = {
    keyword: metrics.keyword.trim(),
    country: metrics.country,
    firstSeen: existing?.firstSeen ?? today,
    backfilled: false,
    history,
    lastCheck: {
      results: metrics.results,
      saturated: metrics.saturated,
      popularityCeiling: metrics.popularityCeiling,
      dataWeek: metrics.dataWeek,
      evidence: metrics.evidence,
      appleGenre: metrics.appleGenre,
      rankInGenre: metrics.rankInGenre,
    },
    popularityHistory:
      metrics.popularityHistory && metrics.popularityHistory.length > 0
        ? metrics.popularityHistory
        : existing?.popularityHistory,
  };
  saveRecord(storage, record);
  return record;
}

/**
 * Rebuild display metrics from a stored record's latest snapshot so the
 * table survives a page reload. Top apps are not persisted: they come back
 * on the next check. Returns null when the record has no history yet.
 */
export function restoreMetricsFromRecord(
  record: KeywordRecord,
): KeywordMetrics | null {
  const last = record.history[record.history.length - 1];
  if (!last) return null;
  return {
    keyword: record.keyword,
    country: record.country,
    popularity: last.popularity,
    difficulty: last.difficulty,
    popularitySource: last.popularitySource,
    popularityCeiling: record.lastCheck?.popularityCeiling,
    popularityHistory: record.popularityHistory,
    dataWeek: record.lastCheck?.dataWeek,
    evidence: record.lastCheck?.evidence,
    appleGenre: record.lastCheck?.appleGenre,
    rankInGenre: record.lastCheck?.rankInGenre,
    results: record.lastCheck?.results ?? 0,
    saturated: record.lastCheck?.saturated ?? false,
    topApps: [],
    sampledAt: last.date,
    restored: true,
  };
}

export function recentHistory(
  record: KeywordRecord,
  days = HISTORY_DAYS,
): KeywordHistoryPoint[] {
  return record.history.slice(-days);
}

/** Trend arrow value: change between the last two points, or null. */
export function trendDelta(history: KeywordHistoryPoint[]): number | null {
  if (history.length < 2) return null;
  const previous = history[history.length - 2].popularity;
  const current = history[history.length - 1].popularity;
  return current - previous;
}

/** Persisted keyword list for one country (row order). */
export function loadKeywordList(
  storage: KeywordStorage,
  country: string,
): string[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(listStorageKey(country));
  } catch {
    // Storage blocked (private mode) — treat as an empty list.
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveKeywordList(
  storage: KeywordStorage,
  country: string,
  keywords: string[],
): void {
  try {
    storage.setItem(listStorageKey(country), JSON.stringify(keywords));
  } catch {
    // Storage full or unavailable — fail open rather than break the tool.
  }
}

/** Add a keyword to the persisted list without duplicates. */
export function addKeywordToList(
  storage: KeywordStorage,
  country: string,
  keyword: string,
): string[] {
  const current = loadKeywordList(storage, country);
  const next = [
    keyword.trim(),
    ...current.filter(
      (value) =>
        value.toLocaleLowerCase() !== keyword.trim().toLocaleLowerCase(),
    ),
  ];
  saveKeywordList(storage, country, next);
  return next;
}

export function removeKeywordFromList(
  storage: KeywordStorage,
  country: string,
  keyword: string,
): string[] {
  const next = loadKeywordList(storage, country).filter(
    (value) => value.toLocaleLowerCase() !== keyword.toLocaleLowerCase(),
  );
  saveKeywordList(storage, country, next);
  return next;
}

/* ------------------------------------------------------------------ */
/* Related keywords                                                    */
/* ------------------------------------------------------------------ */
const SUGGESTION_STOP_WORDS = new Set([
  "and",
  "app",
  "for",
  "from",
  "get",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "with",
  "your",
]);

/**
 * Derive related keyword phrases from the metadata of the top apps that rank
 * for the term. Purely public data; returns up to 8 phrases.
 */
export function relatedKeywords(topApps: TopApp[], keyword: string): string[] {
  const seed = keyword.trim().toLocaleLowerCase();
  const phrases = new Set<string>();
  for (const app of topApps.slice(0, 5)) {
    const title = app.name.toLocaleLowerCase();
    const genre = app.genre.toLocaleLowerCase();
    const words =
      title
        .match(/[\p{L}\p{N}]{3,}/gu)
        ?.filter((word) => !SUGGESTION_STOP_WORDS.has(word)) ?? [];
    const candidates = [title, genre, `${seed} ${genre}`.trim(), ...words];
    for (const candidate of candidates) {
      const clean = candidate.replace(/\s+/gu, " ").trim();
      if (clean.length >= 3 && clean.length <= 80 && clean !== seed) {
        phrases.add(clean);
      }
    }
  }
  return [...phrases].slice(0, 8);
}

/**
 * Search-as-you-type suggestions: the exact term plus phrases derived from the
 * apps currently ranking for it. Used for the explorer's autocomplete.
 */
export function suggestKeywords(term: string, apps: CatalogApp[]): string[] {
  const topApps: TopApp[] = apps.map((app, index) => ({
    appStoreId: app.appStoreId,
    name: app.name,
    developer: app.developer,
    genre: app.genre,
    iconUrl: app.iconUrl,
    storeUrl: app.storeUrl,
    ratingsCount: 0,
    ratingAverage: 0,
    position: index + 1,
  }));
  const exact = term.trim();
  return [...new Set([exact, ...relatedKeywords(topApps, exact)])].slice(0, 8);
}

/* ------------------------------------------------------------------ */
/* Opportunity                                                         */
/* ------------------------------------------------------------------ */

export type OpportunityVerdict =
  | "target"
  | "longtail_win"
  | "competitive"
  | "low_demand"
  | "dominated";

export interface Opportunity {
  /** 0–100: balance of demand and ease. A ranking aid, not a forecast. */
  score: number;
  verdict: OpportunityVerdict;
  label: string;
  reason: string;
}

export const OPPORTUNITY_LABELS: Record<OpportunityVerdict, string> = {
  target: "Worth targeting",
  longtail_win: "Long-tail win",
  competitive: "Competitive",
  low_demand: "Low demand",
  dominated: "Dominated",
};

/** Difficulty at or below this is a first page a newer app can break into. */
export const TARGET_DIFFICULTY_MAX = 50;
export const LONGTAIL_DIFFICULTY_MAX = 45;
export const DOMINATED_DIFFICULTY_MIN = 75;

function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(value);
}

export function formatRatings(value: number): string {
  return compactCount(Math.max(0, Math.round(value)));
}

/**
 * Plain-language call on whether a keyword is worth fighting for, from
 * Apple's popularity and the estimated difficulty.
 */
export function assessOpportunity(
  metrics: Pick<KeywordMetrics, "popularity" | "popularitySource" | "difficulty" | "evidence">,
): Opportunity {
  const source = metrics.popularitySource ?? "estimated";
  const demand =
    source === "longtail"
      ? 0.2
      : source === "official"
        ? Math.max(0, Math.min(1, (metrics.popularity - 35) / 35))
        : Math.max(0, Math.min(1, (metrics.popularity - 30) / 60)) * 0.8;
  const ease = 1 - metrics.difficulty / 100;
  const score = Math.round(100 * Math.sqrt(Math.max(0, demand * ease)));
  const median = metrics.evidence?.medianRatings;
  const medianText = median !== undefined ? ` (median ${formatRatings(median)} ratings)` : "";

  let verdict: OpportunityVerdict;
  let reason: string;
  if (metrics.evidence?.navigational) {
    verdict = "dominated";
    reason = "A brand search — people typing this want one specific app.";
  } else if (metrics.difficulty >= DOMINATED_DIFFICULTY_MIN) {
    verdict = "dominated";
    reason = `The first page is held by entrenched apps${medianText}.`;
  } else if (source === "longtail") {
    if (metrics.difficulty <= LONGTAIL_DIFFICULTY_MAX) {
      verdict = "longtail_win";
      reason = "Below Apple's top searches, but the first page is weak — an easy rank for a newer app.";
    } else {
      verdict = "low_demand";
      reason = "Below Apple's top searches and the first page is already crowded.";
    }
  } else if (metrics.difficulty <= TARGET_DIFFICULTY_MAX) {
    verdict = "target";
    reason =
      source === "official"
        ? "Apple shows real search demand and the first page is beatable."
        : "Looks beatable; Apple's popularity was unavailable, so demand is a rough estimate.";
  } else {
    verdict = "competitive";
    reason = `Real demand, but you'll need ratings and a strong title to break in${medianText}.`;
  }
  // A weak app already on page one means the door isn't closed.
  const weakest = metrics.evidence;
  if (
    (verdict === "competitive" || (verdict === "dominated" && !weakest?.navigational)) &&
    weakest?.weakestPosition &&
    weakest.weakestRatings < 1_000
  ) {
    reason += ` Still, #${weakest.weakestPosition} has only ${formatRatings(weakest.weakestRatings)} ratings — page one isn't closed.`;
  }
  return { score, verdict, label: OPPORTUNITY_LABELS[verdict], reason };
}

/* ------------------------------------------------------------------ */
/* Batch analysis                                                      */
/* ------------------------------------------------------------------ */

export const MAX_BATCH_KEYWORDS = 50;
export const BATCH_CONCURRENCY = 2;
export const BATCH_GAP_MS = 220;

export interface ParseKeywordBatchResult {
  /** Valid, unique keywords ready to analyze (original casing, max 50). */
  accepted: string[];
  /** Entries that repeated an already-accepted keyword (case-insensitive). */
  duplicates: string[];
  /** Entries that are too short, too long, or hit the batch cap. */
  invalid: string[];
}

/**
 * Parse a pasted keyword list (commas, semicolons, or newlines), normalize
 * whitespace, dedupe case-insensitively, and cap the batch size.
 */
export function parseKeywordBatch(
  input: string,
  options: { max?: number } = {},
): ParseKeywordBatchResult {
  const max = Math.max(1, options.max ?? MAX_BATCH_KEYWORDS);
  const accepted: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  const parts = input
    .split(/[,\n;]+/u)
    .map((part) => part.trim().replace(/\s+/gu, " "))
    .filter(Boolean);

  for (const part of parts) {
    if (part.length < 2 || part.length > 80) {
      invalid.push(part);
      continue;
    }
    const key = part.toLocaleLowerCase();
    if (seen.has(key)) {
      duplicates.push(part);
      continue;
    }
    if (accepted.length >= max) {
      invalid.push(part);
      continue;
    }
    seen.add(key);
    accepted.push(part);
  }

  return { accepted, duplicates, invalid };
}

function batchSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run async work over items with bounded concurrency, a small gap between
 * starts, and per-item failure tolerance. Failures are collected and returned,
 * never thrown — the remaining queue always runs to completion.
 */
export async function runBatched<T>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<void>,
  options: { concurrency?: number; gapMs?: number } = {},
): Promise<{ failed: T[] }> {
  const concurrency = Math.max(1, options.concurrency ?? BATCH_CONCURRENCY);
  const gapMs = Math.max(0, options.gapMs ?? BATCH_GAP_MS);
  const failed: T[] = [];
  let cursor = 0;

  async function runOne(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (gapMs > 0 && index > 0) await batchSleep(gapMs);
      try {
        await worker(item, index);
      } catch {
        failed.push(item);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runOne()),
  );
  return { failed };
}

/* ------------------------------------------------------------------ */
/* Explorer CSV export (local only)                                    */
/* ------------------------------------------------------------------ */

export interface ExplorerCsvRow {
  keyword: string;
  country: string;
  metrics: KeywordMetrics | null;
  record: KeywordRecord | null;
}

/** Build a CSV string for the keyword explorer table (browser download). */
export function buildExplorerCsv(rows: readonly ExplorerCsvRow[]): string {
  const header = [
    "keyword",
    "store",
    "popularity",
    "popularity_source",
    "difficulty_estimated",
    "results",
    "saturated",
    "trend_delta",
    "last_checked_at",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const metrics = row.metrics;
    const delta =
      row.record && row.record.history.length >= 2
        ? trendDelta(row.record.history)
        : null;
    const lastChecked =
      metrics?.sampledAt ??
      (row.record && row.record.history.length > 0
        ? row.record.history[row.record.history.length - 1].date
        : "");
    // Normalize the timestamp: fresh checks store a full ISO string while a
    // record restored from localStorage only keeps the date. History lives at
    // day granularity, so the export column is always the date part.
    const lastCheckedDate = lastChecked.slice(0, 10);
    lines.push(
      [
        csvEscape(row.keyword),
        csvEscape(row.country),
        metrics ? String(metrics.popularity) : "",
        metrics ? (metrics.popularitySource ?? "estimated") : "",
        metrics ? String(metrics.difficulty) : "",
        metrics ? String(metrics.results) : "",
        metrics ? String(metrics.saturated) : "",
        delta === null ? "" : String(delta),
        csvEscape(lastCheckedDate),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ */
/* History backup / restore (local files only)                         */
/* ------------------------------------------------------------------ */

export const EXPLORER_BACKUP_VERSION = 1 as const;
const EXPLORER_KEY_PREFIX = "appclimb:kw:v1:";

export interface ExplorerBackup {
  version: typeof EXPLORER_BACKUP_VERSION;
  exportedAt: string;
  data: Record<string, string>;
}

/** Serialize every keyword history record into a portable JSON backup. */
export function exportExplorerBackup(storage: KeywordStorage): string {
  const data: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(EXPLORER_KEY_PREFIX)) continue;
    try {
      const raw = storage.getItem(key);
      if (raw) data[key] = raw;
    } catch {
      // Storage blocked — skip unreadable keys rather than fail the export.
    }
  }
  const backup: ExplorerBackup = {
    version: EXPLORER_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Restore records from a backup JSON string. Only valid keyword records are
 * written back; malformed entries are skipped. Country keyword lists are
 * rebuilt from the restored records so restored keywords reappear without
 * extra steps. Returns the number restored.
 */
export function restoreExplorerBackup(
  storage: KeywordStorage,
  json: string,
): number {
  let backup: unknown;
  try {
    backup = JSON.parse(json);
  } catch {
    return 0;
  }
  if (
    typeof backup !== "object" ||
    backup === null ||
    (backup as Record<string, unknown>).version !== EXPLORER_BACKUP_VERSION
  ) {
    return 0;
  }
  const data = (backup as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return 0;

  const lists = new Map<string, string[]>();
  let restored = 0;
  for (const [key, raw] of Object.entries(data)) {
    if (typeof raw !== "string" || !key.startsWith(EXPLORER_KEY_PREFIX)) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isKeywordRecord(parsed)) continue;
      storage.setItem(key, raw);
      const country = parsed.country.toUpperCase();
      const list = lists.get(country) ?? [];
      if (!list.includes(parsed.keyword)) list.push(parsed.keyword);
      lists.set(country, list);
      restored += 1;
    } catch {
      // Skip malformed entries; keep whatever is already valid.
    }
  }
  for (const [country, keywords] of lists) {
    saveKeywordList(storage, country, keywords);
  }
  return restored;
}

/**
 * Formats a list of keywords for Apple App Store Connect's 100-character
 * keyword field: comma-separated without spaces, deduped, and capped at 100 chars.
 */
export function formatAsoKeywordField(keywords: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  let length = 0;

  for (const raw of keywords) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    const addedLen = parts.length === 0 ? trimmed.length : trimmed.length + 1;
    if (length + addedLen > 100) break;
    parts.push(trimmed);
    length += addedLen;
  }

  return parts.join(",");
}
