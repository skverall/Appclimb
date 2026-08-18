import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ getDb: () => null }));
vi.mock("@/lib/apple-ads", () => ({
  AppleAdsError: class AppleAdsError extends Error {},
  readAppleAdsCredentials: () => ({ token: "t", orgId: "o" }),
  lookupSearchTermPopularity: async () =>
    [{ term: "meditation", found: true, searchPopularity1to100: 50, genre: "HEALTH" }],
}));

import { POST } from "./route";

const makeRequest = (ip: string) =>
  new NextRequest("http://localhost/api/popularity", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ country: "US", items: [{ term: "meditation", genre: "Health & Fitness" }] }),
  });

describe("/api/popularity quota (guest 30/day)", () => {
  beforeEach(() => {
    process.env.PRO_ENABLED = "1";
  });
  afterEach(() => {
    delete process.env.PRO_ENABLED;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("allows the 30th lookup and returns 429 on the 31st for the same IP", async () => {
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    for (let i = 0; i < 30; i += 1) {
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
