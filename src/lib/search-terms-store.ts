// Server-only store for Apple's weekly published search terms.
//
// One storefront-week is ~7,500 terms (15 genres × 500). The first request
// that needs a week pulls it from Apple Ads Insights (a handful of paged
// calls), then it is kept in D1 as one compact JSON chunk per genre and in
// isolate memory. Per-term weekly history (up to 52 weeks) is fetched on
// demand with a single `searchTerm IN (...)` query and cached per week.
//
// Without D1 (local `next dev`, e2e) everything still works from memory.

import {
  AppleAdsError,
  buildTermsQuery,
  isoDateUtc,
  lastCompleteUtcWeek,
  queryPopularityRows,
  shiftUtcWeek,
  type AppleAdsCredentials,
  type PopularityRow,
} from "@/lib/apple-ads";
import {
  buildDataset,
  isDatasetGenre,
  normalizeHistory,
  normalizeTerm,
  packRows,
  unpackRows,
  type DatasetGenre,
  type TermDataset,
  type TermHistoryPoint,
  type TermRow,
} from "@/lib/search-terms";

export interface StoreDeps {
  db: D1Database | null;
  creds: AppleAdsCredentials;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Test seam for the 429 back-off. */
  sleep?: (ms: number) => Promise<void>;
}

export const PAGE_SIZE = 1000;
/** Re-ask Apple about a week that had no data yet after this long. */
const EMPTY_RETRY_MS = 6 * 60 * 60 * 1000;
/** How long an isolate trusts its "latest week" answer. */
const LATEST_TTL_MS = 60 * 60 * 1000;
const MEMORY_WEEKS = 24;
export const HISTORY_WEEKS = 52;
const HISTORY_BATCH = 25;

const memory = new Map<string, TermDataset>();
const emptyWeeks = new Map<string, number>();
const latest = new Map<string, { week: string; checkedAt: number }>();
const inflight = new Map<string, Promise<TermDataset | null>>();
const historyMemory = new Map<string, { throughWeek: string; points: TermHistoryPoint[] }>();

export function resetSearchTermMemory(): void {
  memory.clear();
  emptyWeeks.clear();
  latest.clear();
  inflight.clear();
  historyMemory.clear();
}

function remember(dataset: TermDataset): void {
  const key = `${dataset.country}:${dataset.week}`;
  memory.delete(key);
  memory.set(key, dataset);
  while (memory.size > MEMORY_WEEKS) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
}

