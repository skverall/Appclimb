import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APPLE_ADS_TOKEN_URL, clearAppleAdsTokenCache } from "@/lib/apple-ads";
import {
  latestDataset,
  loadWeek,
  resetSearchTermMemory,
  termHistories,
  type StoreDeps,
} from "@/lib/search-terms-store";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";

const migration = readFileSync(
  new URL("../../migrations/0004_search_terms.sql", import.meta.url),
  "utf8",
);

async function testCreds() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
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

interface QueryBody {
  filters: Array<{ field: string; value: unknown }>;
  timeRange: { start: string };
  pagination: { offset: number; pageSize: number };
}

/** Fake Apple: `weeks` maps a week start to its published rows. */
function fakeApple(
  weeks: Record<string, Array<Record<string, unknown>>>,
  history: Array<Record<string, unknown>> = [],
) {
  const calls: QueryBody[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === APPLE_ADS_TOKEN_URL) {
      return Response.json({ access_token: "tok", expires_in: 3600 });
    }
    const body = JSON.parse(String(init?.body)) as QueryBody;
    calls.push(body);
    const termFilter = body.filters.find((filter) => filter.field === "searchTerm");
    if (termFilter) {
      const wanted = new Set(termFilter.value as string[]);
      return Response.json({
        result: { rows: history.filter((row) => wanted.has(String(row.searchTerm))) },
      });
    }
    const all = weeks[body.timeRange.start] ?? [];
    const { offset, pageSize } = body.pagination;
    return Response.json({ result: { rows: all.slice(offset, offset + pageSize) } });
  });
  return { fetchImpl, calls };
}

const NOW = new Date("2026-10-01T12:00:00Z"); // latest complete week starts 2026-09-20
const week = (term: string, popularity: number, genre = "HEALTH_FITNESS") => ({
  searchTerm: term,
  genre,
  searchPopularity1to100: popularity,
  rankInGenre: 100 - popularity,
});

let db: FakeD1;

beforeEach(async () => {
  resetSearchTermMemory();
  clearAppleAdsTokenCache();
  db = await createTestDb(migration);
});

afterEach(() => {
  db.close();
});

async function deps(fetchImpl: typeof fetch, withDb = true): Promise<StoreDeps> {
  return {
    creds: await testCreds(),
    db: withDb ? db : null,
    fetchImpl,
    now: () => NOW,
  };
}

describe("loadWeek", () => {
  it("pages through Apple once, persists to D1, then serves from D1", async () => {
    const big = Array.from({ length: 4200 }, (_, index) =>
      week(`term ${index}`, 41 + (index % 50)),
    );
    big.push(week("unknown genre", 60, "MEDICAL"));
    const apple = fakeApple({ "2026-09-20": big });
    const first = await loadWeek(await deps(apple.fetchImpl as never), "US", "2026-09-20");
    expect(first?.rows).toHaveLength(4200);
    // Pages 0..4000: four full pages and a short fifth one.
    expect(apple.calls).toHaveLength(5);
    const stored = await db
      .prepare("SELECT status, term_count FROM search_term_weeks")
      .first<{ status: string; term_count: number }>();
    expect(stored).toEqual({ status: "ready", term_count: 4200 });

    resetSearchTermMemory();
    const again = await loadWeek(await deps(apple.fetchImpl as never), "US", "2026-09-20");
    expect(again?.byTerm.get("term 7")?.popularity).toBe(48);
    expect(apple.calls).toHaveLength(5);
  });

  it("remembers that Apple has not published a week yet", async () => {
    const apple = fakeApple({});
    const store = await deps(apple.fetchImpl as never);
    expect(await loadWeek(store, "US", "2026-09-27")).toBeNull();
    expect(await loadWeek(store, "US", "2026-09-27")).toBeNull();
    expect(apple.calls).toHaveLength(1);
  });
});

describe("rate limits", () => {
  it("backs off and retries when Apple answers 429", async () => {
    let popularityCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === APPLE_ADS_TOKEN_URL) {
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      popularityCalls += 1;
      if (popularityCalls <= 2) return new Response("slow down", { status: 429 });
      return Response.json({ result: { rows: [week("meditation", 52)] } });
    });
    const sleeps: number[] = [];
    const store = {
      ...(await deps(fetchImpl as never, false)),
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    };
    const dataset = await loadWeek(store, "US", "2026-09-20");
    expect(dataset?.rows).toHaveLength(1);
    expect(sleeps).toEqual([2_000, 5_000]);
  });
});

describe("latestDataset", () => {
  it("falls back to the previous week while the newest is unpublished", async () => {
    const apple = fakeApple({
      "2026-09-13": [week("meditation", 53)],
    });
    const dataset = await latestDataset(await deps(apple.fetchImpl as never, false), "US");
    expect(dataset?.week).toBe("2026-09-13");
    expect(dataset?.byTerm.get("meditation")?.popularity).toBe(53);
  });
});

describe("termHistories", () => {
  it("fetches history once per week and caches it in D1, including misses", async () => {
    const apple = fakeApple(
      { "2026-09-20": [week("meditation", 52)] },
      [
        { searchTerm: "meditation", week: "2026-09-13", searchPopularity1to100: 53 },
        { searchTerm: "meditation", week: "2026-09-20", searchPopularity1to100: 52 },
        { searchTerm: "meditation", week: "2026-09-20", searchPopularity1to100: 51 },
      ],
    );
    const store = await deps(apple.fetchImpl as never);
    const dataset = await latestDataset(store, "US");
    if (!dataset) throw new Error("expected dataset");
    const callsAfterWeek = apple.calls.length;

    const histories = await termHistories(store, dataset, ["Meditation", "white noise"]);
    expect(histories.get("meditation")).toEqual([
      { week: "2026-09-13", popularity: 53 },
      { week: "2026-09-20", popularity: 52 },
    ]);
    expect(histories.get("white noise")).toEqual([]);
    expect(apple.calls.length).toBe(callsAfterWeek + 1);
    const historyQuery = apple.calls[apple.calls.length - 1];
    expect(historyQuery.timeRange.start).toBe("2025-09-28");

    resetSearchTermMemory();
    const again = await termHistories(store, dataset, ["meditation", "white noise"]);
    expect(again.get("meditation")).toHaveLength(2);
    expect(apple.calls.length).toBe(callsAfterWeek + 1);
  });
});
