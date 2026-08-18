import { describe, expect, it, vi } from "vitest";

import {
  addKeywordsToStore,
  addTrackedApp,
  analyzeTrackedKeyword,
  analyzeWithRetry,
  applyAnalysisToStore,
  buildKeywordSuggestions,
  classifyAppQuery,
  countTrackedKeywords,
  describeRankTrend,
  emptyStore,
  filterNewSuggestions,
  findAppPosition,
  formatPosition,
  humanizeItunesError,
  isKeywordStale,
  isTransientItunesError,
  keywordKey,
  buildKeywordsCsv,
  listKeywordsForApp,
  loadAppMetadata,
  loadTrackerStore,
  markKeywordUnavailable,
  mapWithConcurrency,
  matchesStatusFilter,
  normalizeKeyword,
  opportunityScore,
  parseKeywordBatch,
  isRateLimitError,
  positionSeries,
  positionSparklineValues,
  rankDelta,
  recordRankSnapshot,
  removeKeywordFromStore,
  removeTrackedApp,
  resolveAppCandidates,
  saveTrackerStore,
  setActiveApp,
  sleep,
  snapshotsFor,
  snapshotsToChartPoints,
  trackAppInStorefront,
  allRankedApps,
  bestPositionSeries,
  myRankings,
  STARTER_APP_ID,
  STARTER_APP_NAME,
  STARTER_KEYWORDS,
  TRACKER_STORAGE_KEY,
  calculateCompetitorOverlap,
  updateKeywordTags,
  updateKeywordNote,
  type TrackerStorage,
  type TrackerStore,
  type TrackedKeyword,
} from "@/lib/tracker";
import { parseAppStoreIdInput } from "@/lib/itunes";
import { toLocalDate, type TopApp } from "@/lib/aso";

function makeStorage(initial: Record<string, string> = {}): TrackerStorage {
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

const sampleApp = {
  appStoreId: "123456789",
  name: "Calm Focus",
  bundleId: "com.example.calm",
  developer: "Indie Labs",
  genre: "Health & Fitness",
  iconUrl: "https://example.com/icon.png",
  storeUrl: "https://apps.apple.com/app/id123456789",
  country: "US",
};

describe("parseAppStoreIdInput", () => {
  it("parses bare ids and App Store URLs", () => {
    expect(parseAppStoreIdInput("123456789")).toBe("123456789");
    expect(
      parseAppStoreIdInput(
        "https://apps.apple.com/us/app/calm-focus/id123456789?mt=8",
      ),
    ).toBe("123456789");
    expect(
      parseAppStoreIdInput("apps.apple.com/app/id987654321"),
    ).toBe("987654321");
    expect(parseAppStoreIdInput("not an app")).toBeNull();
  });
});

describe("classifyAppQuery", () => {
  it("routes id, url, and name queries", () => {
    expect(classifyAppQuery("123456789")).toEqual({
      kind: "id",
      appStoreId: "123456789",
    });
    expect(
      classifyAppQuery("https://apps.apple.com/app/id123456789"),
    ).toEqual({ kind: "id", appStoreId: "123456789" });
    expect(classifyAppQuery("habit tracker")).toEqual({
      kind: "search",
      term: "habit tracker",
    });
    expect(classifyAppQuery("x")).toBeNull();
  });
});

describe("app tracking storage", () => {
  it("adds apps, prevents duplicate storefront pairs, and sets active", () => {
    let store = emptyStore();
    const first = addTrackedApp(store, sampleApp);
    expect(first.added).toBe(true);
    store = first.store;
    expect(store.apps).toHaveLength(1);
    expect(store.activeAppKey).toBe("123456789:US");

    const duplicate = addTrackedApp(store, sampleApp);
    expect(duplicate.added).toBe(false);
    expect(duplicate.store.apps).toHaveLength(1);

    const otherCountry = addTrackedApp(store, { ...sampleApp, country: "GB" });
    expect(otherCountry.added).toBe(true);
    store = otherCountry.store;
    expect(store.apps).toHaveLength(2);

    store = setActiveApp(store, "123456789", "US");
    expect(store.activeAppKey).toBe("123456789:US");
  });

  it("removes an app and its keywords/snapshots only", () => {
    let store = emptyStore();
    store = addTrackedApp(store, sampleApp).store;
    store = addTrackedApp(store, {
      ...sampleApp,
      appStoreId: "999",
      name: "Other",
    }).store;
    store = addKeywordsToStore(store, "123456789", "US", ["meditation"]).store;
    store = recordRankSnapshot(store, "123456789", "US", "meditation", {
      sampledAt: "2026-08-02T12:00:00Z",
      position: 12,
      popularity: 40,
      difficulty: 30,
      resultsCount: 80,
      saturated: false,
    });
    store = removeTrackedApp(store, "123456789", "US");
    expect(store.apps.map((app) => app.appStoreId)).toEqual(["999"]);
    expect(Object.keys(store.keywords)).toHaveLength(0);
    expect(Object.keys(store.snapshots)).toHaveLength(0);
  });

  it("loads empty store on corrupt JSON and never touches explorer keys", () => {
    const storage = makeStorage({
      [TRACKER_STORAGE_KEY]: "{not-json",
      "appclimb:kw:v1:US:meditation": JSON.stringify({ keyword: "meditation" }),
    });
    expect(loadTrackerStore(storage)).toEqual(emptyStore());
    expect(storage.getItem("appclimb:kw:v1:US:meditation")).toContain(
      "meditation",
    );
  });

  it("round-trips a valid store and ignores corrupt keyword rows", () => {
    const storage = makeStorage();
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", ["focus timer"]).store;
    saveTrackerStore(storage, store);
    const loaded = loadTrackerStore(storage);
    expect(loaded.apps[0]?.name).toBe("Calm Focus");
    expect(Object.keys(loaded.keywords)).toHaveLength(1);

    storage.setItem(
      TRACKER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeAppKey: "123456789:US",
        apps: [sampleApp],
        keywords: { bad: { nope: true }, good: loaded.keywords[Object.keys(loaded.keywords)[0]] },
        snapshots: { bad: "x", good: [] },
      }),
    );
    const recovered = loadTrackerStore(storage);
    expect(Object.keys(recovered.keywords)).toEqual(["good"]);
  });
});

