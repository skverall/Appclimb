import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { APPLE_ADS_TOKEN_URL, clearAppleAdsTokenCache } from "@/lib/apple-ads";
import type { DigestEmail } from "@/lib/digest";
import {
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
  options: { plan?: "pro" | "free"; status?: string; tracker?: string | null } = {},
) {
  await db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").bind(id, `${id}@example.com`).run();
  await db
    .prepare("INSERT INTO subscriptions (user_id, plan, status) VALUES (?, ?, ?)")
    .bind(id, options.plan ?? "pro", options.status ?? "active")
    .run();
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

  it("skips free, lapsed, opted-out, and unsynced users", async () => {
    await addUser(db, "free", { plan: "free", status: "free" });
    await addUser(db, "paused", { status: "paused" });
    await addUser(db, "off");
    await writeDigestEnabled(db, "off", false);
    await addUser(db, "nosync", { tracker: null });
    const result = await run();
    expect(result).toMatchObject({ eligible: 0, sent: 0 });
    expect(outbox).toHaveLength(0);
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
  const row = (term: string, popularity: number) => ({
    searchTerm: term,
    genre: "HEALTH_FITNESS",
    searchPopularity1to100: popularity,
    rankInGenre: 100 - popularity,
  });
  const weeks: Record<string, Array<Record<string, unknown>>> = {
    "2026-09-20": [row("habit tracker", 56), row("water tracker", 51), row("step counter", 70)],
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
