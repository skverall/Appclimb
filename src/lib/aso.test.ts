import { describe, expect, it } from "vitest";

import {
  BACKFILL_DAYS,
  SEARCH_LIMIT,
  addKeywordToList,
  backfillHistory,
  deleteRecord,
  estimateMetrics,
  fetchKeywordResults,
  keywordJitter,
  loadKeywordList,
  loadRecord,
  recordSnapshot,
  relatedKeywords,
  removeKeywordFromList,
  saveKeywordList,
  suggestKeywords,
  toLocalDate,
  trendDelta,
  type KeywordMetrics,
  type KeywordStorage,
  type TopApp,
} from "@/lib/aso";

function makeStorage(initial: Record<string, string> = {}): KeywordStorage {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function makeApp(overrides: Partial<TopApp> = {}): TopApp {
  return {
    appStoreId: "1",
    name: "Meditation Timer",
    developer: "Indie Studio",
    genre: "Health & Fitness",
    iconUrl: "https://example.com/icon.png",
    storeUrl: "https://apps.apple.com/app/id1",
    ratingsCount: 5000,
    ratingAverage: 4.6,
    position: 1,
    ...overrides,
  };
}

function metricsFor(
  keyword: string,
  apps: TopApp[],
  saturated = false,
): KeywordMetrics {
  return estimateMetrics(keyword, "US", apps, saturated, "2026-08-02T12:00:00Z");
}

describe("estimateMetrics", () => {
  it("scores empty results as 2/2 (no demand, nothing to beat)", () => {
    const metrics = metricsFor("nobody searches this", []);
    expect(metrics.popularity).toBe(2);
    expect(metrics.difficulty).toBe(2);
    expect(metrics.results).toBe(0);
  });

  it("scores a saturated list with strong incumbents as high", () => {
    const apps = Array.from({ length: 200 }, (_, index) =>
      makeApp({
        position: index + 1,
        ratingsCount: 200_000,
        name: `App ${index + 1}`,
      }),
    );
    const metrics = metricsFor("popular term", apps, true);
    expect(metrics.popularity).toBeGreaterThanOrEqual(70);
    expect(metrics.difficulty).toBeGreaterThanOrEqual(50);
  });

  it("scores a niche term with few weak results as low-to-mid", () => {
    const apps = [
      makeApp({ ratingsCount: 40 }),
      makeApp({ position: 2, ratingsCount: 12 }),
    ];
    const metrics = metricsFor("obscure tool", apps);
    expect(metrics.popularity).toBeLessThanOrEqual(40);
    expect(metrics.difficulty).toBeLessThanOrEqual(30);
  });

  it("is deterministic for the same inputs", () => {
    const apps = [makeApp(), makeApp({ position: 2, ratingsCount: 100 })];
    expect(metricsFor("habit tracker", apps)).toEqual(
      metricsFor("habit tracker", apps),
    );
  });

  it("keeps scores inside the 2–98 band", () => {
    const apps = Array.from({ length: 200 }, (_, index) =>
      makeApp({ position: index + 1, ratingsCount: 999_999 }),
    );
    const metrics = metricsFor("maximum", apps, true);
    expect(metrics.popularity).toBeLessThanOrEqual(98);
    expect(metrics.difficulty).toBeLessThanOrEqual(98);
  });

  it("bumps difficulty when mega-brands dominate the top 10", () => {
    const brandApps = Array.from({ length: 10 }, (_, index) =>
      makeApp({
        position: index + 1,
        developer: "Google",
        ratingsCount: 300_000,
      }),
    );
    const indieApps = Array.from({ length: 10 }, (_, index) =>
      makeApp({
        position: index + 1,
        developer: "Small Studio",
        ratingsCount: 300_000,
      }),
    );
    const withBrands = metricsFor("term", brandApps);
    const withoutBrands = metricsFor("term", indieApps);
    expect(withBrands.difficulty).toBeGreaterThan(withoutBrands.difficulty);
  });
});

describe("keywordJitter", () => {
  it("is deterministic and bounded to -4..+4", () => {
    const first = keywordJitter("meditation");
    expect(keywordJitter("meditation")).toBe(first);
    expect(first).toBeGreaterThanOrEqual(-4);
    expect(first).toBeLessThanOrEqual(4);
    expect(keywordJitter("yoga")).not.toBe(first);
  });
});

describe("fetchKeywordResults", () => {
  it("requests the catalog with the bounded limit and maps results", async () => {
    let calledUrl = "";
    const { apps, saturated } = await fetchKeywordResults("meditation", "us", {
      fetchImpl: (async (input: RequestInfo | URL) => {
        calledUrl = String(input);
        return new Response(
          JSON.stringify({
            results: [
              { trackId: 1, trackName: "Calm", userRatingCount: 50, averageUserRating: 4.5 },
              { trackId: 2, trackName: "Headspace" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as typeof fetch,
    });
    expect(calledUrl).toContain("/search?");
    expect(calledUrl).toContain(`limit=${SEARCH_LIMIT}`);
    expect(calledUrl).toContain("country=US");
    expect(apps).toHaveLength(2);
    expect(apps[0].ratingsCount).toBe(50);
    expect(apps[0].ratingAverage).toBe(4.5);
    expect(apps[0].position).toBe(1);
    expect(saturated).toBe(false);
  });

  it("reports saturation when the result list hits the cap", async () => {
    const results = Array.from({ length: SEARCH_LIMIT }, (_, index) => ({
      trackId: index + 1,
      trackName: `App ${index + 1}`,
    }));
    const { saturated, apps } = await fetchKeywordResults("big", "US", {
      fetchImpl: (async () =>
        new Response(JSON.stringify({ results }), { status: 200 })) as typeof fetch,
    });
    expect(saturated).toBe(true);
    expect(apps).toHaveLength(SEARCH_LIMIT);
  });

  it("throws on non-2xx responses", async () => {
    await expect(
      fetchKeywordResults("term", "US", {
        fetchImpl: (async () =>
          new Response("nope", { status: 403 })) as typeof fetch,
      }),
    ).rejects.toThrow("app_store_catalog_unavailable:403");
  });
});

describe("history backfill", () => {
  const metrics = metricsFor("meditation", [makeApp()]);

  it("produces days+1 ascending points ending on the measured values", () => {
    const history = backfillHistory(metrics);
    expect(history).toHaveLength(BACKFILL_DAYS + 1);
    const last = history[history.length - 1];
    expect(last.date).toBe(toLocalDate());
    expect(last.popularity).toBe(metrics.popularity);
    expect(last.difficulty).toBe(metrics.difficulty);
    const dates = history.map((point) => point.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("is deterministic for the same keyword", () => {
    expect(backfillHistory(metrics)).toEqual(backfillHistory(metrics));
  });

  it("stays inside the 2–98 band", () => {
    for (const point of backfillHistory(metrics)) {
      expect(point.popularity).toBeGreaterThanOrEqual(2);
      expect(point.popularity).toBeLessThanOrEqual(98);
      expect(point.difficulty).toBeGreaterThanOrEqual(2);
      expect(point.difficulty).toBeLessThanOrEqual(98);
    }
  });
});

describe("record persistence", () => {
  it("creates a backfilled record on first check", () => {
    const storage = makeStorage();
    const metrics = metricsFor("meditation", [makeApp()]);
    const record = recordSnapshot(storage, metrics);
    expect(record.keyword).toBe("meditation");
    expect(record.backfilled).toBe(true);
    expect(record.history).toHaveLength(BACKFILL_DAYS + 1);
    expect(loadRecord(storage, "meditation", "US")?.keyword).toBe("meditation");
  });

  it("keeps one snapshot per day and appends later days", () => {
    const storage = makeStorage();
    const metrics = metricsFor("meditation", [makeApp()]);
    recordSnapshot(storage, metrics);
    recordSnapshot(storage, metrics); // same day: replace, not append
    const record = loadRecord(storage, "meditation", "US");
    expect(record?.history).toHaveLength(BACKFILL_DAYS + 1);
    expect(record?.history[record.history.length - 1].popularity).toBe(
      metrics.popularity,
    );
  });

  it("ignores corrupt records", () => {
    const storage = makeStorage({
      "appclimb:kw:v1:US:broken": "{not json",
    });
    expect(loadRecord(storage, "broken", "US")).toBeNull();
  });

  it("deleteRecord removes the persisted history", () => {
    const storage = makeStorage();
    const metrics = metricsFor("meditation", [makeApp()]);
    recordSnapshot(storage, metrics);
    deleteRecord(storage, "meditation", "US");
    expect(loadRecord(storage, "meditation", "US")).toBeNull();
  });
});

describe("keyword list", () => {
  it("dedupes case-insensitively and puts new keywords first", () => {
    const storage = makeStorage();
    addKeywordToList(storage, "US", "Meditation");
    addKeywordToList(storage, "US", "yoga");
    addKeywordToList(storage, "US", "MEDITATION");
    expect(loadKeywordList(storage, "US")).toEqual(["MEDITATION", "yoga"]);
  });

  it("removes keywords and persists the change", () => {
    const storage = makeStorage();
    saveKeywordList(storage, "US", ["meditation", "yoga"]);
    removeKeywordFromList(storage, "US", "Yoga");
    expect(loadKeywordList(storage, "US")).toEqual(["meditation"]);
  });
});

describe("trendDelta", () => {
  it("returns null with fewer than two points", () => {
    expect(trendDelta([{ date: "2026-08-01", popularity: 50, difficulty: 40 }])).toBeNull();
  });

  it("returns the popularity change between the last two points", () => {
    const history = [
      { date: "2026-08-01", popularity: 50, difficulty: 40 },
      { date: "2026-08-02", popularity: 56, difficulty: 38 },
    ];
    expect(trendDelta(history)).toBe(6);
  });
});

describe("related keywords", () => {
  it("excludes the seed and returns phrases from top app metadata", () => {
    const apps = [
      makeApp({ name: "Meditation Timer" }),
      makeApp({ name: "Calm", position: 2 }),
    ];
    const related = relatedKeywords(apps, "meditation");
    expect(related).not.toContain("meditation");
    expect(related.length).toBeGreaterThan(0);
    expect(related.length).toBeLessThanOrEqual(8);
  });

  it("returns the exact term first in suggestions", () => {
    const suggestions = suggestKeywords("fitness", [
      {
        appStoreId: "1",
        name: "Fitness App",
        bundleId: "com.example.fitness",
        developer: "Example",
        genre: "Health & Fitness",
        iconUrl: "",
        storeUrl: "",
      },
    ]);
    expect(suggestions[0]).toBe("fitness");
  });
});

describe("toLocalDate", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(toLocalDate(new Date(2026, 7, 2, 10, 30))).toBe("2026-08-02");
  });
});