describe("keyword batch parsing and dedupe", () => {
  it("normalizes, dedupes, and flags already tracked keys", () => {
    const result = parseKeywordBatch(
      "Meditation, meditation\nfocus timer\nx\n" + "a".repeat(90),
      new Set(["focus timer"]),
    );
    expect(result.accepted).toEqual(["Meditation"]);
    expect(result.duplicates).toEqual(["meditation"]);
    expect(result.alreadyTracked).toEqual(["focus timer"]);
    expect(result.invalid.length).toBeGreaterThanOrEqual(2);
  });

  it("adds and removes keywords scoped to one app", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    const { store: withKeys, added } = addKeywordsToStore(store, "123456789", "US", [
      "Meditation",
      "meditation",
      "yoga",
    ]);
    expect(added).toHaveLength(2);
    store = withKeys;
    store = updateKeywordNote(store, "123456789", "US", "meditation", "primary");
    expect(
      store.keywords[keywordKey("123456789", "US", "meditation")]?.note,
    ).toBe("primary");
    store = removeKeywordFromStore(store, "123456789", "US", "yoga");
    expect(Object.keys(store.keywords)).toHaveLength(1);
  });
});

describe("plan caps (per-app keywords)", () => {
  it("countTrackedKeywords counts rows for one app + storefront only", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", ["a1", "b2"]).store;
    store = addKeywordsToStore(store, "123456789", "DE", ["c3"]).store;
    store = addTrackedApp(store, { ...sampleApp, appStoreId: "987654321" }).store;
    store = addKeywordsToStore(store, "987654321", "US", ["d4"]).store;
    expect(countTrackedKeywords(store, "123456789", "US")).toBe(2);
    expect(countTrackedKeywords(store, "123456789", "DE")).toBe(1);
    expect(countTrackedKeywords(store, "987654321", "US")).toBe(1);
    expect(countTrackedKeywords(store, "123456789", "GB")).toBe(0);
  });

  it("caps additions at maxPerApp and flags the overflow", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    const { store: withKeys, added, capped } = addKeywordsToStore(
      store,
      "123456789",
      "US",
      ["k1", "k2", "k3", "k4"],
      2,
    );
    expect(added.map((row) => row.normalizedKeyword)).toEqual(["k1", "k2"]);
    expect(capped).toBe(true);
    store = withKeys;
    expect(countTrackedKeywords(store, "123456789", "US")).toBe(2);
  });

  it("does not cap when the limit is null or omitted", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    const unlimited = addKeywordsToStore(store, "123456789", "US", ["k1", "k2", "k3"], null);
    expect(unlimited.capped).toBe(false);
    expect(unlimited.added).toHaveLength(3);
    store = addTrackedApp(emptyStore(), sampleApp).store;
    const omitted = addKeywordsToStore(store, "123456789", "US", ["k1", "k2", "k3"]);
    expect(omitted.capped).toBe(false);
    expect(omitted.added).toHaveLength(3);
  });

  it("does not cap duplicates and invalid entries", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", ["k1", "k2"], 2).store;
    const { added, capped } = addKeywordsToStore(store, "123456789", "US", ["k1", "x"], 2);
    expect(added).toHaveLength(0);
    expect(capped).toBe(false);
  });
});

describe("quick-start starter preset", () => {
  it("has a real app id and a display name", () => {
    expect(STARTER_APP_ID).toMatch(/^\d+$/u);
    expect(STARTER_APP_NAME.length).toBeGreaterThan(0);
  });

  it("lists unique, valid keywords that all pass batch parsing", () => {
    expect(STARTER_KEYWORDS.length).toBeGreaterThan(0);
    const normalized = STARTER_KEYWORDS.map((keyword) =>
      normalizeKeyword(keyword),
    );
    expect(new Set(normalized).size).toBe(normalized.length);
    const parsed = parseKeywordBatch(STARTER_KEYWORDS.join("\n"), new Set());
    expect(parsed.accepted).toHaveLength(STARTER_KEYWORDS.length);
    expect(parsed.duplicates).toEqual([]);
    expect(parsed.invalid).toEqual([]);
  });

  it("adds every starter keyword to a tracked app in one batch", () => {
    const store = addTrackedApp(
      emptyStore(),
      { ...sampleApp, appStoreId: STARTER_APP_ID },
    ).store;
    const { store: withKeys, added } = addKeywordsToStore(store, STARTER_APP_ID, "US", [
      ...STARTER_KEYWORDS,
    ]);
    expect(added).toHaveLength(STARTER_KEYWORDS.length);
    expect(listKeywordsForApp(withKeys, STARTER_APP_ID, "US")).toHaveLength(
      STARTER_KEYWORDS.length,
    );
  });
});

