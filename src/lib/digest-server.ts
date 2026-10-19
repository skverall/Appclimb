// Weekly email (ADR 0007): the I/O part. Finds signed-up users who keep the
// email on: Pro users get their synced tracker joined with Apple's latest
// week; free accounts get Apple's biggest risers of the week. Sends through
// Resend, one email per user per Apple week.

import { lastCompleteUtcWeek } from "@/lib/apple-ads";
import {
  buildDigestEmail,
  digestKeywordsFor,
  type DigestApp,
  type DigestEmail,
} from "@/lib/digest";
import {
  buildFreeDigestEmail,
  marketMovers,
  recentHistory,
  weekPulse,
  type FreeDigestMarket,
} from "@/lib/digest-free";
import { sendEmail, type ResendCredentials } from "@/lib/email";
import { categoryLabel, explorerLink, termPath } from "@/lib/keyword-pages";
import { isProEntitled } from "@/lib/plan";
import {
  datasetGenreFor,
  historyDelta,
  matchesStorefrontScript,
  moversFrom,
  normalizeTerm,
  type TermDataset,
  type TermHistoryPoint,
} from "@/lib/search-terms";
import {
  datasetWeeksBefore,
  latestDataset,
  termHistories,
  type StoreDeps,
} from "@/lib/search-terms-store";
import { loadTrackerStore, type TrackerStore } from "@/lib/tracker";

const encoder = new TextEncoder();

function base64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

/** Unsubscribe token: HMAC of the user id, so links work without signing in. */
export async function unsubscribeToken(secret: string, userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(`unsubscribe:${userId}`)));
}

export async function verifyUnsubscribeToken(
  secret: string,
  userId: string,
  token: string,
): Promise<boolean> {
  if (!secret || !userId || !token) return false;
  const expected = await unsubscribeToken(secret, userId);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ token.charCodeAt(index);
  }
  return diff === 0;
}

export function unsubscribeUrl(siteUrl: string, userId: string, token: string): string {
  return `${siteUrl}/unsubscribe?u=${encodeURIComponent(userId)}&t=${encodeURIComponent(token)}`;
}

export async function readDigestEnabled(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT weekly_digest FROM email_prefs WHERE user_id = ?")
    .bind(userId)
    .first<{ weekly_digest: number }>();
  return row ? row.weekly_digest === 1 : true;
}

export async function writeDigestEnabled(db: D1Database, userId: string, enabled: boolean): Promise<void> {
  await db
    .prepare(
      `INSERT INTO email_prefs (user_id, weekly_digest, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET weekly_digest = excluded.weekly_digest, updated_at = excluded.updated_at`,
    )
    .bind(userId, enabled ? 1 : 0)
    .run();
}

interface Candidate {
  id: string;
  email: string;
  email_verified_at: string | null;
  plan: string | null;
  status: string | null;
  current_period_end: string | null;
  /** Synced tracker; only Pro users can sync, so free accounts have one only if they had Pro. */
  json: string | null;
  synced_at: string | null;
}

type Recipient = Candidate & { kind: "pro" | "free" };

/**
 * Which email a user gets: Pro needs a synced tracker to build from; a free
 * account needs a verified address, since nobody asked for this email by
 * typing it in. Everyone else gets none.
 */
export function digestKindFor(
  user: Pick<Candidate, "email_verified_at" | "plan" | "status" | "current_period_end" | "json">,
  now: number,
): "pro" | "free" | null {
  const subscription = user.plan
    ? { plan: user.plan, status: user.status ?? "", current_period_end: user.current_period_end }
    : null;
  if (isProEntitled(subscription, now)) return user.json !== null ? "pro" : null;
  return user.email_verified_at ? "free" : null;
}

