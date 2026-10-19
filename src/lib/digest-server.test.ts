import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { APPLE_ADS_TOKEN_URL, clearAppleAdsTokenCache } from "@/lib/apple-ads";
import type { DigestEmail } from "@/lib/digest";
import {
  digestKindFor,
  previewFreeDigest,
  readDigestEnabled,
  runWeeklyDigest,
  unsubscribeToken,
  verifyUnsubscribeToken,
  writeDigestEnabled,
} from "@/lib/digest-server";
import { resetSearchTermMemory, type StoreDeps } from "@/lib/search-terms-store";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";

const schema = ["0001_init.sql", "0004_search_terms.sql", "0006_weekly_digest.sql"]
  .map((name) => readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8"))
  .join("\n");

const NOW = new Date("2026-10-01T14:00:00Z");
const SECRET = "test-secret";

function trackerJson(name: string): string {
  return JSON.stringify({
    version: 1,
    activeAppKey: "1:US",
    apps: [
      {
        appStoreId: "1",
        name,
        bundleId: "com.example",
        developer: "Example",
        genre: "Health & Fitness",
        iconUrl: "",
        storeUrl: "",
        country: "US",
        addedAt: "2026-09-01",
      },
    ],
    keywords: {
      "1:US:habit tracker": {
        appStoreId: "1",
        country: "US",
        keyword: "habit tracker",
        normalizedKeyword: "habit tracker",
        note: "",
        tags: [],
        createdAt: "2026-09-01",
        lastCheckedAt: "2026-09-30T09:00:00Z",
        currentMetrics: null,
      },
    },
    snapshots: {
      "1:US:habit tracker": [
        { date: "2026-09-23", sampledAt: "2026-09-23T09:00:00Z", position: 18, popularity: 56, difficulty: 40, resultsCount: 200, saturated: false },
        { date: "2026-09-30", sampledAt: "2026-09-30T09:00:00Z", position: 12, popularity: 56, difficulty: 40, resultsCount: 200, saturated: false },
      ],
    },
  });
}

async function addUser(
  db: FakeD1,
  id: string,
  options: {
    /** null = no subscription row, like most free accounts. */
    plan?: "pro" | "free" | null;
    status?: string;
    tracker?: string | null;
    verified?: boolean;
  } = {},
) {
  await db
    .prepare("INSERT INTO users (id, email, email_verified_at) VALUES (?, ?, ?)")
    .bind(id, `${id}@example.com`, options.verified === false ? null : "2026-09-01 10:00:00")
    .run();
  if (options.plan !== null) {
    await db
      .prepare("INSERT INTO subscriptions (user_id, plan, status) VALUES (?, ?, ?)")
      .bind(id, options.plan ?? "pro", options.status ?? "active")
      .run();
  }
  if (options.tracker !== null) {
    await db
      .prepare("INSERT INTO sync_blobs (user_id, blob_key, revision, json) VALUES (?, 'tracker', 1, ?)")
      .bind(id, options.tracker ?? trackerJson(`App ${id}`))
      .run();
  }
}

let db: FakeD1;
let outbox: Array<{ to: string; email: DigestEmail; headers: Record<string, string> }>;

beforeEach(async () => {
  resetSearchTermMemory();
  clearAppleAdsTokenCache();
  db = await createTestDb(schema);
  outbox = [];
});

function run(extra: Partial<Parameters<typeof runWeeklyDigest>[0]> = {}) {
  return runWeeklyDigest({
    db,
    store: null,
    resend: null,
    secret: SECRET,
    siteUrl: "https://appclimb.app",
    now: NOW,
    send: async (to, email, headers) => {
      outbox.push({ to, email, headers });
      return true;
    },
    ...extra,
  });
}

describe("unsubscribe tokens", () => {
  it("verify only for the same user and secret", async () => {
    const token = await unsubscribeToken(SECRET, "u1");
    expect(token).toMatch(/^[\w-]{43}$/u);
    expect(await verifyUnsubscribeToken(SECRET, "u1", token)).toBe(true);
    expect(await verifyUnsubscribeToken(SECRET, "u2", token)).toBe(false);
    expect(await verifyUnsubscribeToken("other", "u1", token)).toBe(false);
    expect(await verifyUnsubscribeToken(SECRET, "u1", "short")).toBe(false);
    expect(await verifyUnsubscribeToken("", "u1", token)).toBe(false);
  });
});

describe("email preference", () => {
  it("defaults to on and can be switched off and back", async () => {
    await addUser(db, "u1");
    expect(await readDigestEnabled(db, "u1")).toBe(true);
    await writeDigestEnabled(db, "u1", false);
    expect(await readDigestEnabled(db, "u1")).toBe(false);
    await writeDigestEnabled(db, "u1", true);
    expect(await readDigestEnabled(db, "u1")).toBe(true);
  });
});

describe("runWeeklyDigest", () => {
  it("emails active Pro users once per Apple week, with one-click unsubscribe", async () => {
    await addUser(db, "u1");
    const first = await run();
    expect(first).toMatchObject({ week: "2026-09-20", eligible: 1, sent: 1, failed: 0, remaining: 0 });
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe("u1@example.com");
    expect(outbox[0].email.subject).toBe("App u1: 1 up, 0 down this week");
    expect(outbox[0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(outbox[0].headers["List-Unsubscribe"]).toContain("/api/digest/unsubscribe?u=u1&t=");
    expect(outbox[0].email.text).toContain("https://appclimb.app/unsubscribe?u=u1&t=");

    const again = await run();
    expect(again).toMatchObject({ eligible: 0, sent: 0 });
    expect(outbox).toHaveLength(1);
  });

  it("skips opted-out and unsynced Pro users, and holds free accounts without Apple data", async () => {
    await addUser(db, "free", { plan: "free", status: "free" });
    await addUser(db, "paused", { status: "paused" });
    await addUser(db, "off");
    await writeDigestEnabled(db, "off", false);
    await addUser(db, "nosync", { tracker: null });
    const result = await run();
    // Free and lapsed accounts get the free email, which needs Apple's week.
    expect(result).toMatchObject({ eligible: 0, pro: 0, free: 0, freeHeld: 2, sent: 0 });
    expect(outbox).toHaveLength(0);
    // Held accounts aren't logged, so a later run can still email them.
    const { results } = await db.prepare("SELECT user_id FROM digest_log").all();
    expect(results).toEqual([]);
  });

  it("logs empty trackers as skipped and retries failed sends", async () => {
    await addUser(db, "empty", { tracker: JSON.stringify({ version: 1, apps: [], keywords: {}, snapshots: {} }) });
    await addUser(db, "flaky");
    const failing = await run({ send: async () => false });
    expect(failing).toMatchObject({ eligible: 2, sent: 0, skipped: 1, failed: 1 });
    const retry = await run();
    expect(retry).toMatchObject({ eligible: 1, sent: 1 });
    expect(outbox.map((item) => item.to)).toEqual(["flaky@example.com"]);
  });

  it("batches by limit and dry runs report counts without sending or logging", async () => {
    await addUser(db, "a");
    await addUser(db, "b");
    await addUser(db, "c");
    const dry = await run({ dryRun: true, limit: 2 });
    expect(dry).toMatchObject({ eligible: 3, built: 2, sent: 0, remaining: 1 });
    expect(outbox).toHaveLength(0);
    expect(await run({ limit: 2 })).toMatchObject({ sent: 2, remaining: 1 });
    expect(await run({ limit: 2 })).toMatchObject({ sent: 1, remaining: 0 });
  });

  it("does not send without an email provider", async () => {
    await addUser(db, "u1");
    const result = await run({ send: undefined });
    expect(result).toMatchObject({ sent: 0, failed: 1 });
  });
});

async function testCreds() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let binary = "";
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  return {
    clientId: "c",
    teamId: "t",
    keyId: "k",
    adAccountId: "1",
    privateKey: `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`,
  };
}

/** Fake Apple Ads: two published weeks plus weekly history for tracked terms. */
async function appleStore(): Promise<StoreDeps> {
  const row = (term: string, popularity: number, genre = "HEALTH_FITNESS") => ({
    searchTerm: term,
    genre,
    searchPopularity1to100: popularity,
    rankInGenre: 100 - popularity,
  });
  const weeks: Record<string, Array<Record<string, unknown>>> = {
    "2026-09-20": [
      row("habit tracker", 56),
      row("water tracker", 51),
      row("step counter", 70),
      row("budget app", 45, "FINANCE"),
      row("flight tracker", 60, "TRAVEL"),
      row("подружка", 59, "SHOPPING"),
      row("tax refund", 50, "FINANCE"),
    ],
    "2026-09-13": [
      row("habit tracker", 53),
      row("water tracker", 49),
      row("step counter", 70),
      row("budget app", 30, "FINANCE"),
      row("flight tracker", 61, "TRAVEL"),
      row("подружка", 40, "SHOPPING"),
    ],
    "2026-08-23": [row("habit tracker", 57), row("water tracker", 44), row("step counter", 70)],
  };
  const history = [
    { searchTerm: "habit tracker", week: "2026-09-13", searchPopularity1to100: 53 },
    { searchTerm: "habit tracker", week: "2026-09-20", searchPopularity1to100: 56 },
  ];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === APPLE_ADS_TOKEN_URL) return Response.json({ access_token: "tok", expires_in: 3600 });
    const body = JSON.parse(String(init?.body)) as {
      filters: Array<{ field: string; value: unknown }>;
      timeRange: { start: string };
      pagination: { offset: number; pageSize: number };
    };
    const termFilter = body.filters.find((filter) => filter.field === "searchTerm");
    if (termFilter) {
      const wanted = new Set(termFilter.value as string[]);
      return Response.json({ result: { rows: history.filter((item) => wanted.has(item.searchTerm)) } });
    }
    const all = weeks[body.timeRange.start] ?? [];
    return Response.json({ result: { rows: all.slice(body.pagination.offset, body.pagination.offset + body.pagination.pageSize) } });
  });
  return { creds: await testCreds(), db, fetchImpl: fetchImpl as never, now: () => NOW };
}