describe("position and rank trend", () => {
  it("finds position or returns null for >200", () => {
    const apps = [
      { appStoreId: "1" },
      { appStoreId: "2" },
      { appStoreId: "3" },
    ];
    expect(findAppPosition(apps, "2")).toBe(2);
    expect(findAppPosition(apps, "999")).toBeNull();
    expect(formatPosition(5)).toBe("#5");
    expect(formatPosition(null)).toBe(">200");
    expect(formatPosition(null, true)).toBe("Unavailable");
  });

  it("computes rank delta as previous - current", () => {
    expect(rankDelta(10, 4)).toBe(6);
    expect(rankDelta(4, 10)).toBe(-6);
    expect(rankDelta(null, 4)).toBeNull();
  });

  it("labels Entered, Dropped out, New, up and down", () => {
    expect(describeRankTrend(undefined, { position: 8 }).kind).toBe("new");
    expect(
      describeRankTrend(
        {
          date: "2026-08-01",
          sampledAt: "x",
          position: null,
          popularity: 1,
          difficulty: 1,
          resultsCount: 1,
          saturated: false,
        },
        { position: 12 },
      ),
    ).toMatchObject({ kind: "entered", label: "Entered at #12" });
    expect(
      describeRankTrend(
        {
          date: "2026-08-01",
          sampledAt: "x",
          position: 9,
          popularity: 1,
          difficulty: 1,
          resultsCount: 1,
          saturated: false,
        },
        { position: null },
      ).kind,
    ).toBe("dropped_out");
    expect(
      describeRankTrend(
        {
          date: "2026-08-01",
          sampledAt: "x",
          position: 20,
          popularity: 1,
          difficulty: 1,
          resultsCount: 1,
          saturated: false,
        },
        { position: 10 },
      ),
    ).toMatchObject({ kind: "up", delta: 10 });
    expect(
      describeRankTrend(
        {
          date: "2026-08-01",
          sampledAt: "x",
          position: 10,
          popularity: 1,
          difficulty: 1,
          resultsCount: 1,
          saturated: false,
        },
        { position: 15 },
      ),
    ).toMatchObject({ kind: "down", delta: -5 });
  });

  it("replaces same-day snapshot instead of appending", () => {
    let store = emptyStore();
    store = recordRankSnapshot(store, "1", "US", "kw", {
      date: "2026-08-02",
      sampledAt: "a",
      position: 10,
      popularity: 40,
      difficulty: 30,
      resultsCount: 50,
      saturated: false,
    });
    store = recordRankSnapshot(store, "1", "US", "kw", {
      date: "2026-08-02",
      sampledAt: "b",
      position: 8,
      popularity: 42,
      difficulty: 28,
      resultsCount: 55,
      saturated: false,
    });
    const history = snapshotsFor(store, "1", "US", "kw");
    expect(history).toHaveLength(1);
    expect(history[0].position).toBe(8);
    expect(history[0].sampledAt).toBe("b");
  });
});

describe("suggestions", () => {
  it("builds suggestions from metadata with reasons and tracks existing", () => {
    const suggestions = buildKeywordSuggestions(
      {
        trackName: "Calm Focus Timer",
        primaryGenreName: "Health & Fitness",
        description:
          "Meditation and mindfulness timer for deep focus. Meditation guides help focus.",
      },
      "fallback",
      {
        existingNormalized: new Set(["calm focus timer"]),
        competitorApps: [
          {
            appStoreId: "2",
            name: "Sleep Stories",
            bundleId: "",
            developer: "X",
            genre: "Lifestyle",
            iconUrl: "",
            storeUrl: "",
          },
        ],
      },
    );
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(20);
    expect(suggestions[0]).toMatchObject({
      keyword: "calm focus timer",
      reason: "App title",
      alreadyTracked: true,
    });
    expect(suggestions.some((item) => item.reason === "App Store category")).toBe(
      true,
    );
    expect(
      suggestions.some((item) => item.reason === "Competitor metadata"),
    ).toBe(true);
    const keywords = suggestions.map((item) => item.keyword);
    expect(new Set(keywords).size).toBe(keywords.length);
  });
});

describe("analyzeTrackedKeyword single search", () => {
  it("returns metrics and position from one fetch", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [
          { trackId: 1, trackName: "A", userRatingCount: 10, averageUserRating: 4 },
          {
            trackId: 123456789,
            trackName: "Calm Focus",
            userRatingCount: 100,
            averageUserRating: 4.5,
          },
          { trackId: 3, trackName: "C" },
        ],
      }),
    );
    const result = await analyzeTrackedKeyword("meditation", "US", "123456789", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.position).toBe(2);
    expect(result.metrics.popularity).toBeGreaterThan(0);
    expect(result.topApps).toHaveLength(3);
  });

  it("returns null position when app is outside the first 200", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: Array.from({ length: 50 }, (_, index) => ({
          trackId: index + 1,
          trackName: `App ${index + 1}`,
        })),
      }),
    );
    const result = await analyzeTrackedKeyword("term", "US", "999999", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.position).toBeNull();
    expect(formatPosition(result.position)).toBe(">200");
  });

  it("preserves prior metrics on partial failure", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", ["meditation"]).store;
    store = applyAnalysisToStore(store, "123456789", "US", "meditation", {
      metrics: {
        keyword: "meditation",
        country: "US",
        popularity: 55,
        difficulty: 40,
        results: 100,
        saturated: false,
        topApps: [],
        sampledAt: "2026-08-02T10:00:00Z",
      },
      position: 14,
      topApps: [],
    });
    const before = store.keywords[keywordKey("123456789", "US", "meditation")];
    store = markKeywordUnavailable(store, "123456789", "US", "meditation");
    const after = store.keywords[keywordKey("123456789", "US", "meditation")];
    expect(after?.currentMetrics?.popularity).toBe(55);
    expect(after?.currentMetrics?.position).toBe(14);
    expect(after?.currentMetrics?.unavailable).toBe(true);
    expect(before?.currentMetrics?.unavailable).toBeFalsy();
  });
});

