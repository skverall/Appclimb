// Local per-app keyword tracker (client-side only).
//
// Apps, keywords, notes, and rank snapshots live in localStorage under a
// versioned schema that coexists with the Keyword Explorer's
// `appclimb:kw:v1:*` keys — never deletes or migrates explorer data away.
//
// Position is measured from a single public iTunes Search response (up to 200
// apps). Popularity and difficulty reuse the existing estimateMetrics heuristics
// and are always estimates. Rank history is never backfilled.

import {
  estimateMetrics,
  fetchKeywordResults,
  toLocalDate,
  type KeywordMetrics,
  type KeywordStorage,
  type TopApp,
} from "@/lib/aso";
import {
  cleanSearchResult,
  deriveKeywordSuggestions,
  lookupAppStoreApp,
  parseAppStoreIdInput,
  searchAppStoreCatalog,
  type AppStoreResult,
  type CatalogApp,
  type KeywordSuggestion,
} from "@/lib/itunes";
import { csvEscape } from "@/lib/file";

export const TRACKER_STORAGE_KEY = "appclimb:tracker:v1";
export const TRACKER_SCHEMA_VERSION = 1 as const;
export const MAX_KEYWORDS_PER_ADD = 50;
export const MAX_SUGGESTIONS = 20;
export const REFRESH_CONCURRENCY = 2;
export const REFRESH_GAP_MS = 220;
/** Extra pause after a rate-limit hit before the next keyword in the queue. */
export const RATE_LIMIT_COOLDOWN_MS = 2500;
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000; // 12 hours

/* ------------------------------------------------------------------ */
/* Quick-start preset                                                  */
/* ------------------------------------------------------------------ */

/**
 * One-click sample app: a real US storefront app plus a starter keyword set,
 * so first-time visitors can see the tracker working without typing anything.
 * The keyword list is curated from the app's title, category, and feature
 * copy (deduplicated phrases) — popularity/difficulty are still estimated
 * from public data.
 */
export const STARTER_APP_ID = "6755675367"; // Car Dealer Tracker: Profit
export const STARTER_APP_NAME = "Car Dealer Tracker: Profit";
export const STARTER_KEYWORDS: readonly string[] = [
  "car dealer tracker",
  "car dealer app",
  "dealership app",
  "car inventory tracker",
  "vehicle inventory app",
  "car sales tracker",
  "auto dealer app",
] as const;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TrackedApp {
  appStoreId: string;
  name: string;
  bundleId: string;
  developer: string;
  genre: string;
  iconUrl: string;
  storeUrl: string;
  country: string;
  addedAt: string;
  /** Last successful lookup of raw metadata (for re-suggestions). */
  description?: string;
}

export interface TrackedKeywordMetrics {
  popularity: number;
  difficulty: number;
  results: number;
  saturated: boolean;
  topApps: TopApp[];
  /** 1–200 when found, null when outside the first 200 (shown as >200). */
  position: number | null;
  /** True when the last check failed and metrics are stale or missing. */
  unavailable?: boolean;
  sampledAt: string;
}

export interface TrackedKeyword {
  appStoreId: string;
  country: string;
  keyword: string;
  normalizedKeyword: string;
  note: string;
  tags?: string[];
  createdAt: string;
  lastCheckedAt: string | null;
  currentMetrics: TrackedKeywordMetrics | null;
}

export interface RankSnapshot {
  /** Local calendar day YYYY-MM-DD. */
  date: string;
  sampledAt: string;
  /** 1–200 or null when outside the observed window. */
  position: number | null;
  popularity: number;
  difficulty: number;
  resultsCount: number;
  saturated: boolean;
}

export interface TrackerStore {
  version: typeof TRACKER_SCHEMA_VERSION;
  /** Composite key `${appStoreId}:${country}` of the active app, or null. */
  activeAppKey: string | null;
  apps: TrackedApp[];
  /** Keyed by keywordKey(appStoreId, country, normalizedKeyword). */
  keywords: Record<string, TrackedKeyword>;
  /** Same keys as keywords; max one snapshot per day. */
  snapshots: Record<string, RankSnapshot[]>;
}

export type RankTrendKind =
  | "new"
  | "unchanged"
  | "up"
  | "down"
  | "entered"
  | "dropped_out"
  | "unavailable";

export interface RankTrend {
  kind: RankTrendKind;
  /** previousPosition - currentPosition when both are numbers; else null. */
  delta: number | null;
  label: string;
}

export type TrackerStorage = KeywordStorage;

/* ------------------------------------------------------------------ */
/* Keys / normalization                                                */
/* ------------------------------------------------------------------ */

export function appKey(appStoreId: string, country: string): string {
  return `${appStoreId}:${country.trim().toUpperCase()}`;
}

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

export function keywordKey(
  appStoreId: string,
  country: string,
  normalizedKeyword: string,
): string {
  return `${appStoreId}:${country.trim().toUpperCase()}:${normalizeKeyword(normalizedKeyword)}`;
}

export function emptyStore(): TrackerStore {
  return {
    version: TRACKER_SCHEMA_VERSION,
    activeAppKey: null,
    apps: [],
    keywords: {},
    snapshots: {},
  };
}

