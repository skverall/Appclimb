import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { buildDataset } from "@/lib/search-terms";

vi.mock("@/lib/db", () => ({ getDb: () => null }));
vi.mock("@/lib/apple-ads", () => ({
  readAppleAdsCredentials: () => ({ clientId: "c" }),
}));

const dataset = buildDataset("US", "2026-09-20", [
  { term: "meditation", genre: "HEALTH_FITNESS", popularity: 52, rankInGenre: 241 },
  { term: "sleep sounds", genre: "HEALTH_FITNESS", popularity: 49, rankInGenre: 405 },
  { term: "habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 56 },
]);
const history = Array.from({ length: 52 }, (_, index) => ({
  week: `2025-${String((index % 12) + 1).padStart(2, "0")}-01`,
  popularity: 50 + (index % 3),
}));

vi.mock("@/lib/search-terms-store", () => ({
  HISTORY_WEEKS: 52,
  latestDataset: async () => dataset,
  termHistories: async (_deps: unknown, _dataset: unknown, terms: string[]) =>
    new Map(terms.map((term) => [term.toLowerCase(), term === "meditation" ? history : []])),
}));

import { POST } from "./route";

const makeRequest = (
  ip: string,
  items: unknown = [{ term: "meditation", genre: "Health & Fitness" }],
  extra: Record<string, unknown> = {},
) =>
  new NextRequest("http://localhost/api/popularity", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ country: "US", items, ...extra }),
  });

describe("/api/popularity", () => {
  afterEach(() => {
    delete process.env.PRO_ENABLED;
    vi.restoreAllMocks();
  });

  it("returns official scores and a genre ceiling for long-tail terms", async () => {
    const res = await POST(
      makeRequest("10.1.1.1", [
        { term: "Meditation" },
        { term: "white noise for babies", genre: "Health & Fitness" },
      ]),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.week).toBe("2026-09-20");
    expect(body.results[0]).toMatchObject({
      term: "Meditation",
      found: true,
      genre: "HEALTH_FITNESS",
      searchPopularity1to100: 52,
      rankInGenre: 241,
    });
    expect(body.results[1]).toMatchObject({
      term: "white noise for babies",
      found: false,
      ceiling: 49,
      genre: "HEALTH_FITNESS",
    });
  });

  it("trims Apple history to the plan window (12 weeks on free)", async () => {
    process.env.PRO_ENABLED = "1";
    const res = await POST(makeRequest("10.1.1.2", [{ term: "meditation" }], { history: true }));
    const body = await res.json();
    expect(body.historyWeeks).toBe(12);
    expect(body.results[0].history).toHaveLength(12);
  });

  it("rejects unsupported storefronts and empty term lists", async () => {
    const badCountry = new NextRequest("http://localhost/api/popularity", {
      method: "POST",
      body: JSON.stringify({ country: "ZZ", items: [{ term: "x" }] }),
    });
    expect((await POST(badCountry)).status).toBe(400);
    expect((await POST(makeRequest("10.1.1.3", []))).status).toBe(400);
  });
});

describe("/api/popularity quota (guest 200/day)", () => {
  beforeEach(() => {
    process.env.PRO_ENABLED = "1";
  });
  afterEach(() => {
    delete process.env.PRO_ENABLED;
    vi.restoreAllMocks();
  });

  it("allows the 200th lookup and returns 429 on the 201st for the same IP", async () => {
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    for (let i = 0; i < 200; i += 1) {
      now += 81; // above the 80ms min interval
      const res = await POST(makeRequest("10.7.7.7"));
      expect(res.status, `lookup #${i + 1} should pass`).toBe(200);
    }
    now += 81;
    const blocked = await POST(makeRequest("10.7.7.7"));
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({ error: /limit/i });
  });

  it("does not share the quota across IPs", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    await POST(makeRequest("10.7.7.1"));
    const other = await POST(makeRequest("10.7.7.2"));
    expect(other.status).toBe(200);
  });
});