describe("concurrency and errors", () => {
  it("continues after individual failures", async () => {
    const outcomes = await mapWithConcurrency(
      [1, 2, 3],
      2,
      async (item) => {
        if (item === 2) throw new Error("fail");
        return item * 10;
      },
    );
    expect(outcomes[0].result).toBe(10);
    expect(outcomes[1].error).toBeInstanceOf(Error);
    expect(outcomes[2].result).toBe(30);
  });

  it("classifies transient Apple errors and humanizes messages", () => {
    expect(isTransientItunesError(new Error("app_store_catalog_unavailable:429"))).toBe(
      true,
    );
    expect(isTransientItunesError(new Error("invalid_keyword_search"))).toBe(false);
    expect(humanizeItunesError(new Error("app_store_catalog_unavailable:429"))).toMatch(
      /rate-limiting/i,
    );
  });

  it("detects stale keywords", () => {
    const fresh = {
      appStoreId: "1",
      country: "US",
      keyword: "a",
      normalizedKeyword: "a",
      note: "",
      createdAt: "x",
      lastCheckedAt: new Date().toISOString(),
      currentMetrics: {
        popularity: 1,
        difficulty: 1,
        results: 1,
        saturated: false,
        topApps: [],
        position: 1,
        sampledAt: new Date().toISOString(),
      },
    };
    expect(isKeywordStale(fresh)).toBe(false);
    expect(
      isKeywordStale({
        ...fresh,
        lastCheckedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      }),
    ).toBe(true);
  });
});

describe("normalizeKeyword", () => {
  it("trims and collapses whitespace case-insensitively", () => {
    expect(normalizeKeyword("  Focus   Timer ")).toBe("focus timer");
  });
});

describe("opportunityScore and status filters", () => {
  it("scores higher for high popularity and lower difficulty", () => {
    const strong = opportunityScore({
      popularity: 80,
      difficulty: 30,
      position: null,
      unavailable: false,
    });
    const weak = opportunityScore({
      popularity: 20,
      difficulty: 90,
      position: 3,
      unavailable: false,
    });
    expect(strong).not.toBeNull();
    expect(weak).not.toBeNull();
    expect(strong!).toBeGreaterThan(weak!);
  });

  it("returns null when metrics are missing or unavailable", () => {
    expect(opportunityScore(null)).toBeNull();
    expect(
      opportunityScore({
        popularity: 50,
        difficulty: 50,
        position: 10,
        unavailable: true,
      }),
    ).toBeNull();
  });

  it("filters ranked, out, new, unchecked, and opportunity rows", () => {
    const ranked = {
      appStoreId: "1",
      country: "US",
      keyword: "a",
      normalizedKeyword: "a",
      note: "",
      createdAt: "x",
      lastCheckedAt: "x",
      currentMetrics: {
        popularity: 70,
        difficulty: 40,
        results: 100,
        saturated: false,
        topApps: [],
        position: 12,
        sampledAt: "x",
      },
    };
    const out = {
      ...ranked,
      keyword: "b",
      normalizedKeyword: "b",
      currentMetrics: {
        ...ranked.currentMetrics!,
        position: null,
      },
    };
    const unchecked = {
      ...ranked,
      keyword: "c",
      normalizedKeyword: "c",
      currentMetrics: null,
    };
    expect(matchesStatusFilter(ranked, "all")).toBe(true);
    expect(matchesStatusFilter(ranked, "ranked")).toBe(true);
    expect(matchesStatusFilter(out, "out")).toBe(true);
    expect(matchesStatusFilter(ranked, "new", [])).toBe(true);
    expect(matchesStatusFilter(ranked, "new", [
      {
        date: "a",
        sampledAt: "a",
        position: 1,
        popularity: 1,
        difficulty: 1,
        resultsCount: 1,
        saturated: false,
      },
      {
        date: "b",
        sampledAt: "b",
        position: 2,
        popularity: 1,
        difficulty: 1,
        resultsCount: 1,
        saturated: false,
      },
    ])).toBe(false);
    expect(matchesStatusFilter(unchecked, "unchecked")).toBe(true);
    expect(matchesStatusFilter(ranked, "opportunity")).toBe(true);
    expect(
      opportunityScore({
        popularity: 50,
        difficulty: 50,
        position: 80,
        unavailable: false,
      }),
    ).toBeGreaterThan(
      opportunityScore({
        popularity: 50,
        difficulty: 50,
        position: 5,
        unavailable: false,
      })!,
    );
  });
});

describe("rate-limit helpers and sparkline", () => {
  it("detects rate-limit errors and maps positions for sparklines", () => {
    expect(isRateLimitError(new Error("app_store_catalog_unavailable:429"))).toBe(
      true,
    );
    expect(isRateLimitError(new Error("app_store_catalog_unavailable:500"))).toBe(
      false,
    );
    expect(
      positionSparklineValues([
        {
          date: "a",
          sampledAt: "a",
          position: 10,
          popularity: 1,
          difficulty: 1,
          resultsCount: 1,
          saturated: false,
        },
        {
          date: "b",
          sampledAt: "b",
          position: null,
          popularity: 1,
          difficulty: 1,
          resultsCount: 1,
          saturated: false,
        },
      ]),
    ).toEqual([10, 201]);
  });
});

