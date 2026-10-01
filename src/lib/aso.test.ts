import { describe, expect, it } from "vitest";

import {
  MAX_STORED_HISTORY_DAYS,
  SEARCH_LIMIT,
  addKeywordToList,
  assessOpportunity,
  buildExplorerCsv,
  deleteRecord,
  estimateKeyword,
  estimateMetrics,
  exportExplorerBackup,
  fetchKeywordResults,
  formatAsoKeywordField,
  loadKeywordList,
  loadRecord,
  parseKeywordBatch,
  recentHistory,
  recordSnapshot,
  restoreMetricsFromRecord,
  relatedKeywords,
  removeKeywordFromList,
  restoreExplorerBackup,
  runBatched,
  saveKeywordList,
  saveRecord,
  scoreDifficulty,
  suggestKeywords,
  titleMatchScore,
  toLocalDate,
  trendDelta,
  type KeywordMetrics,
  type KeywordRecord,
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
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
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
  return estimateMetrics(
    keyword,
    "US",
    apps,
    saturated,
    "2026-08-02T12:00:00Z",
  );
}

describe("estimateMetrics", () => {
  it("scores empty results as 1/1 (no demand, nothing to beat)", () => {
    const metrics = metricsFor("nobody searches this", []);
    expect(metrics.popularity).toBe(1);
    expect(metrics.difficulty).toBe(1);
    expect(metrics.results).toBe(0);
    expect(metrics.evidence?.sampled).toBe(0);
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

  it("keeps scores inside the 1–99 band", () => {
    const apps = Array.from({ length: 200 }, (_, index) =>
      makeApp({ position: index + 1, ratingsCount: 999_999 }),
    );
    const metrics = metricsFor("maximum", apps, true);
    expect(metrics.popularity).toBeLessThanOrEqual(98);
    expect(metrics.difficulty).toBeLessThanOrEqual(98);
  });

  it("bumps difficulty when mega-brands dominate the top 10", () => {
    const top10 = (developer: string) =>
      Array.from({ length: 10 }, (_, index) =>
        makeApp({ position: index + 1, developer, ratingsCount: 800 }),
      );
    const withBrands = metricsFor("term", top10("Google"));
    const withoutBrands = metricsFor("term", top10("Small Studio"));
    expect(withBrands.difficulty).toBeGreaterThan(withoutBrands.difficulty);
    expect(withBrands.evidence?.brandApps).toBe(10);
  });

  it("never adds noise: different keywords with the same results score the same", () => {
    const apps = [makeApp({ name: "Generic App" }), makeApp({ position: 2, name: "Other" })];
    expect(metricsFor("alpha one", apps).difficulty).toBe(metricsFor("beta two", apps).difficulty);
  });
});

describe("scoreDifficulty", () => {
  const top = (count: number, overrides: Partial<TopApp> = {}) =>
    Array.from({ length: count }, (_, index) =>
      makeApp({ position: index + 1, appStoreId: String(index + 1), ...overrides }),
    );

  it("rises when incumbents target the keyword in their names", () => {
    const targeted = scoreDifficulty("sleep sounds", top(10, { name: "Sleep Sounds Pro" }));
    const untargeted = scoreDifficulty("sleep sounds", top(10, { name: "Rain Radio" }));
    expect(targeted.difficulty).toBeGreaterThan(untargeted.difficulty);
    expect(targeted.evidence.titleMatches).toBe(10);
    expect(untargeted.evidence.titleMatches).toBe(0);
  });

  it("weights the top positions most", () => {
    const strongFirst = top(10, { ratingsCount: 50 });
    strongFirst[0] = makeApp({ position: 1, ratingsCount: 500_000 });
    const strongLast = top(10, { ratingsCount: 50 });
    strongLast[9] = makeApp({ position: 10, ratingsCount: 500_000 });
    expect(scoreDifficulty("x y", strongFirst).difficulty).toBeGreaterThan(
      scoreDifficulty("x y", strongLast).difficulty,
    );
  });

  it("treats a dominant app named after the term as a brand search", () => {
    const apps = top(10, { name: "Something", ratingsCount: 2_000 });
    apps[0] = makeApp({ position: 1, name: "Instagram", ratingsCount: 25_000_000 });
    const result = scoreDifficulty("instagram", apps);
    expect(result.evidence.navigational).toBe(true);
    expect(result.difficulty).toBeGreaterThanOrEqual(92);
  });

  it("reports the median and the weakest ranking app", () => {
    const apps = [
      makeApp({ position: 1, ratingsCount: 9_000 }),
      makeApp({ position: 2, ratingsCount: 120 }),
      makeApp({ position: 3, ratingsCount: 3_000 }),
    ];
    const { evidence } = scoreDifficulty("timer", apps);
    expect(evidence.medianRatings).toBe(3_000);
    expect(evidence.weakestRatings).toBe(120);
    expect(evidence.weakestPosition).toBe(2);
    expect(evidence.sampled).toBe(3);
  });

  it("counts missing slots as empty when fewer than 10 apps rank", () => {
    const few = scoreDifficulty("rare", top(3, { ratingsCount: 100_000 }));
    const full = scoreDifficulty("rare", top(10, { ratingsCount: 100_000 }));
    expect(few.difficulty).toBeLessThan(full.difficulty);
  });
});

describe("titleMatchScore", () => {
  it("scores phrase, all-words, and partial matches", () => {
    expect(titleMatchScore("Habit Tracker - Daily Goals", "habit tracker")).toBe(1);
    expect(titleMatchScore("Tracker for every Habit", "habit tracker")).toBe(0.75);
    expect(titleMatchScore("Habits: Tracker & Planner", "habit tracker")).toBe(0.75);
    expect(titleMatchScore("Daily Habit Planner", "habit tracker")).toBeCloseTo(0.175);
    expect(titleMatchScore("Calm", "habit tracker")).toBe(0);
  });

  it("ignores accents and punctuation", () => {
    expect(titleMatchScore("Café-Finder!", "cafe finder")).toBe(1);
  });
});

describe("assessOpportunity", () => {
  it("calls official demand with a beatable first page worth targeting", () => {
    const result = assessOpportunity({ popularity: 58, popularitySource: "official", difficulty: 40 });
    expect(result.verdict).toBe("target");
    expect(result.score).toBeGreaterThan(50);
  });

  it("marks strong incumbents as competitive and entrenched pages as dominated", () => {
    expect(
      assessOpportunity({ popularity: 56, popularitySource: "official", difficulty: 68 }).verdict,
    ).toBe("competitive");
    expect(
      assessOpportunity({ popularity: 70, popularitySource: "official", difficulty: 90 }).verdict,
    ).toBe("dominated");
  });

  it("separates easy long-tail wins from crowded low-demand terms", () => {
    expect(
      assessOpportunity({ popularity: 48, popularitySource: "longtail", difficulty: 30 }).verdict,
    ).toBe("longtail_win");
    expect(
      assessOpportunity({ popularity: 48, popularitySource: "longtail", difficulty: 60 }).verdict,
    ).toBe("low_demand");
  });

  it("flags brand searches as dominated regardless of difficulty", () => {
    const result = assessOpportunity({
      popularity: 80,
      popularitySource: "official",
      difficulty: 60,
      evidence: {
        sampled: 10,
        medianRatings: 1,
        weakestRatings: 1,
        weakestPosition: 9,
        titleMatches: 1,
        brandApps: 1,
        navigational: true,
      },
    });
    expect(result.verdict).toBe("dominated");
  });

  it("points out a weak app already on page one", () => {
    const result = assessOpportunity({
      popularity: 59,
      popularitySource: "official",
      difficulty: 77,
      evidence: {
        sampled: 10,
        medianRatings: 46_000,
        weakestRatings: 41,
        weakestPosition: 10,
        titleMatches: 9,
        brandApps: 0,
        navigational: false,
      },
    });
    expect(result.verdict).toBe("dominated");
    expect(result.reason).toMatch(/#10 has only 41 ratings/);
  });

  it("scores higher demand and lower difficulty higher", () => {
    const base = assessOpportunity({ popularity: 50, popularitySource: "official", difficulty: 50 });
    expect(
      assessOpportunity({ popularity: 60, popularitySource: "official", difficulty: 50 }).score,
    ).toBeGreaterThan(base.score);
    expect(
      assessOpportunity({ popularity: 50, popularitySource: "official", difficulty: 30 }).score,
    ).toBeGreaterThan(base.score);
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
              {
                trackId: 1,
                trackName: "Calm",
                userRatingCount: 50,
                averageUserRating: 4.5,
              },
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
        new Response(JSON.stringify({ results }), {
          status: 200,
        })) as typeof fetch,
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

describe("record persistence", () => {
  it("records only the real measurement on first check — nothing invented", () => {
    const storage = makeStorage();
    const metrics = metricsFor("meditation", [makeApp()]);
    const record = recordSnapshot(storage, metrics);
    expect(record.keyword).toBe("meditation");
    expect(record.backfilled).toBe(false);
    expect(record.history).toHaveLength(1);
    expect(record.history[0].date).toBe(toLocalDate());
    expect(loadRecord(storage, "meditation", "US")?.keyword).toBe("meditation");
  });

  it("keeps one snapshot per day", () => {
    const storage = makeStorage();
    const metrics = metricsFor("meditation", [makeApp()]);
    recordSnapshot(storage, metrics);
    recordSnapshot(storage, { ...metrics, popularity: 61 }); // same day: replace
    const record = loadRecord(storage, "meditation", "US");
    expect(record?.history).toHaveLength(1);
    expect(record?.history[0].popularity).toBe(61);
  });

  it("drops the invented baseline from records saved before Oct 2026", () => {
    const storage = makeStorage();
    saveRecord(storage, {
      keyword: "meditation",
      country: "US",
      firstSeen: "2026-08-01",
      backfilled: true,
      history: [
        { date: "2026-07-03", popularity: 44, difficulty: 50 },
        { date: "2026-07-04", popularity: 47, difficulty: 52 },
        { date: "2026-08-01", popularity: 52, difficulty: 75, popularitySource: "official" },
      ],
    });
    const record = loadRecord(storage, "meditation", "US");
    expect(record?.backfilled).toBe(false);
    expect(record?.history).toEqual([
      { date: "2026-08-01", popularity: 52, difficulty: 75, popularitySource: "official" },
    ]);
  });

  it("keeps Apple's weekly history and difficulty evidence across reloads", () => {
    const storage = makeStorage();
    const metrics: KeywordMetrics = {
      ...metricsFor("meditation", [makeApp()]),
      popularity: 52,
      popularitySource: "official",
      appleGenre: "HEALTH_FITNESS",
      rankInGenre: 241,
      dataWeek: "2026-09-20",
      popularityHistory: [
        { week: "2026-09-13", popularity: 53 },
        { week: "2026-09-20", popularity: 52 },
      ],
    };
    recordSnapshot(storage, metrics);
    const restored = restoreMetricsFromRecord(loadRecord(storage, "meditation", "US")!);
    expect(restored?.popularityHistory).toHaveLength(2);
    expect(restored?.rankInGenre).toBe(241);
    expect(restored?.appleGenre).toBe("HEALTH_FITNESS");
    expect(restored?.dataWeek).toBe("2026-09-20");
    expect(restored?.evidence?.sampled).toBe(1);
  });

  it("persists lastCheck and restores metrics for a reload", () => {
    const storage = makeStorage();
    const metrics = metricsFor("meditation", [makeApp()]);
    recordSnapshot(storage, metrics);
    const record = loadRecord(storage, "meditation", "US");
    expect(record?.lastCheck?.results).toBe(metrics.results);
    expect(record?.lastCheck?.saturated).toBe(metrics.saturated);
    const restored = restoreMetricsFromRecord(record!);
    expect(restored?.popularity).toBe(metrics.popularity);
    expect(restored?.difficulty).toBe(metrics.difficulty);
    expect(restored?.popularitySource).toBe(metrics.popularitySource);
    expect(restored?.results).toBe(metrics.results);
    expect(restored?.topApps).toEqual([]);
    expect(restored?.restored).toBe(true);
  });

  it("restores legacy records without lastCheck with an unknown results count", () => {
    const storage = makeStorage();
    const metrics = metricsFor("meditation", [makeApp()]);
    recordSnapshot(storage, metrics);
    const legacy = loadRecord(storage, "meditation", "US")!;
    delete legacy.lastCheck;
    const restored = restoreMetricsFromRecord(legacy);
    expect(restored?.popularity).toBe(metrics.popularity);
    expect(restored?.results).toBe(0);
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

  it("caps stored history so a long-lived keyword cannot grow unbounded", () => {
    const storage = makeStorage();
    const metrics = metricsFor("meditation", [makeApp()]);
    const seed: KeywordRecord = {
      keyword: "meditation",
      country: "US",
      firstSeen: "2025-12-31",
      backfilled: false,
      history: Array.from({ length: 120 }, () => ({
        date: "2025-12-31",
        popularity: 50,
        difficulty: 40,
        popularitySource: "estimated" as const,
      })),
      lastCheck: { results: 10, saturated: false },
    };
    saveRecord(storage, seed);

    const record = recordSnapshot(storage, metrics);
    expect(record.history).toHaveLength(MAX_STORED_HISTORY_DAYS);
    expect(record.history[record.history.length - 1].date).toBe(toLocalDate());
    expect(loadRecord(storage, "meditation", "US")?.history).toHaveLength(
      MAX_STORED_HISTORY_DAYS,
    );
  });

  it("fails open when localStorage writes are blocked (quota/private mode)", () => {
    const throwing: KeywordStorage = {
      ...makeStorage(),
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    };
    expect(() => addKeywordToList(throwing, "US", "meditation")).not.toThrow();
    expect(() => saveKeywordList(throwing, "US", ["meditation"])).not.toThrow();
    expect(() => recordSnapshot(throwing, metricsFor("meditation", [makeApp()]))).not.toThrow();
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
    expect(
      trendDelta([{ date: "2026-08-01", popularity: 50, difficulty: 40 }]),
    ).toBeNull();
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

describe("estimateKeyword and list corruption", () => {
  it("fetch+estimate combines into KeywordMetrics", async () => {
    const metrics = await estimateKeyword("habit", "US", {
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                trackId: 1,
                trackName: "Habit",
                userRatingCount: 10,
                averageUserRating: 4,
              },
            ],
          }),
          { status: 200 },
        )) as typeof fetch,
    });
    expect(metrics.keyword).toBe("habit");
    expect(metrics.results).toBe(1);
  });

  it("loadKeywordList returns empty for corrupt JSON", () => {
    const storage = makeStorage({ "appclimb:kw:v1:list:US": "{bad" });
    expect(loadKeywordList(storage, "US")).toEqual([]);
    const storage2 = makeStorage({
      "appclimb:kw:v1:list:US": JSON.stringify([1, "ok", null]),
    });
    expect(loadKeywordList(storage2, "US")).toEqual(["ok"]);
  });

  it("recentHistory trims to the trailing window", () => {
    const record = {
      keyword: "x",
      country: "US",
      firstSeen: "2026-01-01",
      backfilled: false,
      history: Array.from({ length: 40 }, (_, index) => ({
        date: `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
        popularity: index,
        difficulty: index,
      })),
    };
    expect(recentHistory(record, 10)).toHaveLength(10);
  });

  it("rejects invalid keyword lengths before fetch", async () => {
    await expect(
      fetchKeywordResults("x", "US", {
        fetchImpl: (async () => new Response()) as typeof fetch,
      }),
    ).rejects.toThrow(/invalid_keyword_search/);
  });
});

describe("parseKeywordBatch", () => {
  it("splits on commas, semicolons, and newlines and normalizes whitespace", () => {
    const result = parseKeywordBatch(
      "meditation\nhabit tracker, sleep sounds;  yoga  \n",
    );
    expect(result.accepted).toEqual([
      "meditation",
      "habit tracker",
      "sleep sounds",
      "yoga",
    ]);
    expect(result.duplicates).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it("dedupes case-insensitively and reports duplicates", () => {
    const result = parseKeywordBatch("Meditation\nMEDITATION\nmeditation");
    expect(result.accepted).toEqual(["Meditation"]);
    expect(result.duplicates).toEqual(["MEDITATION", "meditation"]);
  });

  it("rejects too-short, too-long, and over-cap entries", () => {
    const result = parseKeywordBatch("x\na\n" + "k".repeat(81));
    expect(result.invalid).toEqual(["x", "a", "k".repeat(81)]);
    expect(result.accepted).toEqual([]);
  });

  it("caps the accepted list at the batch maximum", () => {
    const input = Array.from({ length: 55 }, (_, index) => `kw${index}`).join(
      "\n",
    );
    const result = parseKeywordBatch(input, { max: 50 });
    expect(result.accepted).toHaveLength(50);
    expect(result.invalid).toHaveLength(5);
  });
});

describe("runBatched", () => {
  it("runs every item and honors the concurrency limit", async () => {
    const items = ["a", "b", "c", "d"];
    const running = new Set<string>();
    let peak = 0;
    const { failed } = await runBatched(
      items,
      async (item) => {
        running.add(item);
        peak = Math.max(peak, running.size);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running.delete(item);
      },
      { concurrency: 2, gapMs: 0 },
    );
    expect(failed).toEqual([]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("collects failures without stopping the queue", async () => {
    const visited: string[] = [];
    const { failed } = await runBatched(
      ["ok1", "bad", "ok2"],
      async (item) => {
        visited.push(item);
        if (item === "bad") throw new Error("boom");
      },
      { concurrency: 1, gapMs: 0 },
    );
    expect(failed).toEqual(["bad"]);
    expect(visited).toEqual(["ok1", "bad", "ok2"]);
  });
});

describe("buildExplorerCsv", () => {
  it("writes a header and a row with metrics and trend", () => {
    const metrics = metricsFor("meditation", [
      makeApp({ name: "Meditation Timer", ratingsCount: 100 }),
    ]);
    const record = recordSnapshot(makeStorage(), metrics);
    const csv = buildExplorerCsv([
      {
        keyword: "meditation",
        country: "US",
        metrics,
        record,
      },
    ]);
    expect(csv.split("\n")[0]).toBe(
      "keyword,store,popularity,popularity_source,difficulty_estimated,results,saturated,trend_delta,last_checked_at",
    );
    expect(csv).toContain("meditation,US");
    expect(csv).toContain(metrics.sampledAt.slice(0, 10));
  });

  it("normalizes restored records to the same date-only last_checked_at", () => {
    // Fresh checks carry a full ISO timestamp; a record restored from
    // localStorage only keeps the date. The CSV column must not alternate.
    const fresh = metricsFor("meditation", [makeApp()]);
    expect(fresh.sampledAt).toMatch(/T/);

    const storage = makeStorage();
    const record = recordSnapshot(storage, fresh);
    const restored = restoreMetricsFromRecord(loadRecord(storage, "meditation", "US")!);
    expect(restored?.sampledAt).not.toMatch(/T/);

    const csv = buildExplorerCsv([
      { keyword: "meditation", country: "US", metrics: restored!, record },
    ]);
    const row = csv.split("\n").find((line) => line.startsWith("meditation,"));
    expect(row).toContain(restored!.sampledAt.slice(0, 10));
    expect(row).not.toMatch(/T\d{2}:/);
  });

  it("escapes commas and leaves blank cells for pending rows", () => {
    const csv = buildExplorerCsv([
      {
        keyword: "habit, tracker",
        country: "US",
        metrics: null,
        record: null,
      },
    ]);
    expect(csv).toContain('"habit, tracker",US,,,,,,,');
  });
});

describe("backup / restore", () => {
  it("exports only keyword records and restores them round-trip", () => {
    const storage = makeStorage();
    const metrics = metricsFor("meditation", [
      makeApp({ name: "Meditation Timer" }),
    ]);
    recordSnapshot(storage, metrics);
    addKeywordToList(storage, "US", "meditation");
    // A non-keyword key must be ignored by the exporter.
    storage.setItem("unrelated:key", "value");

    const backup = exportExplorerBackup(storage);
    const parsed = JSON.parse(backup) as {
      version: number;
      data: Record<string, string>;
    };
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.data)).toHaveLength(2);
    expect(parsed.data["unrelated:key"]).toBeUndefined();

    const empty = makeStorage();
    expect(restoreExplorerBackup(empty, backup)).toBe(1);
    expect(loadRecord(empty, "meditation", "US")?.keyword).toBe("meditation");
    expect(loadKeywordList(empty, "US")).toEqual(["meditation"]);
  });

  it("returns 0 for malformed JSON and wrong versions", () => {
    const storage = makeStorage();
    expect(restoreExplorerBackup(storage, "{not json")).toBe(0);
    expect(
      restoreExplorerBackup(storage, JSON.stringify({ version: 99, data: {} })),
    ).toBe(0);
    expect(restoreExplorerBackup(storage, JSON.stringify({ version: 1 }))).toBe(
      0,
    );
  });

  it("skips malformed records inside a valid backup", () => {
    const storage = makeStorage();
    const restored = restoreExplorerBackup(
      storage,
      JSON.stringify({
        version: 1,
        data: {
          "appclimb:kw:v1:US:good": JSON.stringify({
            keyword: "good",
            country: "US",
            history: [],
          }),
          "appclimb:kw:v1:US:bad": JSON.stringify({ keyword: 42 }),
        },
      }),
    );
    expect(restored).toBe(1);
  });
});

describe("formatAsoKeywordField", () => {
  it("joins keywords with commas and removes extra spaces", () => {
    const result = formatAsoKeywordField([
      "  meditation ",
      "habit tracker",
      "mindfulness",
    ]);
    expect(result).toBe("meditation,habit tracker,mindfulness");
  });

  it("deduplicates terms case-insensitively and enforces 100 char limit", () => {
    const keywords = [
      "meditation",
      "Meditation",
      "habit tracker for daily routines and goals",
      "mindfulness practice app for stress relief",
      "sleep sounds and ocean rain background noise",
    ];
    const result = formatAsoKeywordField(keywords);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toBe(
      "meditation,habit tracker for daily routines and goals,mindfulness practice app for stress relief",
    );
  });
});

describe("blocked storage (private mode)", () => {
  it("reads fail closed to empty instead of throwing", () => {
    const blocked: KeywordStorage = {
      ...makeStorage(),
      getItem: () => {
        throw new DOMException("The operation is insecure", "SecurityError");
      },
    };
    expect(loadKeywordList(blocked, "US")).toEqual([]);
    expect(loadRecord(blocked, "meditation", "US")).toBeNull();
    expect(() => exportExplorerBackup(blocked)).not.toThrow();
    expect(() => addKeywordToList(blocked, "US", "meditation")).not.toThrow();
    expect(() => recordSnapshot(blocked, metricsFor("meditation", [makeApp()]))).not.toThrow();
  });
});
