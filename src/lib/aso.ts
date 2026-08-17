// App Store keyword estimation, entirely client-side.
//
// Apple's public iTunes Search API is the only free source that works from a
// browser (CORS *). Difficulty is always an estimate from competition pressure
// and top-result strength. Popularity is Apple Ads official relative 1–100
// when POST /api/popularity returns a hit, otherwise the same iTunes estimate.
// The UI labels the source. Neither number is search volume.
//
// History is kept in localStorage: one daily snapshot per keyword per country,
// plus an estimated backfill so the 30-day trend chart is useful on first
// check. Backfilled points are flagged and labeled as estimates.

import {
  boundedStorefront,
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

export type PopularitySource = "official" | "estimated";

export interface KeywordMetrics {
  keyword: string;
  country: string;
  /** 1–100. Official Apple Ads score, or the iTunes estimate. */
  popularity: number;
  /** official = Apple Ads Platform API; estimated = iTunes heuristic. */
  popularitySource?: PopularitySource;
  /** Apple Ads genre token used for the official lookup, if any. */
  appleGenre?: string;
  searchPopularityInGenre?: number;
  searchPopularity1to5?: number;
  rankInGenre?: number;
  /** Estimated 0–100 difficulty (barrier to rank in top results). */
  difficulty: number;
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
  /** True when the leading history points are estimated backfill. */
  backfilled: boolean;
  /** Sorted ascending by date; the last point is a real measurement. */
  history: KeywordHistoryPoint[];
  /**
   * Results/saturated of the most recent check. Kept alongside the history
   * point (which already has popularity/difficulty/source) so the table can
   * be restored fully after a reload. Absent on legacy records.
   */
  lastCheck?: {
    results: number;
    saturated: boolean;
  };
}

export const HISTORY_DAYS = 30;
export const SEARCH_LIMIT = 200;
export const BACKFILL_DAYS = 29; // 29 estimated days + today's real snapshot.

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
    signal: options.signal,
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

/** Deterministic small variation so similar keywords do not score identically. */
export function keywordJitter(keyword: string): number {
  let hash = 0;
  for (let index = 0; index < keyword.length; index += 1) {
    hash = (hash * 31 + keyword.charCodeAt(index)) >>> 0;
  }
  return (hash % 9) - 4; // -4..+4
}

function clampScore(value: number): number {
  return Math.max(2, Math.min(98, Math.round(value)));
}

/**
 * Estimate popularity and difficulty from raw search results. Pure — no
 * network, no randomness — so it is deterministic and testable.
 */
export function estimateMetrics(
  keyword: string,
  country: string,
  apps: TopApp[],
  saturated: boolean,
  sampledAt = new Date().toISOString(),
): KeywordMetrics {
  const topApps = apps.slice(0, 10);
  const resultCount = apps.length;

  // Competition: how many apps chase the term (capped at 200, sqrt-curved).
  const competition = saturated ? 1 : Math.sqrt(resultCount / SEARCH_LIMIT);

  // Strength of the top-10: average lifetime ratings, log-scaled so a term
  // dominated by apps with 100k+ ratings reads as high.
  const averageRatings =
    topApps.length === 0
      ? 0
      : topApps.reduce((sum, app) => sum + app.ratingsCount, 0) /
        topApps.length;
  const topStrength = Math.min(1, Math.log10(1 + averageRatings) / 5);

  // How many of the top 10 are known mega-brands (hard to displace).
  const brandShare =
    topApps.length === 0
      ? 0
      : topApps.filter((app) =>
          MEGA_BRANDS.has(app.developer.toLocaleLowerCase()),
        ).length / topApps.length;

  // Relevance: how many top apps carry the keyword in their title.
  const tokens = keyword.toLocaleLowerCase().split(/\s+/u);
  const relevant = topApps.filter((app) => {
    const title = app.name.toLocaleLowerCase();
    return tokens.some((token) => title.includes(token));
  }).length;
  const relevance = topApps.length === 0 ? 0 : relevant / topApps.length;

  const noResults = resultCount === 0;
  const popularity = noResults
    ? 2
    : clampScore(
        competition * 70 +
          topStrength * 20 +
          relevance * 10 +
          keywordJitter(keyword) * 0.6,
      );
  const difficulty = noResults
    ? 2
    : clampScore(
        competition * 40 +
          topStrength * 35 +
          brandShare * 15 +
          relevance * 10 +
          keywordJitter(keyword) * 0.4,
      );

  return {
    keyword: keyword.trim(),
    country,
    popularity,
    popularitySource: "estimated",
    difficulty,
    results: resultCount,
    saturated,
    topApps,
    sampledAt,
  };
}

/** Fetch + estimate in one step. */
export async function estimateKeyword(
  keyword: string,
  country: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<KeywordMetrics> {
  const { apps, saturated } = await fetchKeywordResults(
    keyword,
    country,
    options,
  );
  return estimateMetrics(keyword, country, apps, saturated);
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
 * Deterministic pseudo-random walk ending exactly on the measured values.
 * Used to backfill the leading days of a trend chart; every point is labeled
 * "estimated" in the UI.
 */
export function backfillHistory(
  metrics: KeywordMetrics,
  days = BACKFILL_DAYS,
): KeywordHistoryPoint[] {
  const today = toLocalDate();
  const points: KeywordHistoryPoint[] = [];
  let popularity = metrics.popularity;
  let difficulty = metrics.difficulty;
  // Walk backwards from today, varying by ±6% per step with a deterministic
  // seed so the same keyword always produces the same estimated shape.
  let step = 0;
  const seedLength = Math.max(1, metrics.keyword.length);
  for (let offset = days; offset >= 1; offset -= 1) {
    step =
      ((step * 31 +
        (metrics.keyword.charCodeAt(Math.abs(step) % seedLength) || 7) +
        offset) >>>
        0) %
      997;
    const wobble = ((step % 13) - 6) / 100; // -0.06..+0.06
    popularity = Math.max(
      2,
      Math.min(98, Math.round(popularity - popularity * wobble)),
    );
    difficulty = Math.max(
      2,
      Math.min(98, Math.round(difficulty - difficulty * wobble * 0.7)),
    );
    const date = new Date();
    date.setDate(date.getDate() - offset);
    points.push({
      date: toLocalDate(date),
      popularity,
      difficulty,
    });
  }
  points.push({
    date: today,
    popularity: metrics.popularity,
    difficulty: metrics.difficulty,
    popularitySource: metrics.popularitySource,
  });
  return points;
}

export function loadRecord(
  storage: KeywordStorage,
  keyword: string,
  country: string,
): KeywordRecord | null {
  const raw = storage.getItem(historyStorageKey(keyword, country));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isKeywordRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRecord(
  storage: KeywordStorage,
  record: KeywordRecord,
): void {
  storage.setItem(
    historyStorageKey(record.keyword, record.country),
    JSON.stringify(record),
  );
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
  const record: KeywordRecord = {
    keyword: metrics.keyword.trim(),
    country: metrics.country,
    firstSeen: existing?.firstSeen ?? today,
    backfilled: existing?.backfilled ?? history.length <= 2,
    history,
    lastCheck: {
      results: metrics.results,
      saturated: metrics.saturated,
    },
  };
  if (record.backfilled && history.length === 1) {
    record.history = backfillHistory(metrics);
  }
  saveRecord(storage, record);
  return record;
}

/** Trim history to the trailing window, newest last. */
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
  const raw = storage.getItem(listStorageKey(country));
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
  storage.setItem(listStorageKey(country), JSON.stringify(keywords));
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
/* Golden keywords                                                     */
/* ------------------------------------------------------------------ */

/** A keyword is "golden" when demand is solid and the barrier is low. */
export const GOLDEN_POPULARITY_MIN = 55;
export const GOLDEN_DIFFICULTY_MAX = 40;

export function isGoldenKeyword(
  metrics: Pick<KeywordMetrics, "popularity" | "difficulty">,
): boolean {
  return (
    metrics.popularity >= GOLDEN_POPULARITY_MIN &&
    metrics.difficulty <= GOLDEN_DIFFICULTY_MAX
  );
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
        csvEscape(lastChecked),
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
    const raw = storage.getItem(key);
    if (raw) data[key] = raw;
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
