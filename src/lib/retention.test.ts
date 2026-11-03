import { beforeAll, describe, expect, it } from "vitest";

import { upsertUser } from "@/lib/auth";
import { RETENTION, purgeExpiredData } from "@/lib/retention";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadAllMigrationsSql } from "../../tests/helpers/migration";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const day = (days: number) => daysAgo(days).toISOString().slice(0, 10);
const iso = (days: number) => daysAgo(days).toISOString();

let db: FakeD1;
let userId: string;

async function count(table: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return Number(row?.n ?? 0);
}

async function token(id: string, kind: "oauth" | "api_key", fields: Record<string, string | null>) {
  await db
    .prepare(
      `INSERT INTO agent_tokens (id, kind, user_id, access_hash, refresh_hash, scope, resource,
         access_expires_at, refresh_expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, 'appclimb', 'https://appclimb.app/mcp', ?, ?, ?)`,
    )
    .bind(
      id,
      kind,
      userId,
      `access-${id}`,
      kind === "oauth" ? `refresh-${id}` : null,
      fields.access ?? null,
      fields.refresh ?? null,
      fields.revoked ?? null,
    )
    .run();
}

beforeAll(async () => {
  db = await createTestDb(loadAllMigrationsSql());
  userId = (await upsertUser(db, { email: "keep@example.com" })).id;

  for (const [date, path] of [
    [day(RETENTION.analyticsDays + 1), "/old"],
    [day(RETENTION.analyticsDays - 1), "/recent"],
  ]) {
    await db
      .prepare(
        `INSERT INTO analytics_pageviews (date, timestamp, visitor_hash, path, country, referrer, device, browser)
         VALUES (?, 0, 'v', ?, 'US', 'direct', 'desktop', 'chrome')`,
      )
      .bind(date, path)
      .run();
    await db
      .prepare(
        `INSERT INTO analytics_events (date, timestamp, visitor_hash, name, path, country, device)
         VALUES (?, 0, 'v', 'pricing_viewed', ?, 'US', 'desktop')`,
      )
      .bind(date, path)
      .run();
  }

  for (const table of ["ai_usage", "agent_usage"]) {
    for (const days of [RETENTION.usageDays + 1, 0]) {
      await db
        .prepare(`INSERT INTO ${table} (subject, day, count, updated_at) VALUES (?, ?, 1, ?)`)
        .bind(`user:${userId}`, day(days), iso(days))
        .run();
    }
  }

  for (const [id, expires, revoked] of [
    ["expired", iso(1), null],
    ["revoked", iso(-10), iso(0)],
    ["live", iso(-10), null],
  ] as const) {
    await db
      .prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, userId, `hash-${id}`, expires, revoked)
      .run();
  }

  for (const [id, expires] of [
    ["old-link", iso(1)],
    ["live-link", iso(-1)],
  ]) {
    await db
      .prepare("INSERT INTO magic_links (id, email, token_hash, expires_at) VALUES (?, 'keep@example.com', ?, ?)")
      .bind(id, `hash-${id}`, expires)
      .run();
    await db
      .prepare(
        `INSERT INTO oauth_requests (id, client_id, redirect_uri, code_challenge, scope, resource, expires_at)
         VALUES (?, 'c', 'https://x.example/cb', 'ch', 'appclimb', 'r', ?)`,
      )
      .bind(id, expires)
      .run();
    await db
      .prepare(
        `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
         VALUES (?, 'c', ?, 'https://x.example/cb', 'ch', 'appclimb', 'r', ?)`,
      )
      .bind(id, userId, expires)
      .run();
  }

  await token("oauth-expired", "oauth", { access: iso(91), refresh: iso(1), revoked: null });
  await token("oauth-rotated", "oauth", { access: iso(5), refresh: iso(-80), revoked: iso(5) });
  await token("oauth-live", "oauth", { access: iso(-0.04), refresh: iso(-90) });
  await token("key-revoked-long-ago", "api_key", { revoked: iso(RETENTION.revokedApiKeyDays + 1) });
  await token("key-revoked-recently", "api_key", { revoked: iso(1) });
  await token("key-live", "api_key", {});
});

describe("purgeExpiredData", () => {
  it("deletes only what is past its retention period", async () => {
    const deleted = await purgeExpiredData(db, NOW);
    expect(deleted).toEqual({
      analytics_pageviews: 1,
      analytics_events: 1,
      ai_usage: 1,
      agent_usage: 1,
      sessions: 2,
      magic_links: 1,
      oauth_requests: 1,
      oauth_codes: 1,
      agent_tokens: 2,
    });

    const pageview = await db.prepare("SELECT path FROM analytics_pageviews").all<{ path: string }>();
    expect(pageview.results.map((row) => row.path)).toEqual(["/recent"]);
    const sessions = await db.prepare("SELECT id FROM sessions").all<{ id: string }>();
    expect(sessions.results.map((row) => row.id)).toEqual(["live"]);
    const tokens = await db.prepare("SELECT id FROM agent_tokens ORDER BY id").all<{ id: string }>();
    // A rotated refresh token stays until it expires, so its reuse is still detected.
    expect(tokens.results.map((row) => row.id)).toEqual([
      "key-live",
      "key-revoked-recently",
      "oauth-live",
      "oauth-rotated",
    ]);
    expect(await count("users")).toBe(1);
  });

  it("is idempotent", async () => {
    const again = await purgeExpiredData(db, NOW);
    expect(Object.values(again).every((n) => n === 0)).toBe(true);
  });
});