describe("runWeeklyDigest with Apple data", () => {
  it("adds this week's popularity change and rising terms the user doesn't track", async () => {
    await addUser(db, "u1");
    const result = await run({ store: await appleStore() });
    expect(result).toMatchObject({ week: "2026-09-20", sent: 1 });
    const { text, html } = outbox[0].email;
    expect(text).toContain("habit tracker  56 (+3)");
    expect(text).toContain("Rising in Health & Fitness (4 weeks)");
    expect(text).toContain("water tracker  51 (+7)  https://appclimb.app/keywords/us/health-fitness/water-tracker");
    expect(text).not.toContain("step counter");
    expect(html).toContain("Health &amp; Fitness");
  });
});

describe("digestKindFor", () => {
  const now = NOW.getTime();
  const base = { email_verified_at: "2026-09-01", plan: null, status: null, current_period_end: null, json: null };

  it("gives Pro users with a synced tracker the Pro email", () => {
    expect(digestKindFor({ ...base, plan: "pro", status: "active", json: "{}" }, now)).toBe("pro");
    expect(digestKindFor({ ...base, plan: "pro", status: "active", json: null }, now)).toBeNull();
  });

  it("gives verified free, canceled, and lapsed accounts the free email", () => {
    expect(digestKindFor(base, now)).toBe("free");
    expect(digestKindFor({ ...base, plan: "free", status: "free" }, now)).toBe("free");
    expect(digestKindFor({ ...base, plan: "pro", status: "paused", json: "{}" }, now)).toBe("free");
    expect(
      digestKindFor({ ...base, plan: "pro", status: "canceled", current_period_end: "2026-09-01T00:00:00Z" }, now),
    ).toBe("free");
    // Canceled but still paid up: still Pro.
    expect(
      digestKindFor(
        { ...base, plan: "pro", status: "canceled", current_period_end: "2026-10-20T00:00:00Z", json: "{}" },
        now,
      ),
    ).toBe("pro");
  });

  it("never emails an unverified free address", () => {
    expect(digestKindFor({ ...base, email_verified_at: null }, now)).toBeNull();
  });
});