function weekRange(week: string): { start: string; end: string } {
  const end = new Date(`${week}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { start: week, end: isoDateUtc(end) };
}

function toTermRow(row: PopularityRow): TermRow | null {
  const term = typeof row.searchTerm === "string" ? row.searchTerm.trim() : "";
  const popularity = Number(row.searchPopularity1to100);
  if (!term || !Number.isFinite(popularity) || !isDatasetGenre(row.genre)) return null;
  return {
    term,
    genre: row.genre,
    popularity: Math.max(1, Math.min(100, Math.round(popularity))),
    popularityInGenre:
      typeof row.searchPopularityInGenre === "number" ? row.searchPopularityInGenre : undefined,
    popularity1to5:
      typeof row.searchPopularity1to5 === "number" ? row.searchPopularity1to5 : undefined,
    rankInGenre: typeof row.rankInGenre === "number" ? row.rankInGenre : undefined,
  };
}

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000];

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apple Ads tolerates steady sequential calls but answers bursts with 429,
 * so every call goes one at a time and backs off on a rate limit.
 */
async function queryWithRetry(
  deps: StoreDeps,
  query: Record<string, unknown>,
): Promise<PopularityRow[]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await queryPopularityRows(deps.creds, query, {
        fetchImpl: deps.fetchImpl,
        now: deps.now?.(),
      });
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (
        delay === undefined ||
        !(error instanceof AppleAdsError) ||
        error.status !== 429
      ) {
        throw error;
      }
      await (deps.sleep ?? wait)(delay);
    }
  }
}

/** Page through every published term for one storefront-week. */
export async function fetchWeekFromApple(
  deps: StoreDeps,
  country: string,
  week: string,
): Promise<TermRow[]> {
  const range = weekRange(week);
  const rows: TermRow[] = [];
  for (let offset = 0; offset <= 50_000; offset += PAGE_SIZE) {
    const page = await queryWithRetry(
      deps,
      buildTermsQuery({ country, range, offset, pageSize: PAGE_SIZE }),
    );
    for (const raw of page) {
      const row = toTermRow(raw);
      if (row) rows.push(row);
    }
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function readWeekFromDb(
  db: D1Database,
  country: string,
  week: string,
): Promise<{ status: "ready" | "empty"; fetchedAt: number; rows: TermRow[] } | null> {
  const meta = await db
    .prepare(
      "SELECT status, fetched_at FROM search_term_weeks WHERE country = ? AND week = ?",
    )
    .bind(country, week)
    .first<{ status: string; fetched_at: string }>();
  if (!meta) return null;
  const fetchedAt = Date.parse(meta.fetched_at) || 0;
  if (meta.status !== "ready") return { status: "empty", fetchedAt, rows: [] };
  const chunks = await db
    .prepare("SELECT genre, payload FROM search_term_chunks WHERE country = ? AND week = ?")
    .bind(country, week)
    .all<{ genre: string; payload: string }>();
  const rows: TermRow[] = [];
  for (const chunk of chunks.results ?? []) {
    if (!isDatasetGenre(chunk.genre)) continue;
    try {
      rows.push(...unpackRows(chunk.genre, JSON.parse(chunk.payload)));
    } catch {
      // A corrupt chunk only loses that genre; the rest of the week is fine.
    }
  }
  return { status: "ready", fetchedAt, rows };
}

async function writeWeekToDb(
  db: D1Database,
  country: string,
  week: string,
  rows: readonly TermRow[],
  fetchedAt: string,
): Promise<void> {
  const byGenre = new Map<DatasetGenre, TermRow[]>();
  for (const row of rows) {
    const list = byGenre.get(row.genre) ?? [];
    list.push(row);
    byGenre.set(row.genre, list);
  }
  const statements = [...byGenre].map(([genre, list]) =>
    db
      .prepare(
        "INSERT OR REPLACE INTO search_term_chunks (country, week, genre, payload) VALUES (?, ?, ?, ?)",
      )
      .bind(country, week, genre, JSON.stringify(packRows(list))),
  );
  statements.push(
    db
      .prepare(
        "INSERT OR REPLACE INTO search_term_weeks (country, week, status, term_count, fetched_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(country, week, rows.length > 0 ? "ready" : "empty", rows.length, fetchedAt),
  );
  await db.batch(statements);
}

/**
 * One storefront-week of published terms. Resolves `null` when Apple has
 * not published that week (yet). Concurrent callers share one fetch.
 */
export async function loadWeek(
  deps: StoreDeps,
  country: string,
  week: string,
): Promise<TermDataset | null> {
  const key = `${country}:${week}`;
  const cached = memory.get(key);
  if (cached) return cached;
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  const emptyAt = emptyWeeks.get(key);
  if (emptyAt !== undefined && nowMs - emptyAt < EMPTY_RETRY_MS) return null;
  const pending = inflight.get(key);
  if (pending) return pending;

  const task = (async () => {
    if (deps.db) {
      try {
        const stored = await readWeekFromDb(deps.db, country, week);
        if (stored?.status === "ready" && stored.rows.length > 0) {
          const dataset = buildDataset(country, week, stored.rows);
          remember(dataset);
          return dataset;
        }
        if (stored?.status === "empty" && nowMs - stored.fetchedAt < EMPTY_RETRY_MS) {
          emptyWeeks.set(key, stored.fetchedAt);
          return null;
        }
      } catch {
        // Missing table or a D1 hiccup: fall through to Apple.
      }
    }
    const rows = await fetchWeekFromApple(deps, country, week);
    const fetchedAt = new Date(nowMs).toISOString();
    if (deps.db) {
      try {
        await writeWeekToDb(deps.db, country, week, rows, fetchedAt);
      } catch {
        // Persisting is an optimization; the data is still served.
      }
    }
    if (rows.length === 0) {
      emptyWeeks.set(key, nowMs);
      return null;
    }
    const dataset = buildDataset(country, week, rows);
    remember(dataset);
    return dataset;
  })();
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

/** The most recent week Apple has published for a storefront. */
export async function latestDataset(
  deps: StoreDeps,
  country: string,
): Promise<TermDataset | null> {
  const now = deps.now?.() ?? new Date();
  const pointer = latest.get(country);
  if (pointer && now.getTime() - pointer.checkedAt < LATEST_TTL_MS) {
    const cached = memory.get(`${country}:${pointer.week}`);
    if (cached) return cached;
  }
  let week = lastCompleteUtcWeek(now);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const dataset = await loadWeek(deps, country, week.start);
    if (dataset) {
      latest.set(country, { week: dataset.week, checkedAt: now.getTime() });
      return dataset;
    }
    week = shiftUtcWeek(week, -1);
  }
  return null;
}

/** The published week `weeksBack` weeks before `dataset` (for movers). */
export async function datasetWeeksBefore(
  deps: StoreDeps,
  dataset: TermDataset,
  weeksBack: number,
): Promise<TermDataset | null> {
  const week = shiftUtcWeek(weekRange(dataset.week), -weeksBack).start;
  return loadWeek(deps, dataset.country, week);
}

async function readHistoryFromDb(
  db: D1Database,
  country: string,
  terms: readonly string[],
): Promise<Map<string, { throughWeek: string; points: TermHistoryPoint[] }>> {
  const out = new Map<string, { throughWeek: string; points: TermHistoryPoint[] }>();
  if (terms.length === 0) return out;
  const placeholders = terms.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT term, through_week, payload FROM search_term_history WHERE country = ? AND term IN (${placeholders})`,
    )
    .bind(country, ...terms)
    .all<{ term: string; through_week: string; payload: string }>();
  for (const row of rows.results ?? []) {
    try {
      const packed = JSON.parse(row.payload) as unknown;
      const points = Array.isArray(packed)
        ? normalizeHistory(
            packed
              .filter((entry): entry is [string, number] => Array.isArray(entry))
              .map(([week, popularity]) => ({ week, popularity })),
          )
        : [];
      out.set(row.term, { throughWeek: row.through_week, points });
    } catch {
      // Treat a corrupt row as missing; it is refetched below.
    }
  }
  return out;
}

