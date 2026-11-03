/**
 * Server-only data retention: what /privacy promises about how long AppClimb
 * keeps data, enforced by a weekly purge (`POST /api/maintenance/purge`,
 * called by .github/workflows/weekly-purge.yml). Account data itself is kept
 * until the user deletes the account (account-deletion.ts).
 *
 * Keep these numbers and the privacy page's "How long we keep data" section
 * in step.
 */
export const RETENTION = {
  /** Visit counts and product events (analytics_pageviews / analytics_events). */
  analyticsDays: 365,
  /** Daily assistant and agent check counters (ai_usage / agent_usage). */
  usageDays: 90,
  /** Revoked API keys (OAuth tokens go once their refresh token expires). */
  revokedApiKeyDays: 30,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PurgeCounts = Record<string, number>;

/** Delete everything past its retention period; returns rows deleted per table. */
export async function purgeExpiredData(db: D1Database, now: Date = new Date()): Promise<PurgeCounts> {
  const nowIso = now.toISOString();
  const dayBefore = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
  const isoBefore = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();

  const steps: Array<[string, D1PreparedStatement]> = [
    ["analytics_pageviews", db.prepare("DELETE FROM analytics_pageviews WHERE date < ?").bind(dayBefore(RETENTION.analyticsDays))],
    ["analytics_events", db.prepare("DELETE FROM analytics_events WHERE date < ?").bind(dayBefore(RETENTION.analyticsDays))],
    ["ai_usage", db.prepare("DELETE FROM ai_usage WHERE day < ?").bind(dayBefore(RETENTION.usageDays))],
    ["agent_usage", db.prepare("DELETE FROM agent_usage WHERE day < ?").bind(dayBefore(RETENTION.usageDays))],
    ["sessions", db.prepare("DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL").bind(nowIso)],
    ["magic_links", db.prepare("DELETE FROM magic_links WHERE expires_at < ?").bind(nowIso)],
    ["oauth_requests", db.prepare("DELETE FROM oauth_requests WHERE expires_at < ?").bind(nowIso)],
    ["oauth_codes", db.prepare("DELETE FROM oauth_codes WHERE expires_at < ?").bind(nowIso)],
    // Rotated refresh tokens stay until they expire: presenting one again is
    // how refresh-token reuse is detected (agent-auth.ts).
    [
      "agent_tokens",
      db
        .prepare(
          `DELETE FROM agent_tokens
           WHERE (kind = 'oauth' AND COALESCE(refresh_expires_at, access_expires_at) < ?)
              OR (kind = 'api_key' AND revoked_at IS NOT NULL AND revoked_at < ?)`,
        )
        .bind(nowIso, isoBefore(RETENTION.revokedApiKeyDays)),
    ],
  ];

  const results = await db.batch(steps.map(([, statement]) => statement));
  const counts: PurgeCounts = {};
  steps.forEach(([table], index) => {
    counts[table] = Number(results[index]?.meta?.changes ?? 0);
  });
  return counts;
}