describe("runWeeklyDigest for free accounts", () => {
  it("emails verified free accounts Apple's risers once per week, with one-click unsubscribe", async () => {
    await addUser(db, "f1", { plan: null, tracker: null });
    await addUser(db, "f2", { plan: "free", status: "free", tracker: null });
    await addUser(db, "unverified", { plan: null, tracker: null, verified: false });
    await addUser(db, "quiet", { plan: null, tracker: null });
    await writeDigestEnabled(db, "quiet", false);
    const store = await appleStore();

    const first = await run({ store });
    expect(first).toMatchObject({ week: "2026-09-20", eligible: 2, pro: 0, free: 2, sent: 2, failed: 0, remaining: 0 });
    expect(first.freeHeld).toBeUndefined();
    expect(outbox.map((item) => item.to)).toEqual(["f1@example.com", "f2@example.com"]);
    const { email, headers } = outbox[0];
    expect(email.subject).toBe("Apple’s latest week: “budget app” up 15 in popularity");
    expect(email.text).toContain("Biggest risers · US App Store");
    expect(email.text).toContain("  budget app · Finance  45 (+15)  https://appclimb.app/?kw=budget%20app&country=US");
    expect(email.text).toContain("  habit tracker · Health & Fitness  56 (+3)");
    expect(email.text).toContain("  water tracker · Health & Fitness  51 (+2)");
    // Falling and unchanged terms aren't risers, nor are terms in a script US shoppers don't use.
    expect(email.text).not.toContain("подружка");
    expect(email.text).not.toContain("flight tracker");
    expect(email.text).not.toContain("step counter");
    expect(email.text).toContain("since the week of Sep 13.");
    expect(email.text).toContain("You get this weekly because you have a free AppClimb account.");
    expect(email.text).toContain("https://appclimb.app/unsubscribe?u=f1&t=");
    expect(headers["List-Unsubscribe"]).toContain("/api/digest/unsubscribe?u=f1&t=");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    const again = await run({ store });
    expect(again).toMatchObject({ eligible: 0, sent: 0 });
    expect(outbox).toHaveLength(2);
  });

  it("sends Pro and free emails in one run, batched by id", async () => {
    await addUser(db, "a-free", { plan: null, tracker: null });
    await addUser(db, "b-pro");
    await addUser(db, "c-free", { plan: null, tracker: null });
    const store = await appleStore();
    expect(await run({ store, limit: 2 })).toMatchObject({ eligible: 3, pro: 1, free: 2, sent: 2, remaining: 1 });
    expect(await run({ store, limit: 2 })).toMatchObject({ eligible: 1, sent: 1, remaining: 0 });
    expect(outbox.map((item) => [item.to, item.email.text.includes("free AppClimb account")])).toEqual([
      ["a-free@example.com", true],
      ["b-pro@example.com", false],
      ["c-free@example.com", true],
    ]);
  });

  it("uses a former Pro user's synced keywords for Apple's numbers, never their frozen ranks", async () => {
    await addUser(db, "lapsed", { status: "paused" });
    await db.prepare("UPDATE sync_blobs SET updated_at = '2026-09-30 09:00:00' WHERE user_id = 'lapsed'").run();
    const result = await run({ store: await appleStore() });
    expect(result).toMatchObject({ pro: 0, free: 1, sent: 1 });
    const { email } = outbox[0];
    expect(email.subject).toBe("1 of your keywords moved in Apple’s new week");
    expect(email.text).toContain("Your keywords · Apple popularity this week");
    expect(email.text).toContain("  habit tracker  56 (+3)");
    expect(email.text).toContain("Keywords from your last cloud sync, Sep 30.");
    expect(email.text).not.toMatch(/#12|#18|top 10/u);
    expect(email.text).toContain("free AppClimb account");
  });

  it("dry runs count free emails without sending or logging", async () => {
    await addUser(db, "f1", { plan: null, tracker: null });
    await addUser(db, "p1");
    const store = await appleStore();
    const dry = await run({ store, dryRun: true });
    expect(dry).toMatchObject({ eligible: 2, pro: 1, free: 1, built: 2, sent: 0, skipped: 0 });
    expect(outbox).toHaveLength(0);
    const { results } = await db.prepare("SELECT user_id FROM digest_log").all();
    expect(results).toEqual([]);
  });

  it("holds free accounts when Apple's previous week is missing, then sends", async () => {
    await addUser(db, "f1", { plan: null, tracker: null });
    const apple = await appleStore();
    const original = apple.fetchImpl as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    const store: StoreDeps = {
      ...apple,
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) =>
        String(init?.body ?? "").includes("2026-09-13")
          ? Response.json({ result: { rows: [] } })
          : original(input, init)) as never,
    };
    expect(await run({ store })).toMatchObject({ eligible: 0, free: 0, freeHeld: 1, sent: 0 });
    expect(outbox).toHaveLength(0);

    resetSearchTermMemory();
    await db.prepare("DELETE FROM search_term_weeks WHERE week = '2026-09-13'").run();
    expect(await run({ store: await appleStore() })).toMatchObject({ free: 1, sent: 1 });
  });
});