export interface DigestRunOptions {
  db: D1Database;
  store: StoreDeps | null;
  resend: ResendCredentials | null;
  secret: string;
  siteUrl: string;
  now?: Date;
  /** Users handled in this call; the caller loops while `remaining > 0`. */
  limit?: number;
  /** Build but don't send or log. */
  dryRun?: boolean;
  /** Test seam for sending. */
  send?: (to: string, email: DigestEmail, headers: Record<string, string>) => Promise<boolean>;
}

export interface DigestRunResult {
  week: string;
  eligible: number;
  /** Eligible users by email kind. */
  pro: number;
  free: number;
  /**
   * Free accounts left for a later run because Apple's week (or the week
   * before it) isn't available; they stay unlogged, so nothing is lost.
   */
  freeHeld?: number;
  sent: number;
  skipped: number;
  failed: number;
  remaining: number;
  /** Dry run only: emails that would be sent. Counts only — the workflow log is public. */
  built?: number;
}

/** Apple's newest published week (US is always published), else last week. */
async function digestWeek(store: StoreDeps | null, now: Date): Promise<string> {
  if (store) {
    const dataset = await latestDataset(store, "US").catch(() => null);
    if (dataset) return dataset.week;
  }
  return lastCompleteUtcWeek(now).start;
}

/**
 * Storefront of the free email's risers. The server doesn't know a free
 * user's storefront (their tracker stays in the browser), so it uses the
 * one the site defaults to and says so in the email.
 */
const MARKET_COUNTRY = "US";

export type MarketWeek = FreeDigestMarket;

/**
 * Apple's latest published week for the free email, compared with the week
 * before: the biggest risers with their recent Apple history, terms new to
 * a category's list, and how many terms rose and fell in each category.
 * Null without both weeks or without risers.
 */
export async function marketWeek(store: StoreDeps | null, siteUrl: string): Promise<MarketWeek | null> {
  if (!store) return null;
  const current = await latestDataset(store, MARKET_COUNTRY).catch(() => null);
  const previous = current ? await datasetWeeksBefore(store, current, 1).catch(() => null) : null;
  if (!current || !previous) return null;
  const movers = marketMovers(current, previous);
  if (movers.risers.length === 0) return null;
  // History only draws the spotlight's chart. When Apple can't be reached,
  // keep what D1 already has rather than losing every term's history.
  const terms = movers.risers.map((term) => term.term);
  const histories = await termHistories(store, current, terms)
    .catch(() => termHistories(store, current, terms, { live: false }))
    .catch(() => new Map<string, TermHistoryPoint[]>());
  const href = (term: string) => `${siteUrl}${explorerLink(term, MARKET_COUNTRY)}`;
  const { rose, fell, pulse } = weekPulse(current, previous);
  return {
    week: current.week,
    compareWeek: previous.week,
    country: MARKET_COUNTRY,
    termCount: current.rows.length,
    categoryCount: new Set(current.rows.map((row) => row.genre)).size,
    rose,
    fell,
    pulse: pulse.map(({ categoryLabel: label, rising, falling }) => ({ categoryLabel: label, rising, falling })),
    risers: movers.risers.map((term) => ({
      term: term.term,
      categoryLabel: categoryLabel(term.genre),
      popularity: term.popularity,
      previousPopularity: term.popularity - (term.delta ?? 0),
      delta: term.delta ?? 0,
      history: recentHistory(histories.get(normalizeTerm(term.term)) ?? [], current.week),
      href: href(term.term),
      pageHref: `${siteUrl}${termPath(MARKET_COUNTRY, term.genre, term.term)}`,
    })),
    newcomers: movers.newcomers.map((term) => ({
      term: term.term,
      categoryLabel: categoryLabel(term.genre),
      popularity: term.popularity,
      href: href(term.term),
    })),
  };
}

function trackerFrom(json: string): TrackerStore {
  return loadTrackerStore({
    getItem: () => json,
    setItem: () => {},
    removeItem: () => {},
    key: () => null,
    length: 0,
  } as unknown as Storage);
}