/* ------------------------------------------------------------------ */
/* localStorage load / save with safe corruption handling              */
/* ------------------------------------------------------------------ */

function isTrackedApp(value: unknown): value is TrackedApp {
  if (!value || typeof value !== "object") return false;
  const app = value as TrackedApp;
  return (
    typeof app.appStoreId === "string" &&
    typeof app.name === "string" &&
    typeof app.country === "string" &&
    app.appStoreId.length > 0 &&
    app.name.length > 0
  );
}

function isTrackedKeyword(value: unknown): value is TrackedKeyword {
  if (!value || typeof value !== "object") return false;
  const row = value as TrackedKeyword;
  return (
    typeof row.appStoreId === "string" &&
    typeof row.country === "string" &&
    typeof row.keyword === "string" &&
    typeof row.normalizedKeyword === "string"
  );
}

function isRankSnapshot(value: unknown): value is RankSnapshot {
  if (!value || typeof value !== "object") return false;
  const snap = value as RankSnapshot;
  return (
    typeof snap.date === "string" &&
    typeof snap.sampledAt === "string" &&
    typeof snap.popularity === "number" &&
    typeof snap.difficulty === "number" &&
    (snap.position === null || typeof snap.position === "number")
  );
}

/** Load the tracker store. Corrupt or missing data yields an empty store. */
export function loadTrackerStore(storage: TrackerStorage): TrackerStore {
  const raw = storage.getItem(TRACKER_STORAGE_KEY);
  if (!raw) return emptyStore();
  try {
    const parsed = JSON.parse(raw) as Partial<TrackerStore>;
    if (parsed.version !== TRACKER_SCHEMA_VERSION) return emptyStore();
    const apps = Array.isArray(parsed.apps)
      ? parsed.apps.filter(isTrackedApp).map((app) => ({
          appStoreId: app.appStoreId,
          name: app.name.slice(0, 120),
          bundleId: typeof app.bundleId === "string" ? app.bundleId.slice(0, 255) : "",
          developer: typeof app.developer === "string" ? app.developer.slice(0, 160) : "",
          genre: typeof app.genre === "string" ? app.genre.slice(0, 80) : "",
          iconUrl: typeof app.iconUrl === "string" ? app.iconUrl : "",
          storeUrl: typeof app.storeUrl === "string" ? app.storeUrl : "",
          country: app.country.trim().toUpperCase(),
          addedAt: typeof app.addedAt === "string" ? app.addedAt : toLocalDate(),
          description:
            typeof app.description === "string" ? app.description.slice(0, 4000) : undefined,
        }))
      : [];
    const keywords: Record<string, TrackedKeyword> = {};
    if (parsed.keywords && typeof parsed.keywords === "object") {
      for (const [key, value] of Object.entries(parsed.keywords)) {
        if (!isTrackedKeyword(value)) continue;
        const rawItem = value as unknown as Record<string, unknown>;
        keywords[key] = {
          appStoreId: value.appStoreId,
          country: value.country.trim().toUpperCase(),
          keyword: value.keyword.trim().slice(0, 80),
          normalizedKeyword: normalizeKeyword(value.normalizedKeyword || value.keyword),
          note: typeof value.note === "string" ? value.note.slice(0, 500) : "",
          tags: Array.isArray(rawItem.tags)
            ? (rawItem.tags as unknown[])
                .filter((t): t is string => typeof t === "string")
                .map((t) => t.trim().toLowerCase())
                .filter((t) => t.length >= 2 && t.length <= 20)
                .slice(0, 5)
            : [],
          createdAt: typeof value.createdAt === "string" ? value.createdAt : toLocalDate(),
          lastCheckedAt:
            typeof value.lastCheckedAt === "string" || value.lastCheckedAt === null
              ? value.lastCheckedAt
              : null,
          currentMetrics:
            value.currentMetrics && typeof value.currentMetrics === "object"
              ? (value.currentMetrics as TrackedKeywordMetrics)
              : null,
        };
      }
    }
    const snapshots: Record<string, RankSnapshot[]> = {};
    if (parsed.snapshots && typeof parsed.snapshots === "object") {
      for (const [key, value] of Object.entries(parsed.snapshots)) {
        if (!Array.isArray(value)) continue;
        snapshots[key] = value.filter(isRankSnapshot);
      }
    }
    const activeAppKey =
      typeof parsed.activeAppKey === "string" &&
      apps.some((app) => appKey(app.appStoreId, app.country) === parsed.activeAppKey)
        ? parsed.activeAppKey
        : apps[0]
          ? appKey(apps[0].appStoreId, apps[0].country)
          : null;
    return { version: TRACKER_SCHEMA_VERSION, activeAppKey, apps, keywords, snapshots };
  } catch {
    return emptyStore();
  }
}

export function saveTrackerStore(
  storage: TrackerStorage,
  store: TrackerStore,
): void {
  storage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(store));
}

/* ------------------------------------------------------------------ */
/* App CRUD                                                            */
/* ------------------------------------------------------------------ */