describe("previewFreeDigest", () => {
  it("builds this week's free email with a placeholder unsubscribe link", async () => {
    const { email } = await previewFreeDigest({ store: await appleStore(), siteUrl: "https://appclimb.app" });
    expect(email?.subject).toBe("Apple’s latest week: “budget app” up 15 in popularity");
    expect(email?.text).toMatch(/Stop these emails: https:\/\/appclimb\.app\/unsubscribe$/u);
    expect(email?.text).not.toContain("Your keywords");
  });

  it("returns the Apple data behind it: last week's score, recent history, and newcomers", async () => {
    const { market } = await previewFreeDigest({ store: await appleStore(), siteUrl: "https://appclimb.app" });
    expect(market).toMatchObject({ week: "2026-09-20", compareWeek: "2026-09-13", country: "US" });
    expect(market?.risers.map((item) => [item.term, item.previousPopularity, item.popularity, item.delta])).toEqual([
      ["budget app", 30, 45, 15],
      ["habit tracker", 53, 56, 3],
      ["water tracker", 49, 51, 2],
    ]);
    expect(market?.risers[1].history).toEqual([
      { week: "2026-09-13", popularity: 53 },
      { week: "2026-09-20", popularity: 56 },
    ]);
    // Apple has no history rows for it in this fake: an empty chart, not a made-up one.
    expect(market?.risers[0].history).toEqual([]);
    expect(market?.newcomers).toEqual([
      {
        term: "tax refund",
        categoryLabel: "Finance",
        popularity: 50,
        href: "https://appclimb.app/?kw=tax%20refund&country=US",
      },
    ]);
  });

  it("is empty without Apple data", async () => {
    expect(await previewFreeDigest({ store: null, siteUrl: "https://appclimb.app" })).toEqual({
      market: null,
      email: null,
    });
  });
});