async function appsFor(
  tracker: TrackerStore,
  store: StoreDeps | null,
  siteUrl: string,
  datasets: Map<string, { current: TermDataset | null; previous: TermDataset | null }>,
): Promise<DigestApp[]> {
  const apps: DigestApp[] = [];
  for (const app of tracker.apps) {
    const { keywords, lastCheckedDate, previousDate } = digestKeywordsFor(tracker, app.appStoreId, app.country);
    if (keywords.length === 0) continue;
    let data = datasets.get(app.country);
    if (!data && store) {
      const current = await latestDataset(store, app.country).catch(() => null);
      const previous = current ? await datasetWeeksBefore(store, current, 4).catch(() => null) : null;
      data = { current, previous };
      datasets.set(app.country, data);
    }
    const current = data?.current ?? null;
    const histories =
      current && store
        ? await termHistories(store, current, keywords.map((item) => item.keyword)).catch(() => new Map())
        : new Map();
    const genre = datasetGenreFor(app.genre);
    const tracked = new Set(keywords.map((item) => normalizeTerm(item.keyword)));
    const rising =
      current && genre
        ? moversFrom(current, data?.previous ?? null, { genre, limit: 15 })
            .rising.filter(
              (term) =>
                !tracked.has(normalizeTerm(term.term)) &&
                (term.delta ?? 0) > 0 &&
                matchesStorefrontScript(term.term, app.country),
            )
            .slice(0, 5)
            .map((term) => ({
              term: term.term,
              popularity: term.popularity,
              delta: term.delta ?? 0,
              href: `${siteUrl}${termPath(app.country, term.genre, term.term)}`,
            }))
        : [];
    apps.push({
      name: app.name,
      country: app.country,
      categoryLabel: genre ? categoryLabel(genre) : null,
      lastCheckedDate,
      previousDate,
      rising,
      keywords: keywords.map((item) => {
        const key = normalizeTerm(item.keyword);
        const history = histories.get(key) ?? [];
        return {
          ...item,
          popularity: current?.byTerm.get(key)?.popularity ?? null,
          popularityChange: history.length >= 2 ? historyDelta(history, 1) : null,
        };
      }),
    });
  }
  return apps;
}

/**
 * A free account's email. Ranks from a former Pro user's synced tracker are
 * frozen since their last sync, so only Apple's numbers for those keywords
 * are used, never the ranks.
 */
async function freeEmailFor(
  user: Candidate,
  market: MarketWeek,
  options: DigestRunOptions,
  datasets: Map<string, { current: TermDataset | null; previous: TermDataset | null }>,
  unsubscribe: string,
): Promise<DigestEmail | null> {
  const apps = user.json ? await appsFor(trackerFrom(user.json), options.store, options.siteUrl, datasets) : [];
  return buildFreeDigestEmail({
    ...market,
    keywords: apps.flatMap((app) =>
      app.keywords.map((keyword) => ({
        keyword: keyword.keyword,
        country: app.country,
        popularity: keyword.popularity,
        popularityChange: keyword.popularityChange,
        href: `${options.siteUrl}${explorerLink(keyword.keyword, app.country)}`,
      })),
    ),
    syncedOn: user.json ? (user.synced_at?.slice(0, 10) ?? null) : null,
    siteUrl: options.siteUrl,
    unsubscribeUrl: unsubscribe,
  });
}

/**
 * This week's free email as a free account without synced keywords would
 * get it, with a placeholder unsubscribe link, plus the Apple data it is
 * built from: a dry run you can read. No user data.
 */
export async function previewFreeDigest(
  options: Pick<DigestRunOptions, "store" | "siteUrl">,
): Promise<{ market: MarketWeek | null; email: DigestEmail | null }> {
  const market = await marketWeek(options.store, options.siteUrl);
  if (!market) return { market: null, email: null };
  const email = buildFreeDigestEmail({
    ...market,
    keywords: [],
    syncedOn: null,
    siteUrl: options.siteUrl,
    unsubscribeUrl: `${options.siteUrl}/unsubscribe`,
  });
  return { market, email };
}