describe("CSV export and storefront clone", () => {
  it("builds a CSV with header and estimated columns", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", ["meditation"]).store;
    store = applyAnalysisToStore(store, "123456789", "US", "meditation", {
      metrics: {
        keyword: "meditation",
        country: "US",
        popularity: 55,
        difficulty: 40,
        results: 80,
        saturated: false,
        topApps: [],
        sampledAt: "2026-08-02T10:00:00Z",
      },
      position: 14,
      topApps: [],
    });
    const rows = listKeywordsForApp(store, "123456789", "US");
    const csv = buildKeywordsCsv(store.apps[0], rows);
    expect(csv.split("\n")[0]).toContain("popularity,popularity_source,difficulty_estimated");
    expect(csv).toContain("meditation");
    expect(csv).toContain("55");
    expect(csv).toContain("14");
  });

  it("tracks the same app in another storefront without duplicating keywords", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", ["yoga"]).store;
    const cloned = trackAppInStorefront(store, store.apps[0], "DE");
    expect(cloned.added).toBe(true);
    store = cloned.store;
    expect(store.apps).toHaveLength(2);
    expect(listKeywordsForApp(store, "123456789", "DE")).toHaveLength(0);
    expect(listKeywordsForApp(store, "123456789", "US")).toHaveLength(1);
    expect(trackAppInStorefront(store, store.apps[0], "US").added).toBe(false);
  });
});