export function findApp(
  store: TrackerStore,
  appStoreId: string,
  country: string,
): TrackedApp | undefined {
  const key = appKey(appStoreId, country);
  return store.apps.find((app) => appKey(app.appStoreId, app.country) === key);
}

/**
 * Add an app for a storefront. Returns the updated store and whether the app
 * was newly added (false when the same id+country already existed).
 */
export function addTrackedApp(
  store: TrackerStore,
  app: Omit<TrackedApp, "addedAt"> & { addedAt?: string },
): { store: TrackerStore; added: boolean; app: TrackedApp } {
  const country = app.country.trim().toUpperCase();
  const existing = findApp(store, app.appStoreId, country);
  if (existing) {
    return {
      store: { ...store, activeAppKey: appKey(existing.appStoreId, existing.country) },
      added: false,
      app: existing,
    };
  }
  const tracked: TrackedApp = {
    appStoreId: app.appStoreId,
    name: app.name.slice(0, 120),
    bundleId: (app.bundleId ?? "").slice(0, 255),
    developer: (app.developer ?? "").slice(0, 160),
    genre: (app.genre ?? "").slice(0, 80),
    iconUrl: app.iconUrl ?? "",
    storeUrl: app.storeUrl ?? "",
    country,
    addedAt: app.addedAt ?? new Date().toISOString(),
    description: app.description,
  };
  return {
    store: {
      ...store,
      activeAppKey: appKey(tracked.appStoreId, tracked.country),
      apps: [...store.apps, tracked],
    },
    added: true,
    app: tracked,
  };
}

/** Remove an app and every keyword/snapshot scoped to it. */
export function removeTrackedApp(
  store: TrackerStore,
  appStoreId: string,
  country: string,
): TrackerStore {
  const key = appKey(appStoreId, country);
  const apps = store.apps.filter(
    (app) => appKey(app.appStoreId, app.country) !== key,
  );
  const keywords: Record<string, TrackedKeyword> = {};
  const snapshots: Record<string, RankSnapshot[]> = {};
  for (const [kwKey, row] of Object.entries(store.keywords)) {
    if (appKey(row.appStoreId, row.country) === key) continue;
    keywords[kwKey] = row;
  }
  for (const [snapKey, history] of Object.entries(store.snapshots)) {
    if (snapKey.startsWith(`${appStoreId}:${country.trim().toUpperCase()}:`)) continue;
    snapshots[snapKey] = history;
  }
  const activeAppKey =
    store.activeAppKey === key
      ? apps[0]
        ? appKey(apps[0].appStoreId, apps[0].country)
        : null
      : store.activeAppKey;
  return { ...store, apps, keywords, snapshots, activeAppKey };
}

export function setActiveApp(
  store: TrackerStore,
  appStoreId: string,
  country: string,
): TrackerStore {
  const key = appKey(appStoreId, country);
  if (!store.apps.some((app) => appKey(app.appStoreId, app.country) === key)) {
    return store;
  }
  return { ...store, activeAppKey: key };
}

/* ------------------------------------------------------------------ */
/* Keyword CRUD                                                        */
/* ------------------------------------------------------------------ */

export function listKeywordsForApp(
  store: TrackerStore,
  appStoreId: string,
  country: string,
): TrackedKeyword[] {
  const key = appKey(appStoreId, country);
  return Object.values(store.keywords)
    .filter((row) => appKey(row.appStoreId, row.country) === key)
    .sort((left, right) => left.keyword.localeCompare(right.keyword));
}

export interface ParseKeywordsResult {
  accepted: string[];
  duplicates: string[];
  invalid: string[];
  alreadyTracked: string[];
}

/**
 * Parse a free-text keyword list (comma or newline separated), normalize,
 * dedupe case-insensitively, and flag already-tracked keywords.
 */
export function parseKeywordBatch(
  input: string,
  existingNormalized: ReadonlySet<string>,
  options: { max?: number } = {},
): ParseKeywordsResult {
  const max = options.max ?? MAX_KEYWORDS_PER_ADD;
  const accepted: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  const alreadyTracked: string[] = [];
  const seen = new Set<string>();

  const parts = input
    .split(/[\n,]+/u)
    .map((part) => part.trim().replace(/\s+/gu, " "))
    .filter(Boolean);

  for (const part of parts) {
    if (part.length < 2 || part.length > 80) {
      invalid.push(part);
      continue;
    }
    const normalized = normalizeKeyword(part);
    if (seen.has(normalized)) {
      duplicates.push(part);
      continue;
    }
    if (existingNormalized.has(normalized)) {
      alreadyTracked.push(part);
      seen.add(normalized);
      continue;
    }
    if (accepted.length >= max) {
      invalid.push(part);
      continue;
    }
    seen.add(normalized);
    accepted.push(part);
  }

  return { accepted, duplicates, invalid, alreadyTracked };
}

