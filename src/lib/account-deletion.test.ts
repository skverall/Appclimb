import { beforeAll, describe, expect, it } from "vitest";

import { createMagicLink, createSession, upsertUser } from "@/lib/auth";
import { deleteAccount, subscriptionStillBills } from "@/lib/account-deletion";
import type { SubscriptionRecord } from "@/lib/entitlement";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadAllMigrationsSql } from "../../tests/helpers/migration";

let db: FakeD1;

/** Tables that hold a user's rows, and the column that ties them to the user. */
const USER_TABLES: Array<[string, string]> = [
  ["users", "id"],
  ["sessions", "user_id"],
  ["subscriptions", "user_id"],
  ["sync_blobs", "user_id"],
  ["email_prefs", "user_id"],
  ["digest_log", "user_id"],
  ["oauth_codes", "user_id"],
  ["agent_tokens", "user_id"],
];

async function rowsFor(userId: string, email: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [table, column] of USER_TABLES) {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`).bind(userId).first<{ n: number }>();
    counts[table] = Number(row?.n ?? 0);
  }
  for (const table of ["ai_usage", "agent_usage"]) {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE subject = ?`).bind(`user:${userId}`).first<{ n: number }>();
    counts[table] = Number(row?.n ?? 0);
  }
  const links = await db.prepare("SELECT COUNT(*) AS n FROM magic_links WHERE email = ?").bind(email).first<{ n: number }>();
  counts.magic_links = Number(links?.n ?? 0);
  return counts;
}

async function populate(email: string, subscription?: Partial<SubscriptionRecord>) {
  const user = await upsertUser(db, { email, emailVerified: true });
  await createSession(db, user.id);
  await createMagicLink(db, email);
  if (subscription) {
    await db
      .prepare(
        `INSERT INTO subscriptions (user_id, paddle_customer_id, paddle_subscription_id, status, price_id, plan, current_period_end, cancel_at_period_end)
         VALUES (?, 'ctm_1', ?, ?, 'pri_1', 'pro', ?, ?)`,
      )
      .bind(
        user.id,
        subscription.paddle_subscription_id ?? `sub_${user.id}`,
        subscription.status ?? "active",
        subscription.current_period_end ?? "2099-01-01T00:00:00.000Z",
        subscription.cancel_at_period_end ?? 0,
      )
      .run();
  }
  await db.prepare("INSERT INTO sync_blobs (user_id, blob_key, json) VALUES (?, 'tracker', '{}')").bind(user.id).run();
  await db.prepare("INSERT INTO email_prefs (user_id, weekly_digest) VALUES (?, 0)").bind(user.id).run();
  await db.prepare("INSERT INTO digest_log (user_id, week, status) VALUES (?, '2026-W44', 'sent')").bind(user.id).run();
  await db
    .prepare(
      `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
       VALUES (?, 'c', ?, 'https://x.example/cb', 'ch', 'appclimb', 'r', '2099-01-01T00:00:00.000Z')`,
    )
    .bind(`code-${user.id}`, user.id)
    .run();
  await db
    .prepare(
      `INSERT INTO agent_tokens (id, kind, user_id, access_hash, scope, resource) VALUES (?, 'api_key', ?, ?, 'appclimb', 'r')`,
    )
    .bind(`key-${user.id}`, user.id, `access-${user.id}`)
    .run();
  for (const table of ["ai_usage", "agent_usage"]) {
    await db
      .prepare(`INSERT INTO ${table} (subject, day, count, updated_at) VALUES (?, '2026-11-03', 3, '2026-11-03T00:00:00Z')`)
      .bind(`user:${user.id}`)
      .run();
  }
  return user;
}

beforeAll(async () => {
  db = await createTestDb(loadAllMigrationsSql());
});

describe("subscriptionStillBills", () => {
  const base: SubscriptionRecord = {
    user_id: "u",
    paddle_customer_id: "ctm",
    paddle_subscription_id: "sub",
    status: "active",
    price_id: "pri",
    plan: "pro",
    current_period_end: "2099-01-01T00:00:00.000Z",
    cancel_at_period_end: 0,
    updated_at: "",
  };

  it("blocks while Paddle will charge again", () => {
    expect(subscriptionStillBills(base)).toBe(true);
    expect(subscriptionStillBills({ ...base, status: "past_due" })).toBe(true);
    expect(subscriptionStillBills({ ...base, status: "paused" })).toBe(true);
  });

  it("allows no subscription, a cancelled one, or one set to end", () => {
    expect(subscriptionStillBills(null)).toBe(false);
    expect(subscriptionStillBills({ ...base, status: "canceled" })).toBe(false);
    expect(subscriptionStillBills({ ...base, cancel_at_period_end: 1 })).toBe(false);
    expect(subscriptionStillBills({ ...base, paddle_subscription_id: null })).toBe(false);
  });
});

describe("deleteAccount", () => {
  it("removes every row tied to the user and leaves other users alone", async () => {
    const gone = await populate("gone@example.com", { status: "canceled" });
    const kept = await populate("kept@example.com");
    // Every table the deletion must reach has rows for this user.
    expect(Object.values(await rowsFor(gone.id, gone.email)).every((n) => n >= 1)).toBe(true);

    expect(await deleteAccount(db, gone)).toEqual({ ok: true });

    const after = await rowsFor(gone.id, gone.email);
    expect(Object.values(after).every((n) => n === 0)).toBe(true);
    const others = await rowsFor(kept.id, kept.email);
    expect(others.users).toBe(1);
    expect(others.sync_blobs).toBe(1);
    expect(others.agent_tokens).toBe(1);
  });

  it("refuses while a Pro subscription will still bill", async () => {
    const pro = await populate("pro@example.com", { status: "active" });
    expect(await deleteAccount(db, pro)).toEqual({ ok: false, reason: "subscription_active" });
    expect((await rowsFor(pro.id, pro.email)).users).toBe(1);
  });

  it("deletes a Pro account already set to cancel", async () => {
    const ending = await populate("ending@example.com", { status: "active", cancel_at_period_end: 1 });
    expect(await deleteAccount(db, ending)).toEqual({ ok: true });
    expect(Object.values(await rowsFor(ending.id, ending.email)).every((n) => n === 0)).toBe(true);
  });
});