describe("resolveAppCandidates and metadata", () => {
  it("looks up by id and searches by name", async () => {
    const lookupFetch = vi.fn(async () =>
      Response.json({
        results: [
          {
            trackId: 123456789,
            trackName: "Calm Focus",
            bundleId: "com.example.calm",
            sellerName: "Indie",
            primaryGenreName: "Health",
            artworkUrl100: "https://x/y.png",
            trackViewUrl: "https://apps.apple.com/app/id123456789",
          },
        ],
      }),
    );
    await expect(
      resolveAppCandidates("123456789", "US", {
        fetchImpl: lookupFetch as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject([{ appStoreId: "123456789", name: "Calm Focus" }]);

    await expect(
      resolveAppCandidates("https://apps.apple.com/us/app/x/id123456789", "US", {
        fetchImpl: lookupFetch as unknown as typeof fetch,
      }),
    ).resolves.toHaveLength(1);

    const searchFetch = vi.fn(async () =>
      Response.json({
        results: [
          {
            trackId: 9,
            trackName: "Habit App",
            sellerName: "A",
            primaryGenreName: "B",
          },
        ],
      }),
    );
    await expect(
      resolveAppCandidates("habit app", "US", {
        fetchImpl: searchFetch as unknown as typeof fetch,
      }),
    ).resolves.toHaveLength(1);

    await expect(resolveAppCandidates("x", "US")).resolves.toEqual([]);
  });

  it("loads full metadata or null when missing", async () => {
    const ok = vi.fn(async () =>
      Response.json({
        results: [
          {
            trackId: 1,
            trackName: "App",
            description: "Hello",
            sellerName: "Dev",
            primaryGenreName: "Games",
          },
        ],
      }),
    );
    const meta = await loadAppMetadata("1", "US", {
      fetchImpl: ok as unknown as typeof fetch,
    });
    expect(meta?.catalog.name).toBe("App");
    expect(meta?.raw.description).toBe("Hello");

    const empty = vi.fn(async () => Response.json({ results: [] }));
    await expect(
      loadAppMetadata("1", "US", { fetchImpl: empty as unknown as typeof fetch }),
    ).resolves.toBeNull();
  });
});

describe("filterNewSuggestions and chart helpers", () => {
  it("filters already tracked suggestions", () => {
    expect(
      filterNewSuggestions([
        { keyword: "a", reason: "App title", alreadyTracked: true },
        { keyword: "b", reason: "App description" },
      ]),
    ).toEqual([{ keyword: "b", reason: "App description" }]);
  });

  it("maps snapshots to chart series", () => {
    const snaps = [
      {
        date: "2026-08-01",
        sampledAt: "a",
        position: 10 as number | null,
        popularity: 40,
        difficulty: 30,
        resultsCount: 20,
        saturated: false,
      },
      {
        date: "2026-08-02",
        sampledAt: "b",
        position: null,
        popularity: 41,
        difficulty: 29,
        resultsCount: 22,
        saturated: false,
      },
    ];
    expect(snapshotsToChartPoints(snaps)).toEqual([
      { date: "2026-08-01", popularity: 40, difficulty: 30 },
      { date: "2026-08-02", popularity: 41, difficulty: 29 },
    ]);
    expect(positionSeries(snaps)).toEqual([
      { date: "2026-08-01", position: 10 },
      { date: "2026-08-02", position: null },
    ]);
  });
});

describe("analyzeWithRetry and sleep", () => {
  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls < 2) {
        return new Response("nope", { status: 429 });
      }
      return Response.json({
        results: [{ trackId: 1, trackName: "A", userRatingCount: 5 }],
      });
    });
    const result = await analyzeWithRetry("kw", "US", "1", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      maxAttempts: 3,
    });
    expect(result.position).toBe(1);
    expect(calls).toBe(2);
  });

  it("does not retry non-transient errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad", { status: 400 }));
    await expect(
      analyzeWithRetry("kw", "US", "1", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxAttempts: 3,
      }),
    ).rejects.toThrow(/app_store_catalog_unavailable:400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rethrows AbortError (cancel/timeout) without retrying", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(
      analyzeWithRetry("kw", "US", "1", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxAttempts: 3,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sleep resolves and aborts with signal", async () => {
    await expect(sleep(5)).resolves.toBeUndefined();
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(50, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("loadTrackerStore edge cases", () => {
  it("falls back when version mismatches and repairs activeAppKey", () => {
    const storage = makeStorage({
      [TRACKER_STORAGE_KEY]: JSON.stringify({ version: 99, apps: [] }),
    });
    expect(loadTrackerStore(storage).version).toBe(1);

    const repaired = makeStorage();
    saveTrackerStore(repaired, {
      version: 1,
      activeAppKey: "missing:US",
      apps: [
        {
          appStoreId: "1",
          name: "A",
          bundleId: "",
          developer: "",
          genre: "",
          iconUrl: "",
          storeUrl: "",
          country: "gb",
          addedAt: "2026-08-01",
        },
      ],
      keywords: {},
      snapshots: {},
    });
    const loaded = loadTrackerStore(repaired);
    expect(loaded.activeAppKey).toBe("1:GB");
    expect(loaded.apps[0].country).toBe("GB");
  });

  it("setActiveApp ignores unknown apps", () => {
    const store = addTrackedApp(emptyStore(), sampleApp).store;
    expect(setActiveApp(store, "nope", "US").activeAppKey).toBe("123456789:US");
  });

  it("markKeywordUnavailable creates a placeholder when metrics were null", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", ["new kw"]).store;
    store = markKeywordUnavailable(store, "123456789", "US", "new kw");
    const row = store.keywords[keywordKey("123456789", "US", "new kw")];
    expect(row?.currentMetrics?.unavailable).toBe(true);
    expect(formatPosition(undefined)).toBe("—");
  });

  it("describeRankTrend covers null-null and unavailable", () => {
    expect(describeRankTrend(undefined, null).kind).toBe("unavailable");
    expect(
      describeRankTrend(
        {
          date: "2026-08-01",
          sampledAt: "x",
          position: null,
          popularity: 1,
          difficulty: 1,
          resultsCount: 1,
          saturated: false,
        },
        { position: null },
      ).kind,
    ).toBe("unchanged");
  });

  it("humanizeItunesError covers 5xx and abort", () => {
    expect(
      humanizeItunesError(new Error("app_store_catalog_unavailable:503")),
    ).toMatch(/temporarily unavailable/i);
    expect(
      humanizeItunesError(new DOMException("Aborted", "AbortError")),
    ).toMatch(/cancelled/i);
    expect(humanizeItunesError("mystery")).toMatch(/Existing data is preserved/);
  });

  it("mapWithConcurrency aborts remaining work", async () => {
    const controller = new AbortController();
    const promise = mapWithConcurrency(
      [1, 2, 3, 4],
      1,
      async (item) => {
        if (item === 2) controller.abort();
        await sleep(5, controller.signal);
        return item;
      },
      { signal: controller.signal, gapMs: 1 },
    );
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("covers parseKeywordBatch max cap and applyAnalysis missing row", () => {
    const longList = Array.from({ length: 55 }, (_, index) => `keyword ${index}`);
    const parsed = parseKeywordBatch(longList.join("\n"), new Set(), { max: 50 });
    expect(parsed.accepted).toHaveLength(50);
    expect(parsed.invalid.length).toBeGreaterThan(0);

    const untouched = applyAnalysisToStore(emptyStore(), "1", "US", "missing", {
      metrics: {
        keyword: "missing",
        country: "US",
        popularity: 1,
        difficulty: 1,
        results: 1,
        saturated: false,
        topApps: [],
        sampledAt: "x",
      },
      position: 1,
      topApps: [],
    });
    expect(untouched.keywords).toEqual({});
  });

  it("analyzeWithRetry aborts without retrying", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      analyzeWithRetry("kw", "US", "1", {
        signal: controller.signal,
        fetchImpl: vi.fn(async () => {
          throw new DOMException("Aborted", "AbortError");
        }) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("isKeywordStale handles missing and bad timestamps", () => {
    expect(
      isKeywordStale({
        appStoreId: "1",
        country: "US",
        keyword: "a",
        normalizedKeyword: "a",
        note: "",
        createdAt: "x",
        lastCheckedAt: null,
        currentMetrics: null,
      }),
    ).toBe(true);
    expect(
      isKeywordStale({
        appStoreId: "1",
        country: "US",
        keyword: "a",
        normalizedKeyword: "a",
        note: "",
        createdAt: "x",
        lastCheckedAt: "not-a-date",
        currentMetrics: {
          popularity: 1,
          difficulty: 1,
          results: 1,
          saturated: false,
          topApps: [],
          position: 1,
          sampledAt: "x",
        },
      }),
    ).toBe(true);
    expect(
      isKeywordStale({
        appStoreId: "1",
        country: "US",
        keyword: "a",
        normalizedKeyword: "a",
        note: "",
        createdAt: "x",
        lastCheckedAt: new Date().toISOString(),
        currentMetrics: {
          popularity: 1,
          difficulty: 1,
          results: 1,
          saturated: false,
          topApps: [],
          position: 1,
          unavailable: true,
          sampledAt: new Date().toISOString(),
        },
      }),
    ).toBe(true);
  });

  it("lookup by id with empty result returns empty list", async () => {
    await expect(
      resolveAppCandidates("555555555", "US", {
        fetchImpl: vi.fn(async () =>
          Response.json({ results: [] }),
        ) as unknown as typeof fetch,
      }),
    ).resolves.toEqual([]);
  });

  it("listKeywordsForApp sorts alphabetically", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", ["yoga", "alpha"]).store;
    expect(
      listKeywordsForApp(store, "123456789", "US").map((row) => row.keyword),
    ).toEqual(["alpha", "yoga"]);
  });
});

describe("overview aggregations (best position, my rankings, ranked apps)", () => {
  const dayAgo = (days: number) =>
    toLocalDate(new Date(Date.now() - days * 86_400_000));

  function applyMetrics(
    store: TrackerStore,
    keyword: string,
    options: { position: number | null; sampledAt: string; topApps?: TopApp[] },
  ): TrackerStore {
    const topApps = options.topApps ?? [];
    return applyAnalysisToStore(store, "123456789", "US", keyword, {
      metrics: {
        keyword,
        country: "US",
        popularity: 50,
        difficulty: 20,
        results: 100,
        saturated: false,
        topApps,
        sampledAt: options.sampledAt,
      },
      position: options.position,
      topApps,
    });
  }

  function sampleTopApp(id: string, position: number): TopApp {
    return {
      appStoreId: id,
      name: `App ${id}`,
      developer: "Dev",
      genre: "Tools",
      iconUrl: "",
      storeUrl: "",
      ratingsCount: 0,
      ratingAverage: 0,
      position,
    };
  }

  it("bestPositionSeries takes the best per-day position across keywords", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", [
      "meditation",
      "yoga",
    ]).store;
    const today = dayAgo(0);
    const yesterday = dayAgo(1);
    const twoDaysAgo = dayAgo(2);
    const snap = (date: string) => ({
      date,
      sampledAt: `${date}T10:00:00Z`,
      popularity: 50,
      difficulty: 20,
      resultsCount: 100,
      saturated: false,
    });
    // meditation: #10 two days ago, #5 today; yoga: #8 yesterday, #12 today.
    store = recordRankSnapshot(store, "123456789", "US", "meditation", {
      ...snap(twoDaysAgo),
      position: 10,
    });
    store = recordRankSnapshot(store, "123456789", "US", "meditation", {
      ...snap(today),
      position: 5,
    });
    store = recordRankSnapshot(store, "123456789", "US", "yoga", {
      ...snap(yesterday),
      position: 8,
    });
    store = recordRankSnapshot(store, "123456789", "US", "yoga", {
      ...snap(today),
      position: 12,
    });

    const series = bestPositionSeries(store, "123456789", "US", 7);
    expect(series).toEqual([
      { date: twoDaysAgo, position: 10 },
      { date: yesterday, position: 8 },
      { date: today, position: 5 },
    ]);
  });

  it("bestPositionSeries skips unmeasured days and out-of-200 snapshots", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", ["meditation"]).store;
    const today = dayAgo(0);
    const threeDaysAgo = dayAgo(3);
    store = recordRankSnapshot(store, "123456789", "US", "meditation", {
      sampledAt: `${threeDaysAgo}T10:00:00Z`,
      position: null,
      popularity: 50,
      difficulty: 20,
      resultsCount: 100,
      saturated: false,
    });
    store = recordRankSnapshot(store, "123456789", "US", "meditation", {
      sampledAt: `${today}T10:00:00Z`,
      position: 7,
      popularity: 50,
      difficulty: 20,
      resultsCount: 100,
      saturated: false,
    });

    const series = bestPositionSeries(store, "123456789", "US", 7);
    // Day with only an out-of-200 measurement is not a ranked day.
    expect(series).toEqual([{ date: today, position: 7 }]);
  });

  it("myRankings lists ranked keywords with surge, excluding >200 and unavailable", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", [
      "meditation",
      "yoga",
      "focus",
      "sleep",
      "streak",
    ]).store;
    const today = dayAgo(0);
    const sixDaysAgo = dayAgo(6);

    // meditation: #12 six days ago → #8 today (moved up 4).
    store = recordRankSnapshot(store, "123456789", "US", "meditation", {
      date: sixDaysAgo,
      sampledAt: `${sixDaysAgo}T10:00:00Z`,
      position: 12,
      popularity: 50,
      difficulty: 20,
      resultsCount: 100,
      saturated: false,
    });
    store = applyMetrics(store, "meditation", {
      position: 8,
      sampledAt: `${today}T10:00:00Z`,
    });
    // yoga: measured only today → surge null.
    store = applyMetrics(store, "yoga", {
      position: 3,
      sampledAt: `${today}T10:00:00Z`,
    });
    // streak: #5 → #9 (moved down 4).
    store = recordRankSnapshot(store, "123456789", "US", "streak", {
      date: sixDaysAgo,
      sampledAt: `${sixDaysAgo}T10:00:00Z`,
      position: 5,
      popularity: 50,
      difficulty: 20,
      resultsCount: 100,
      saturated: false,
    });
    store = applyMetrics(store, "streak", {
      position: 9,
      sampledAt: `${today}T10:00:00Z`,
    });
    // focus: outside top 200; sleep: unavailable → both excluded.
    store = applyMetrics(store, "focus", {
      position: null,
      sampledAt: `${today}T10:00:00Z`,
    });
    store = markKeywordUnavailable(store, "123456789", "US", "sleep");

    const rankings = myRankings(store, "123456789", "US", 7);
    expect(rankings).toEqual([
      {
        keyword: "yoga",
        normalizedKeyword: "yoga",
        position: 3,
        surge: null,
      },
      {
        keyword: "meditation",
        normalizedKeyword: "meditation",
        position: 8,
        surge: 4,
      },
      {
        keyword: "streak",
        normalizedKeyword: "streak",
        position: 9,
        surge: -4,
      },
    ]);
  });

  it("allRankedApps aggregates competitors, excludes the tracked app, dedupes", () => {
    let store = addTrackedApp(emptyStore(), sampleApp).store;
    store = addKeywordsToStore(store, "123456789", "US", [
      "meditation",
      "yoga",
    ]).store;
    const today = dayAgo(0);
    store = applyMetrics(store, "meditation", {
      position: 2,
      sampledAt: `${today}T10:00:00Z`,
      topApps: [
        sampleTopApp("111", 1),
        { ...sampleTopApp("123456789", 2), name: "Calm Focus" },
        sampleTopApp("222", 3),
      ],
    });
    store = applyMetrics(store, "yoga", {
      position: 5,
      sampledAt: `${today}T10:00:00Z`,
      topApps: [
        sampleTopApp("111", 2),
        sampleTopApp("333", 1),
        sampleTopApp("222", 7),
      ],
    });

    const apps = allRankedApps(store, "123456789", "US");
    expect(apps).toEqual([
      {
        appStoreId: "111",
        name: "App 111",
        developer: "Dev",
        iconUrl: "",
        storeUrl: "",
        bestPosition: 1,
        keywordCount: 2,
      },
      {
        appStoreId: "333",
        name: "App 333",
        developer: "Dev",
        iconUrl: "",
        storeUrl: "",
        bestPosition: 1,
        keywordCount: 1,
      },
      {
        appStoreId: "222",
        name: "App 222",
        developer: "Dev",
        iconUrl: "",
        storeUrl: "",
        bestPosition: 3,
        keywordCount: 2,
      },
    ]);
    expect(
      allRankedApps(store, "123456789", "US", 2).map((app) => app.appStoreId),
    ).toEqual(["111", "333"]);
  });
});