export function addKeywordsToStore(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  keywords: string[],
): { store: TrackerStore; added: TrackedKeyword[] } {
  const next: TrackerStore = {
    ...store,
    keywords: { ...store.keywords },
    snapshots: { ...store.snapshots },
  };
  const added: TrackedKeyword[] = [];
  const countryCode = country.trim().toUpperCase();
  for (const keyword of keywords) {
    const normalized = normalizeKeyword(keyword);
    if (normalized.length < 2 || normalized.length > 80) continue;
    const key = keywordKey(appStoreId, countryCode, normalized);
    if (next.keywords[key]) continue;
    const row: TrackedKeyword = {
      appStoreId,
      country: countryCode,
      keyword: keyword.trim().replace(/\s+/gu, " ").slice(0, 80),
      normalizedKeyword: normalized,
      note: "",
      createdAt: new Date().toISOString(),
      lastCheckedAt: null,
      currentMetrics: null,
    };
    next.keywords[key] = row;
    added.push(row);
  }
  return { store: next, added };
}

export function updateKeywordNote(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  normalizedKeyword: string,
  note: string,
): TrackerStore {
  const key = keywordKey(appStoreId, country, normalizedKeyword);
  const existing = store.keywords[key];
  if (!existing) return store;
  return {
    ...store,
    keywords: {
      ...store.keywords,
      [key]: { ...existing, note: note.slice(0, 500) },
    },
  };
}

export function updateKeywordTags(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  normalizedKeyword: string,
  tags: string[],
): TrackerStore {
  const key = keywordKey(appStoreId, country, normalizedKeyword);
  const existing = store.keywords[key];
  if (!existing) return store;
  const cleanTags = Array.from(
    new Set(
      tags
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length >= 2 && t.length <= 20),
    ),
  ).slice(0, 5);
  return {
    ...store,
    keywords: {
      ...store.keywords,
      [key]: { ...existing, tags: cleanTags },
    },
  };
}

export interface CompetitorOverlap {
  appStoreId: string;
  name: string;
  developer: string;
  iconUrl: string;
  keywordCount: number;
  keywords: string[];
}

export function calculateCompetitorOverlap(
  targetAppStoreId: string,
  keywords: TrackedKeyword[],
): CompetitorOverlap[] {
  const map = new Map<
    string,
    {
      appStoreId: string;
      name: string;
      developer: string;
      iconUrl: string;
      keywords: string[];
    }
  >();

  for (const kw of keywords) {
    const topApps = kw.currentMetrics?.topApps;
    if (!topApps) continue;
    for (const app of topApps) {
      if (app.appStoreId === targetAppStoreId) continue;
      const existing = map.get(app.appStoreId) ?? {
        appStoreId: app.appStoreId,
        name: app.name,
        developer: app.developer,
        iconUrl: app.iconUrl,
        keywords: [],
      };
      if (!existing.keywords.includes(kw.keyword)) {
        existing.keywords.push(kw.keyword);
      }
      map.set(app.appStoreId, existing);
    }
  }

  const results: CompetitorOverlap[] = Array.from(map.values()).map((item) => ({
    ...item,
    keywordCount: item.keywords.length,
  }));

  results.sort((a, b) => b.keywordCount - a.keywordCount);
  return results.slice(0, 8);
}

export function removeKeywordFromStore(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  normalizedKeyword: string,
): TrackerStore {
  const key = keywordKey(appStoreId, country, normalizedKeyword);
  const { [key]: _removed, ...keywords } = store.keywords;
  const { [key]: _snap, ...snapshots } = store.snapshots;
  void _removed;
  void _snap;
  return { ...store, keywords, snapshots };
}

/* ------------------------------------------------------------------ */
/* Position + rank trend                                               */
/* ------------------------------------------------------------------ */

/**
 * Find 1-based position of appStoreId in a search result list.
 * Returns null when the app is not among the observed results (UI: >200).
 */
export function findAppPosition(
  apps: Array<{ appStoreId: string }>,
  appStoreId: string,
): number | null {
  const index = apps.findIndex((app) => app.appStoreId === appStoreId);
  return index >= 0 ? index + 1 : null;
}

/**
 * Rank delta formula: previousPosition - currentPosition.
 * Positive means moved up (better), negative means moved down.
 */
export function rankDelta(
  previousPosition: number | null,
  currentPosition: number | null,
): number | null {
  if (previousPosition === null || currentPosition === null) return null;
  return previousPosition - currentPosition;
}

export function describeRankTrend(
  previous: RankSnapshot | undefined,
  current: Pick<RankSnapshot, "position"> | null | undefined,
): RankTrend {
  if (!current) {
    return { kind: "unavailable", delta: null, label: "Unavailable" };
  }
  if (!previous) {
    return { kind: "new", delta: null, label: "New" };
  }
  const prevPos = previous.position;
  const currPos = current.position;
  if (prevPos === null && currPos !== null) {
    return {
      kind: "entered",
      delta: null,
      label: `Entered at #${currPos}`,
    };
  }
  if (prevPos !== null && currPos === null) {
    return { kind: "dropped_out", delta: null, label: "Dropped out" };
  }
  if (prevPos === null && currPos === null) {
    return { kind: "unchanged", delta: 0, label: "No change" };
  }
  const delta = rankDelta(prevPos, currPos);
  if (delta === null || delta === 0) {
    return { kind: "unchanged", delta: 0, label: "No change" };
  }
  if (delta > 0) {
    return { kind: "up", delta, label: `↑ ${delta}` };
  }
  return { kind: "down", delta, label: `↓ ${Math.abs(delta)}` };
}

