import { describe, expect, it } from "vitest";

import {
  addKeywordsToStore,
  addTrackedApp,
  emptyStore,
  needsPopularityUpgrade,
  rankBucketSeries,
  rankMovers,
  recordRankSnapshot,
  type TrackerStore,
} from "@/lib/tracker";

const APP = {
  appStoreId: "42",
  name: "Car Dealer Tracker",
  bundleId: "com.example",
  developer: "Studio",
  genre: "Business",
  iconUrl: "",
  storeUrl: "",
  country: "US",
};

function storeWith(history: Record<string, Array<[string, number | null]>>): TrackerStore {
  let store = addTrackedApp(emptyStore(), APP).store;
  store = addKeywordsToStore(store, APP.appStoreId, APP.country, Object.keys(history)).store;
  for (const [keyword, points] of Object.entries(history)) {
    for (const [date, position] of points) {
      store = recordRankSnapshot(store, APP.appStoreId, APP.country, keyword, {
        date,
        sampledAt: `${date}T10:00:00Z`,
        position,
        popularity: 50,
        difficulty: 40,
        resultsCount: 100,
        saturated: false,
      });
    }
  }
  return store;
}

describe("rankBucketSeries", () => {
  const store = storeWith({
    "car dealer": [
      ["2026-09-28", 94],
      ["2026-09-30", 40],
    ],
    "dealer tracker": [["2026-09-29", 1]],
    profit: [
      ["2026-09-28", null],
      ["2026-10-01", 150],
    ],
  });

  it("buckets each day by the last measured position, without inventing data", () => {
    const series = rankBucketSeries(store, "42", "US", 7, "2026-10-01");
    expect(series.map((point) => point.date)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]);
    expect(series[0]).toMatchObject({
      top10: 0,
      top50: 0,
      top200: 1,
      outside: 1,
      averagePosition: 94,
      best: 94,
    });
    // "dealer tracker" joins on its first check; earlier days don't count it.
    expect(series[1]).toMatchObject({ top10: 1, top200: 1, outside: 1, best: 1 });
    expect(series[2]).toMatchObject({ top10: 1, top50: 1, outside: 1, averagePosition: 20.5 });
    expect(series[3]).toMatchObject({ top10: 1, top50: 1, top200: 1, outside: 0 });
  });

  it("is empty when nothing has been checked", () => {
    const blank = addTrackedApp(emptyStore(), APP).store;
    expect(rankBucketSeries(blank, "42", "US", 30, "2026-10-01")).toEqual([]);
  });
});

describe("rankMovers", () => {
  const store = storeWith({
    "car dealer": [
      ["2026-09-20", 94],
      ["2026-09-30", 40],
    ],
    "dealer business": [
      ["2026-09-25", 87],
      ["2026-10-01", 92],
    ],
    profit: [
      ["2026-09-28", null],
      ["2026-10-01", 150],
    ],
    steady: [
      ["2026-09-28", 5],
      ["2026-10-01", 5],
    ],
  });

  it("compares the first check in the window with the latest", () => {
    const { up, down } = rankMovers(store, "42", "US", 7, { today: "2026-10-01" });
    expect(up.map((mover) => [mover.keyword, mover.from, mover.to, mover.change])).toEqual([
      ["profit", null, 150, 51],
    ]);
    expect(down.map((mover) => [mover.keyword, mover.change])).toEqual([["dealer business", -5]]);
  });

  it("widens with the window", () => {
    const { up } = rankMovers(store, "42", "US", 30, { today: "2026-10-01" });
    expect(up.map((mover) => mover.keyword)).toEqual(["car dealer", "profit"]);
  });
});

describe("needsPopularityUpgrade", () => {
  const base = {
    appStoreId: "42",
    country: "US",
    keyword: "car dealer",
    normalizedKeyword: "car dealer",
    note: "",
    createdAt: "2026-10-01",
  };
  const metrics = {
    popularity: 92,
    difficulty: 80,
    results: 200,
    saturated: true,
    topApps: [],
    position: 1,
    sampledAt: "2026-10-01T05:45:00Z",
  };
  const now = Date.parse("2026-10-01T09:00:00Z");

  it("re-checks old rough estimates so Apple's numbers replace them", () => {
    expect(
      needsPopularityUpgrade(
        { ...base, lastCheckedAt: "2026-10-01T05:45:00Z", currentMetrics: { ...metrics, popularitySource: "estimated" } },
        now,
      ),
    ).toBe(true);
    // Legacy rows have no source at all.
    expect(
      needsPopularityUpgrade({ ...base, lastCheckedAt: "2026-10-01T05:45:00Z", currentMetrics: metrics }, now),
    ).toBe(true);
  });

  it("leaves Apple-sourced, fresh, unchecked, and failed rows alone", () => {
    const at = "2026-10-01T05:45:00Z";
    expect(
      needsPopularityUpgrade({ ...base, lastCheckedAt: at, currentMetrics: { ...metrics, popularitySource: "official" } }, now),
    ).toBe(false);
    expect(
      needsPopularityUpgrade({ ...base, lastCheckedAt: at, currentMetrics: { ...metrics, popularitySource: "longtail" } }, now),
    ).toBe(false);
    expect(
      needsPopularityUpgrade(
        { ...base, lastCheckedAt: "2026-10-01T08:30:00Z", currentMetrics: { ...metrics, popularitySource: "estimated" } },
        now,
      ),
    ).toBe(false);
    expect(needsPopularityUpgrade({ ...base, lastCheckedAt: null, currentMetrics: null }, now)).toBe(false);
    expect(
      needsPopularityUpgrade({ ...base, lastCheckedAt: at, currentMetrics: { ...metrics, unavailable: true } }, now),
    ).toBe(false);
  });
});
