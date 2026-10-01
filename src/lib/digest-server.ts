// Weekly email for Pro users (ADR 0007): the I/O part. Finds Pro users who
// keep the email on, reads their synced tracker from D1, joins Apple's
// latest week, and sends through Resend. One email per user per Apple week.

import { lastCompleteUtcWeek } from "@/lib/apple-ads";
import {
  buildDigestEmail,
  digestKeywordsFor,
  type DigestApp,
  type DigestEmail,
} from "@/lib/digest";
import { sendEmail, type ResendCredentials } from "@/lib/email";
import { categoryLabel, termPath } from "@/lib/keyword-pages";
import { isProEntitled } from "@/lib/plan";
import {
  datasetGenreFor,
  historyDelta,
  moversFrom,
  normalizeTerm,
  type TermDataset,
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
  plan: string;
  status: string;
  current_period_end: string | null;
  json: string;
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
            .rising.filter((term) => !tracked.has(normalizeTerm(term.term)) && (term.delta ?? 0) > 0)
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
 * Send this week's emails to up to `limit` Pro users who haven't had one
 * for the current Apple week.
 */
export async function runWeeklyDigest(options: DigestRunOptions): Promise<DigestRunResult> {
  const now = options.now ?? new Date();
  const limit = Math.max(1, Math.min(options.limit ?? 10, 50));
  const week = await digestWeek(options.store, now);
  const { results } = await options.db
    .prepare(
      `SELECT u.id, u.email, s.plan, s.status, s.current_period_end, b.json
       FROM users u
       JOIN subscriptions s ON s.user_id = u.id
       JOIN sync_blobs b ON b.user_id = u.id AND b.blob_key = 'tracker'
       LEFT JOIN email_prefs p ON p.user_id = u.id
       LEFT JOIN digest_log d ON d.user_id = u.id AND d.week = ?
       WHERE s.plan = 'pro' AND COALESCE(p.weekly_digest, 1) = 1 AND d.user_id IS NULL
       ORDER BY u.id`,
    )
    .bind(week)
    .all<Candidate>();
  const eligible = (results ?? []).filter((row) => isProEntitled(row, now.getTime()));
  const batch = eligible.slice(0, limit);
  const result: DigestRunResult = {
    week,
    eligible: eligible.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    remaining: Math.max(0, eligible.length - batch.length),
    ...(options.dryRun ? { built: 0 } : {}),
  };
  const datasets = new Map<string, { current: TermDataset | null; previous: TermDataset | null }>();
  const today = now.toISOString().slice(0, 10);

  for (const user of batch) {
    const tracker = loadTrackerStore({
      getItem: () => user.json,
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage);
    const apps = await appsFor(tracker, options.store, options.siteUrl, datasets);
    const token = await unsubscribeToken(options.secret, user.id);
    const unsubscribe = unsubscribeUrl(options.siteUrl, user.id, token);
    const email = buildDigestEmail({ week, today, apps, siteUrl: options.siteUrl, unsubscribeUrl: unsubscribe });

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