export function formatPosition(position: number | null | undefined, unavailable = false): string {
  if (unavailable) return "Unavailable";
  if (position === undefined) return "—";
  if (position === null) return ">200";
  return `#${position}`;
}

/**
 * Upsert today's rank snapshot. Same-day refresh replaces the day's point.
 * Never invents historical rank data.
 */
export function recordRankSnapshot(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  normalizedKeyword: string,
  snapshot: Omit<RankSnapshot, "date"> & { date?: string },
): TrackerStore {
  const key = keywordKey(appStoreId, country, normalizedKeyword);
  const date = snapshot.date ?? toLocalDate();
  const history = [...(store.snapshots[key] ?? [])];
  const last = history[history.length - 1];
  const point: RankSnapshot = {
    date,
    sampledAt: snapshot.sampledAt,
    position: snapshot.position,
    popularity: snapshot.popularity,
    difficulty: snapshot.difficulty,
    resultsCount: snapshot.resultsCount,
    saturated: snapshot.saturated,
  };
  if (last && last.date === date) {
    history[history.length - 1] = point;
  } else {
    history.push(point);
  }
  // Keep trailing 90 days of real measurements.
  const trimmed = history.slice(-90);
  return {
    ...store,
    snapshots: { ...store.snapshots, [key]: trimmed },
  };
}

export function snapshotsFor(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  normalizedKeyword: string,
  days = 30,
): RankSnapshot[] {
  const key = keywordKey(appStoreId, country, normalizedKeyword);
  return (store.snapshots[key] ?? []).slice(-days);
}

/* ------------------------------------------------------------------ */
/* App resolution (search / URL / ID)                                  */
/* ------------------------------------------------------------------ */

export type ResolveAppQuery =
  | { kind: "id"; appStoreId: string }
  | { kind: "search"; term: string };

export function classifyAppQuery(input: string): ResolveAppQuery | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const id = parseAppStoreIdInput(trimmed);
  if (id) return { kind: "id", appStoreId: id };
  if (trimmed.length < 2) return null;
  return { kind: "search", term: trimmed.slice(0, 80) };
}

