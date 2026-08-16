import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyOfficialPopularity,
  enrichMetricsWithOfficialPopularity,
  fetchOfficialPopularity,
  officialLookupItemsFor,
  resetOfficialPopularityCache,
  popularityCaption,
  popularityShortLabel,
  popularitySourceOf,
} from "@/lib/popularity";
import type { KeywordMetrics, TopApp } from "@/lib/aso";

function app(overrides: Partial<TopApp> = {}): TopApp {
  return {
    appStoreId: "1",
    name: "Timer",
    developer: "Studio",
    genre: "Health & Fitness",
    iconUrl: "",
    storeUrl: "",
    ratingsCount: 10,
    ratingAverage: 4,
    position: 1,
    ...overrides,
  };
}

function metrics(overrides: Partial<KeywordMetrics> = {}): KeywordMetrics {
  return {
    keyword: "meditation",
    country: "US",
    popularity: 44,
    popularitySource: "estimated",
    difficulty: 30,
    results: 12,
    saturated: false,
    topApps: [app()],
    sampledAt: "2026-08-16T00:00:00Z",
    ...overrides,
  };
}

afterEach(() => {
  resetOfficialPopularityCache();
});

describe("applyOfficialPopularity", () => {
  it("keeps the estimate when Apple has no row", () => {
    const next = applyOfficialPopularity(metrics(), {
      term: "meditation",
      found: false,
    });
    expect(next.popularity).toBe(44);
    expect(next.popularitySource).toBe("estimated");
  });

  it("replaces the score when Apple returns an official 1–100", () => {
    const next = applyOfficialPopularity(metrics(), {
      term: "meditation",
      found: true,
      genre: "HEALTH_AND_FITNESS",
      searchPopularity1to100: 81,
      searchPopularityInGenre: 90,
      searchPopularity1to5: 5,
      rankInGenre: 3,
    });
    expect(next.popularity).toBe(81);
    expect(next.popularitySource).toBe("official");
    expect(next.appleGenre).toBe("HEALTH_AND_FITNESS");
    expect(next.rankInGenre).toBe(3);
  });
});

describe("officialLookupItemsFor", () => {
  it("infers the Ads genre from top apps", () => {
    expect(officialLookupItemsFor(metrics())).toEqual([
      { term: "meditation", genre: "HEALTH_FITNESS" },
    ]);
  });

  it("returns nothing without a mappable genre", () => {
    expect(
      officialLookupItemsFor(metrics({ topApps: [app({ genre: "" })] })),
    ).toEqual([]);
  });
});

describe("labels", () => {
  it("distinguishes official from estimated copy", () => {
    expect(popularitySourceOf({ popularitySource: "official" })).toBe("official");
    expect(popularitySourceOf({})).toBe("estimated");
    expect(popularityShortLabel("official")).toBe("Apple Ads");
    expect(popularityCaption("official")).toMatch(/not search volume/i);
  });
});

describe("fetchOfficialPopularity", () => {
  it("maps found rows and swallows HTTP failures", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [
          { term: "Meditation", found: true, searchPopularity1to100: 70 },
        ],
      }),
    );
    const found = await fetchOfficialPopularity(
      [{ term: "meditation", genre: "HEALTH_AND_FITNESS" }],
      "US",
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(found.get("meditation")?.searchPopularity1to100).toBe(70);

    const failed = await fetchOfficialPopularity(
      [{ term: "vpn", genre: "UTILITIES" }],
      "US",
      {
        fetchImpl: vi.fn(async () => new Response("nope", { status: 502 })) as unknown as typeof fetch,
      },
    );
    expect(failed.size).toBe(0);
  });

  it("stops calling the overlay after an unconfigured server", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ configured: false, results: [] }),
    );
    const first = await fetchOfficialPopularity(
      [{ term: "vpn", genre: "UTILITIES" }],
      "US",
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    const second = await fetchOfficialPopularity(
      [{ term: "notes", genre: "PRODUCTIVITY" }],
      "US",
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(first.size).toBe(0);
    expect(second.size).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("enriches metrics from the overlay", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [
          {
            term: "meditation",
            found: true,
            searchPopularity1to100: 66,
            genre: "HEALTH_AND_FITNESS",
          },
        ],
      }),
    );
    const next = await enrichMetricsWithOfficialPopularity(metrics(), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(next.popularity).toBe(66);
    expect(next.popularitySource).toBe("official");
  });
});