/**
 * Send this week's emails to up to `limit` users (Pro and free) who haven't
 * had one for the current Apple week.
 */
export async function runWeeklyDigest(options: DigestRunOptions): Promise<DigestRunResult> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const week = await digestWeek(options.store, now);
  const { results } = await options.db
    .prepare(
      `SELECT u.id, u.email, u.email_verified_at, s.plan, s.status, s.current_period_end,
              b.json, b.updated_at AS synced_at
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       LEFT JOIN sync_blobs b ON b.user_id = u.id AND b.blob_key = 'tracker'
       LEFT JOIN email_prefs p ON p.user_id = u.id
       LEFT JOIN digest_log d ON d.user_id = u.id AND d.week = ?
       WHERE COALESCE(p.weekly_digest, 1) = 1 AND d.user_id IS NULL
       ORDER BY u.id`,
    )
    .bind(week)
    .all<Candidate>();
  const recipients: Recipient[] = [];
  for (const row of results ?? []) {
    const kind = digestKindFor(row, now.getTime());
    if (kind) recipients.push({ ...row, kind });
  }
  const freeCount = recipients.filter((user) => user.kind === "free").length;
  // Free emails are built from Apple's week alone; without it they wait.
  const market = freeCount > 0 ? await marketWeek(options.store, options.siteUrl) : null;
  const eligible = market ? recipients : recipients.filter((user) => user.kind === "pro");
  const batch = eligible.slice(0, limit);
  const result: DigestRunResult = {
    week,
    eligible: eligible.length,
    pro: recipients.length - freeCount,
    free: market ? freeCount : 0,
    ...(freeCount > 0 && !market ? { freeHeld: freeCount } : {}),
    sent: 0,
    skipped: 0,
    failed: 0,
    remaining: Math.max(0, eligible.length - batch.length),
    ...(options.dryRun ? { built: 0 } : {}),
  };
  const datasets = new Map<string, { current: TermDataset | null; previous: TermDataset | null }>();
  const today = now.toISOString().slice(0, 10);

  for (const user of batch) {
    const token = await unsubscribeToken(options.secret, user.id);
    const unsubscribe = unsubscribeUrl(options.siteUrl, user.id, token);
    const email =
      user.kind === "free" && market
        ? await freeEmailFor(user, market, options, datasets, unsubscribe)
        : buildDigestEmail({
            week,
            today,
            apps: await appsFor(trackerFrom(user.json ?? "{}"), options.store, options.siteUrl, datasets),
            siteUrl: options.siteUrl,
            unsubscribeUrl: unsubscribe,
          });

    if (options.dryRun) {
      if (email) result.built = (result.built ?? 0) + 1;
      else result.skipped += 1;
      continue;
    }
    if (!email) {
      await logDigest(options.db, user.id, week, "empty");
      result.skipped += 1;
      continue;
    }
    const headers = {
      "List-Unsubscribe": `<${options.siteUrl}/api/digest/unsubscribe?u=${encodeURIComponent(user.id)}&t=${encodeURIComponent(token)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
    const send =
      options.send ??
      (async (to: string, message: DigestEmail, extra: Record<string, string>) => {
        if (!options.resend) return false;
        const sent = await sendEmail(options.resend, { to, ...message, headers: extra });
        return sent.ok;
      });
    if (await send(user.email, email, headers)) {
      await logDigest(options.db, user.id, week, "sent");
      result.sent += 1;
    } else {
      // Not logged, so the next run retries this user.
      result.failed += 1;
    }
  }
  return result;
}

async function logDigest(db: D1Database, userId: string, week: string, status: string): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO digest_log (user_id, week, status) VALUES (?, ?, ?)")
    .bind(userId, week, status)
    .run();
}