describe("updateKeywordTags and calculateCompetitorOverlap", () => {
  it("sanitizes and caps tags on keywords", () => {
    let store = emptyStore();
    store = addTrackedApp(store, {
      appStoreId: "100",
      country: "US",
      name: "Test App",
      developer: "Test Dev",
      genre: "Utilities",
      iconUrl: "https://example.com/icon.png",
      storeUrl: "https://apps.apple.com/app/id100",
      bundleId: "com.example.test",
    }).store;
    store = addKeywordsToStore(store, "100", "US", ["meditation"]).store;

    const updated = updateKeywordTags(store, "100", "US", "meditation", [
      "  Brand ",
      "brand",
      "ASO",
      "very long invalid tag name exceeding length",
      "x",
    ]);

    const kw = updated.keywords["100:US:meditation"];
    expect(kw?.tags).toEqual(["brand", "aso"]);
  });

  it("calculates competitor overlap across tracked keywords", () => {
    const kws: TrackedKeyword[] = [
      {
        appStoreId: "100",
        country: "US",
        keyword: "meditation",
        normalizedKeyword: "meditation",
        note: "",
        createdAt: "2026-08-08",
        lastCheckedAt: "2026-08-08",
        currentMetrics: {
          popularity: 80,
          difficulty: 60,
          results: 100,
          saturated: false,
          position: 1,
          sampledAt: "2026-08-08",
          topApps: [
            { appStoreId: "100", name: "My App", developer: "Me", genre: "Health & Fitness", iconUrl: "", storeUrl: "", position: 1, ratingAverage: 5, ratingsCount: 100 },
            { appStoreId: "200", name: "Calm", developer: "Calm Inc", genre: "Health & Fitness", iconUrl: "", storeUrl: "", position: 2, ratingAverage: 4.8, ratingsCount: 500 },
          ],
        },
      },
      {
        appStoreId: "100",
        country: "US",
        keyword: "sleep sounds",
        normalizedKeyword: "sleep sounds",
        note: "",
        createdAt: "2026-08-08",
        lastCheckedAt: "2026-08-08",
        currentMetrics: {
          popularity: 70,
          difficulty: 50,
          results: 80,
          saturated: false,
          position: 3,
          sampledAt: "2026-08-08",
          topApps: [
            { appStoreId: "200", name: "Calm", developer: "Calm Inc", genre: "Health & Fitness", iconUrl: "", storeUrl: "", position: 1, ratingAverage: 4.8, ratingsCount: 500 },
            { appStoreId: "300", name: "Headspace", developer: "Headspace Inc", genre: "Health & Fitness", iconUrl: "", storeUrl: "", position: 2, ratingAverage: 4.7, ratingsCount: 400 },
          ],
        },
      },
    ];

    const overlap = calculateCompetitorOverlap("100", kws);
    expect(overlap).toHaveLength(2);
    expect(overlap[0].appStoreId).toBe("200");
    expect(overlap[0].keywordCount).toBe(2);
    expect(overlap[0].keywords).toEqual(["meditation", "sleep sounds"]);
  });
});


describe("blocked storage (private mode)", () => {
  it("loads an empty store instead of throwing", () => {
    const blocked: TrackerStorage = {
      ...makeStorage(),
      getItem: () => {
        throw new DOMException("The operation is insecure", "SecurityError");
      },
    };
    expect(loadTrackerStore(blocked)).toEqual(emptyStore());
  });
});

describe("storage write resilience", () => {
  it("fails open when localStorage writes are blocked (quota/private mode)", () => {
    const throwing: TrackerStorage = {
      ...makeStorage(),
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    };
    expect(() => saveTrackerStore(throwing, emptyStore())).not.toThrow();
  });
});