export async function resolveAppCandidates(
  input: string,
  country: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<CatalogApp[]> {
  const query = classifyAppQuery(input);
  if (!query) return [];
  if (query.kind === "id") {
    const raw = await lookupAppStoreApp(query.appStoreId, country, options);
    const cleaned = cleanSearchResult(raw);
    return cleaned ? [cleaned] : [];
  }
  return searchAppStoreCatalog(query.term, country, options);
}

export async function loadAppMetadata(
  appStoreId: string,
  country: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<{ catalog: CatalogApp; raw: AppStoreResult } | null> {
  const raw = await lookupAppStoreApp(appStoreId, country, options);
  const catalog = cleanSearchResult(raw);
  if (!catalog) return null;
  return { catalog, raw };
}

/* ------------------------------------------------------------------ */
/* Suggestions                                                         */
/* ------------------------------------------------------------------ */

export function buildKeywordSuggestions(
  raw: AppStoreResult,
  fallbackName: string,
  options: {
    existingNormalized?: ReadonlySet<string>;
    competitorApps?: CatalogApp[];
    limit?: number;
  } = {},
): Array<KeywordSuggestion & { alreadyTracked: boolean }> {
  const suggestions = deriveKeywordSuggestions(raw, fallbackName, {
    limit: options.limit ?? MAX_SUGGESTIONS,
    competitorApps: options.competitorApps,
  });
  const existing = options.existingNormalized ?? new Set<string>();
  return suggestions.map((item) => ({
    ...item,
    alreadyTracked: existing.has(normalizeKeyword(item.keyword)),
  }));
}

/** Fresh suggestions that are not already tracked for the app. */
export function filterNewSuggestions(
  suggestions: Array<KeywordSuggestion & { alreadyTracked?: boolean }>,
): KeywordSuggestion[] {
  return suggestions.filter((item) => !item.alreadyTracked);
}

/* ------------------------------------------------------------------ */
/* Keyword analysis (metrics + position from ONE search)               */
/* ------------------------------------------------------------------ */

export interface AnalyzeKeywordResult {
  metrics: KeywordMetrics;
  position: number | null;
  topApps: TopApp[];
}

/**
 * One iTunes search → popularity, difficulty, top apps, and tracked-app
 * position. Never issues a second identical search for position alone.
 */
export async function analyzeTrackedKeyword(
  keyword: string,
  country: string,
  appStoreId: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<AnalyzeKeywordResult> {
  const { apps, saturated } = await fetchKeywordResults(keyword, country, options);
  const metrics = estimateMetrics(keyword, country, apps, saturated);
  const position = findAppPosition(apps, appStoreId);
  return { metrics, position, topApps: apps.slice(0, 10) };
}

export function applyAnalysisToStore(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  keyword: string,
  analysis: AnalyzeKeywordResult,
): TrackerStore {
  const normalized = normalizeKeyword(keyword);
  const key = keywordKey(appStoreId, country, normalized);
  const existing = store.keywords[key];
  if (!existing) return store;
  const sampledAt = analysis.metrics.sampledAt;
  const currentMetrics: TrackedKeywordMetrics = {
    popularity: analysis.metrics.popularity,
    difficulty: analysis.metrics.difficulty,
    results: analysis.metrics.results,
    saturated: analysis.metrics.saturated,
    topApps: analysis.topApps,
    position: analysis.position,
    unavailable: false,
    sampledAt,
  };
  let next: TrackerStore = {
    ...store,
    keywords: {
      ...store.keywords,
      [key]: {
        ...existing,
        lastCheckedAt: sampledAt,
        currentMetrics,
      },
    },
  };
  next = recordRankSnapshot(next, appStoreId, country, normalized, {
    sampledAt,
    position: analysis.position,
    popularity: analysis.metrics.popularity,
    difficulty: analysis.metrics.difficulty,
    resultsCount: analysis.metrics.results,
    saturated: analysis.metrics.saturated,
  });
  return next;
}

/**
 * On failure, mark the keyword as unavailable but preserve prior metrics and
 * rank history.
 */
export function markKeywordUnavailable(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  keyword: string,
): TrackerStore {
  const normalized = normalizeKeyword(keyword);
  const key = keywordKey(appStoreId, country, normalized);
  const existing = store.keywords[key];
  if (!existing) return store;
  return {
    ...store,
    keywords: {
      ...store.keywords,
      [key]: {
        ...existing,
        currentMetrics: existing.currentMetrics
          ? { ...existing.currentMetrics, unavailable: true }
          : {
              popularity: 0,
              difficulty: 0,
              results: 0,
              saturated: false,
              topApps: [],
              position: null,
              unavailable: true,
              sampledAt: new Date().toISOString(),
            },
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Concurrent refresh helpers                                          */
/* ------------------------------------------------------------------ */

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isTransientItunesError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /app_store_catalog_unavailable:(429|5\d\d|403)/u.test(message);
}

export function humanizeItunesError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("429") || message.includes("403")) {
    return "Apple is temporarily rate-limiting requests. Existing data is preserved; try refreshing again shortly.";
  }
  if (/app_store_catalog_unavailable:5/u.test(message)) {
    return "Apple’s catalog is temporarily unavailable. Existing data is preserved.";
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Request cancelled.";
  }
  return "Could not reach the App Store catalog. Existing data is preserved.";
}

export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /app_store_catalog_unavailable:(429|403)/u.test(message);
}

/**
 * Run async work over items with a fixed concurrency and optional gap between
 * starts. Failures are collected; they never stop the remaining queue.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options: { signal?: AbortSignal; gapMs?: number } = {},
): Promise<Array<{ item: T; result?: R; error?: unknown }>> {
  const results: Array<{ item: T; result?: R; error?: unknown }> = new Array(
    items.length,
  );
  let cursor = 0;
  const limit = Math.max(1, concurrency);

  async function runOne(): Promise<void> {
    while (cursor < items.length) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (options.gapMs && index > 0) {
        try {
          await sleep(options.gapMs, options.signal);
        } catch (error) {
          results[index] = { item, error };
          throw error;
        }
      }
      try {
        const result = await worker(item, index);
        results[index] = { item, result };
      } catch (error) {
        results[index] = { item, error };
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runOne()));
  return results;
}

export async function analyzeWithRetry(
  keyword: string,
  country: string,
  appStoreId: string,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    maxAttempts?: number;
    onRetry?: (info: { attempt: number; maxAttempts: number; error: unknown }) => void;
  } = {},
): Promise<AnalyzeKeywordResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await analyzeTrackedKeyword(keyword, country, appStoreId, {
        fetchImpl: options.fetchImpl,
        signal: options.signal,
      });
    } catch (error) {
      lastError = error;
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        throw error;
      }
      if (!isTransientItunesError(error) || attempt >= maxAttempts) {
        throw error;
      }
      options.onRetry?.({ attempt, maxAttempts, error });
      const base = isRateLimitError(error) ? 800 : 250;
      const backoff = Math.min(5000, base * 2 ** (attempt - 1));
      await sleep(backoff, options.signal);
    }
  }
  throw lastError;
}

export function isKeywordStale(
  keyword: TrackedKeyword,
  now = Date.now(),
): boolean {
  if (!keyword.lastCheckedAt || !keyword.currentMetrics) return true;
  if (keyword.currentMetrics.unavailable) return true;
  const checked = Date.parse(keyword.lastCheckedAt);
  if (Number.isNaN(checked)) return true;
  return now - checked > STALE_AFTER_MS;
}

/** Convert KeywordHistoryPoint-style series for the shared TrendChart. */
export function snapshotsToChartPoints(
  snapshots: RankSnapshot[],
): Array<{ date: string; popularity: number; difficulty: number }> {
  return snapshots.map((snap) => ({
    date: snap.date,
    popularity: snap.popularity,
    difficulty: snap.difficulty,
  }));
}

export function positionSeries(
  snapshots: RankSnapshot[],
): Array<{ date: string; position: number | null }> {
  return snapshots.map((snap) => ({ date: snap.date, position: snap.position }));
}

/* ------------------------------------------------------------------ */
/* Opportunity heuristic (estimated — not search volume)               */
/* ------------------------------------------------------------------ */

export type KeywordStatusFilter =
  | "all"
  | "ranked"
  | "out"
  | "new"
  | "unchecked"
  | "opportunity";

/**
 * Estimated "worth watching" score 0–100.
 * Higher = better estimated demand vs difficulty, with a boost when the app is
 * outside the observed top 200 (room to enter) or already ranking mid-pack.
 * Always a heuristic from public signals — never real search volume.
 */
export function opportunityScore(
  metrics: Pick<TrackedKeywordMetrics, "popularity" | "difficulty" | "position" | "unavailable"> | null,
): number | null {
  if (!metrics || metrics.unavailable) return null;
  const demand = metrics.popularity;
  const barrier = metrics.difficulty;
  // Sweet spot: solid demand, not maxed-out difficulty.
  let score = demand * 0.55 + (100 - barrier) * 0.45;
  if (metrics.position === null) {
    // Outside top 200: still interesting if demand exists.
    score += demand >= 40 ? 8 : 0;
  } else if (metrics.position > 50) {
    score += 6; // ranked but room to climb
  } else if (metrics.position <= 10) {
    score -= 4; // already strong — less "opportunity", still track
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function matchesStatusFilter(
  row: TrackedKeyword,
  filter: KeywordStatusFilter,
  snapshots: RankSnapshot[] = [],
): boolean {
  const metrics = row.currentMetrics;
  switch (filter) {
    case "all":
      return true;
    case "ranked":
      return Boolean(metrics && !metrics.unavailable && metrics.position !== null);
    case "out":
      return Boolean(metrics && !metrics.unavailable && metrics.position === null);
    case "new":
      return snapshots.length < 2;
    case "unchecked":
      return !metrics || Boolean(metrics.unavailable);
    case "opportunity": {
      const score = opportunityScore(metrics);
      return score !== null && score >= 55;
    }
    default:
      return true;
  }
}

/** Clone an already-tracked app into another storefront (no keyword copy). */
export function trackAppInStorefront(
  store: TrackerStore,
  app: TrackedApp,
  country: string,
): { store: TrackerStore; added: boolean; app: TrackedApp } {
  return addTrackedApp(store, {
    appStoreId: app.appStoreId,
    name: app.name,
    bundleId: app.bundleId,
    developer: app.developer,
    genre: app.genre,
    iconUrl: app.iconUrl,
    storeUrl: app.storeUrl,
    country,
    description: app.description,
  });
}

/* ------------------------------------------------------------------ */
/* CSV export (local only)                                             */
/* ------------------------------------------------------------------ */

// csvEscape + downloadTextFile are shared with the Keyword Explorer and live
// in src/lib/file.ts; re-exported here so existing callers keep working.
export { csvEscape, downloadTextFile } from "@/lib/file";

/** Build a CSV string for one app's keywords (browser download only). */
export function buildKeywordsCsv(
  app: TrackedApp,
  keywords: TrackedKeyword[],
  options: {
    snapshotsFor?: (normalizedKeyword: string) => RankSnapshot[];
  } = {},
): string {
  const header = [
    "keyword",
    "store",
    "note",
    "popularity_estimated",
    "difficulty_estimated",
    "position",
    "results",
    "saturated",
    "opportunity_estimated",
    "last_checked_at",
    "rank_trend",
    "app_store_id",
    "app_name",
  ];
  const lines = [header.join(",")];
  for (const row of keywords) {
    const metrics = row.currentMetrics;
    const snaps = options.snapshotsFor?.(row.normalizedKeyword) ?? [];
    const previous = snaps.length >= 2 ? snaps[snaps.length - 2] : undefined;
    const trend = describeRankTrend(
      previous,
      metrics ? { position: metrics.position } : null,
    );
    const positionLabel =
      !metrics
        ? ""
        : metrics.unavailable
          ? "Unavailable"
          : metrics.position === null
            ? ">200"
            : String(metrics.position);
    const opp = opportunityScore(metrics);
    lines.push(
      [
        csvEscape(row.keyword),
        csvEscape(row.country),
        csvEscape(row.note),
        metrics && !metrics.unavailable ? String(metrics.popularity) : "",
        metrics && !metrics.unavailable ? String(metrics.difficulty) : "",
        csvEscape(positionLabel),
        metrics ? String(metrics.results) : "",
        metrics ? String(metrics.saturated) : "",
        opp === null ? "" : String(opp),
        row.lastCheckedAt ?? "",
        csvEscape(trend.label),
        csvEscape(app.appStoreId),
        csvEscape(app.name),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Numeric series for a compact position sparkline (null = outside 200 → 201). */
export function positionSparklineValues(
  snapshots: RankSnapshot[],
  days = 30,
): number[] {
  return snapshots.slice(-days).map((snap) =>
    snap.position === null ? 201 : snap.position,
  );
}

/* ------------------------------------------------------------------ */
/* Overview panel aggregations (My Rankings / All Ranked Apps)         */
/* ------------------------------------------------------------------ */

/**
 * Calendar cutoff (YYYY-MM-DD) for the trailing `days`-day window, inclusive
 * of today. Snapshots are daily, so filtering by date keeps the window
 * honest even when some days were never measured.
 */
function windowStartDate(days: number): string {
  return toLocalDate(new Date(Date.now() - (days - 1) * 86_400_000));
}

/** All snapshots for an app's keywords within the trailing calendar window. */
function snapshotsInWindow(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  days: number,
): Array<{ keyword: string; normalizedKeyword: string; snap: RankSnapshot }> {
  const cutoff = windowStartDate(days);
  const out: Array<{
    keyword: string;
    normalizedKeyword: string;
    snap: RankSnapshot;
  }> = [];
  for (const row of listKeywordsForApp(store, appStoreId, country)) {
    for (const snap of snapshotsFor(
      store,
      appStoreId,
      country,
      row.normalizedKeyword,
      90,
    )) {
      if (snap.date >= cutoff) {
        out.push({
          keyword: row.keyword,
          normalizedKeyword: row.normalizedKeyword,
          snap,
        });
      }
    }
  }
  return out;
}

export interface BestPositionPoint {
  date: string;
  position: number;
}

/**
 * Best (lowest) observed position per day across all tracked keywords.
 * Only days with at least one real measurement appear — nothing is
 * interpolated or backfilled.
 */
export function bestPositionSeries(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  days = 7,
): BestPositionPoint[] {
  const byDate = new Map<string, number>();
  for (const { snap } of snapshotsInWindow(store, appStoreId, country, days)) {
    if (snap.position === null) continue;
    const current = byDate.get(snap.date);
    if (current === undefined || snap.position < current) {
      byDate.set(snap.date, snap.position);
    }
  }
  return [...byDate.entries()]
    .map(([date, position]) => ({ date, position }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export interface MyRanking {
  keyword: string;
  normalizedKeyword: string;
  position: number;
  /**
   * Movement over the window: position at the first measured day minus the
   * current position. Positive = moved up. Null when there is no earlier
   * measurement to compare against.
   */
  surge: number | null;
}

/**
 * Keywords where the app currently ranks (1–200), sorted by position.
 * The surge mirrors the Everank-style "what place am I at" column: how far
 * the app moved across the trailing window from real daily checks only.
 */
export function myRankings(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  days = 7,
): MyRanking[] {
  const cutoff = windowStartDate(days);
  const out: MyRanking[] = [];
  for (const row of listKeywordsForApp(store, appStoreId, country)) {
    const metrics = row.currentMetrics;
    if (!metrics || metrics.unavailable || metrics.position === null) continue;
    const snaps = snapshotsFor(
      store,
      appStoreId,
      country,
      row.normalizedKeyword,
      90,
    ).filter((snap) => snap.date >= cutoff);
    let surge: number | null = null;
    if (snaps.length >= 2) {
      const first = snaps[0];
      const last = snaps[snaps.length - 1];
      if (
        first.date < last.date &&
        first.position !== null &&
        last.position !== null
      ) {
        surge = first.position - last.position;
      }
    }
    out.push({
      keyword: row.keyword,
      normalizedKeyword: row.normalizedKeyword,
      position: metrics.position,
      surge,
    });
  }
  return out.sort((left, right) => left.position - right.position);
}

export interface RankedAppSummary {
  appStoreId: string;
  name: string;
  developer: string;
  iconUrl: string;
  storeUrl: string;
  /** Best (lowest) position observed across the app's tracked keywords. */
  bestPosition: number;
  /** How many tracked keywords this app appeared in the top results for. */
  keywordCount: number;
}

/**
 * Competitor apps observed in the top results across all tracked keywords:
 * how many keywords each app ranks for and its best position. The tracked
 * app itself is excluded. Sorted by best position, then keyword count.
 */
export function allRankedApps(
  store: TrackerStore,
  appStoreId: string,
  country: string,
  limit = 10,
): RankedAppSummary[] {
  const byId = new Map<string, RankedAppSummary>();
  for (const row of listKeywordsForApp(store, appStoreId, country)) {
    const topApps = row.currentMetrics?.topApps ?? [];
    for (const top of topApps) {
      if (top.appStoreId === appStoreId) continue;
      const existing = byId.get(top.appStoreId);
      if (existing) {
        existing.keywordCount += 1;
        if (top.position < existing.bestPosition) {
          existing.bestPosition = top.position;
        }
      } else {
        byId.set(top.appStoreId, {
          appStoreId: top.appStoreId,
          name: top.name,
          developer: top.developer,
          iconUrl: top.iconUrl,
          storeUrl: top.storeUrl,
          bestPosition: top.position,
          keywordCount: 1,
        });
      }
    }
  }
  return [...byId.values()]
    .sort(
      (left, right) =>
        left.bestPosition - right.bestPosition ||
        right.keywordCount - left.keywordCount,
    )
    .slice(0, limit);
}