/**
 * Up to 52 weeks of official popularity for each term, oldest first. Terms
 * Apple never published come back as an empty list.
 */
export async function termHistories(
  deps: StoreDeps,
  dataset: TermDataset,
  terms: readonly string[],
): Promise<Map<string, TermHistoryPoint[]>> {
  const throughWeek = dataset.week;
  const keys = [...new Set(terms.map(normalizeTerm).filter(Boolean))];
  const out = new Map<string, TermHistoryPoint[]>();
  let missing: string[] = [];
  for (const key of keys) {
    const cached = historyMemory.get(`${dataset.country}:${key}`);
    if (cached && cached.throughWeek >= throughWeek) out.set(key, cached.points);
    else missing.push(key);
  }
  if (missing.length > 0 && deps.db) {
    try {
      const stored = await readHistoryFromDb(deps.db, dataset.country, missing);
      missing = missing.filter((key) => {
        const hit = stored.get(key);
        if (!hit || hit.throughWeek < throughWeek) return true;
        out.set(key, hit.points);
        historyMemory.set(`${dataset.country}:${key}`, hit);
        return false;
      });
    } catch {
      // Fall back to Apple below.
    }
  }
  if (missing.length === 0) return out;

  const range = {
    start: shiftUtcWeek(weekRange(throughWeek), -(HISTORY_WEEKS - 1)).start,
    end: weekRange(throughWeek).end,
  };
  const fetchedAt = new Date((deps.now?.() ?? new Date()).getTime()).toISOString();
  for (let index = 0; index < missing.length; index += HISTORY_BATCH) {
    const batch = missing.slice(index, index + HISTORY_BATCH);
    const raw: PopularityRow[] = [];
    let offset = 0;
    for (;;) {
      const page = await queryWithRetry(
        deps,
        buildTermsQuery({
          country: dataset.country,
          range,
          terms: batch,
          offset,
          pageSize: PAGE_SIZE,
        }),
      );
      raw.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    const grouped = new Map<string, Array<{ week: string; popularity: number }>>();
    for (const row of raw) {
      const term = typeof row.searchTerm === "string" ? normalizeTerm(row.searchTerm) : "";
      const popularity = Number(row.searchPopularity1to100);
      if (!term || typeof row.week !== "string" || !Number.isFinite(popularity)) continue;
      const list = grouped.get(term) ?? [];
      list.push({ week: row.week, popularity });
      grouped.set(term, list);
    }
    const statements: D1PreparedStatement[] = [];
    for (const key of batch) {
      const points = normalizeHistory(grouped.get(key) ?? []);
      out.set(key, points);
      historyMemory.set(`${dataset.country}:${key}`, { throughWeek, points });
      if (deps.db) {
        statements.push(
          deps.db
            .prepare(
              "INSERT OR REPLACE INTO search_term_history (country, term, through_week, payload, fetched_at) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(
              dataset.country,
              key,
              throughWeek,
              JSON.stringify(points.map((point) => [point.week, point.popularity])),
              fetchedAt,
            ),
        );
      }
    }
    if (deps.db && statements.length > 0) {
      try {
        await deps.db.batch(statements);
      } catch {
        // Cached in memory; persisting is best-effort.
      }
    }
  }
  while (historyMemory.size > 5_000) {
    const oldest = historyMemory.keys().next().value;
    if (oldest === undefined) break;
    historyMemory.delete(oldest);
  }
  return out;
}
