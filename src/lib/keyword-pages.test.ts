import { describe, expect, it } from "vitest";

import {
  PAGE_COUNTRIES,
  allKeywordPagePaths,
  buildKeywordPageData,
  categoryPath,
  countryFromSlug,
  countryInText,
  buildTermPageData,
  decodeTermSlug,
  explorerLink,
  genreFromSlug,
  historyNeighbors,
  resolveTermSlug,
  termPath,
  termSitemapEntries,
  termSlug,
} from "@/lib/keyword-pages";
import { DATASET_GENRES, buildDataset } from "@/lib/search-terms";

describe("slugs and paths", () => {
  it("round-trips every category slug", () => {
    for (const genre of DATASET_GENRES) {
      const path = categoryPath("US", genre);
      const slug = path.split("/").pop() ?? "";
      expect(genreFromSlug(slug)).toBe(genre);
    }
    expect(categoryPath("GB", "HEALTH_FITNESS")).toBe("/keywords/gb/health-fitness");
    expect(genreFromSlug("nope")).toBeNull();
  });

  it("only serves storefronts Apple publishes data for", () => {
    expect(countryFromSlug("us")?.code).toBe("US");
    expect(countryFromSlug("ru")).toBeNull();
    expect(countryFromSlug("zz")).toBeNull();
    expect(PAGE_COUNTRIES.some((country) => country.code === "RU")).toBe(false);
  });

  it("lists the hub, each storefront, and each category for the sitemap", () => {
    const paths = allKeywordPagePaths();
    expect(paths[0]).toBe("/keywords");
    expect(paths).toHaveLength(1 + PAGE_COUNTRIES.length * (1 + DATASET_GENRES.length));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("writes country names naturally and deep-links the explorer", () => {
    expect(countryInText(countryFromSlug("us")!)).toBe("the United States");
    expect(countryInText(countryFromSlug("de")!)).toBe("Germany");
    expect(explorerLink("sleep & rest", "US")).toBe("/?kw=sleep%20%26%20rest&country=US");
  });
});

describe("buildKeywordPageData", () => {
  const current = buildDataset("US", "2026-09-20", [
    { term: "calm", genre: "HEALTH_FITNESS", popularity: 70, rankInGenre: 1 },
    { term: "sleep tracker", genre: "HEALTH_FITNESS", popularity: 59, rankInGenre: 58 },
    { term: "walktober", genre: "HEALTH_FITNESS", popularity: 55, rankInGenre: 90 },
    { term: "budget", genre: "FINANCE", popularity: 60, rankInGenre: 20 },
  ]);
  const previous = buildDataset("US", "2026-08-23", [
    { term: "calm", genre: "HEALTH_FITNESS", popularity: 71 },
    { term: "sleep tracker", genre: "HEALTH_FITNESS", popularity: 57 },
  ]);

  it("ranks a category and separates risers from newcomers", () => {
    const data = buildKeywordPageData(current, previous, "HEALTH_FITNESS");
    expect(data?.termCount).toBe(3);
    expect(data?.top.map((row) => row.term)).toEqual(["calm", "sleep tracker", "walktober"]);
    expect(data?.top[0].delta).toBe(-1);
    expect(data?.rising.map((row) => row.term)).toEqual(["sleep tracker"]);
    expect(data?.newcomers.map((row) => row.term)).toEqual(["walktober"]);
    expect(data?.compareWeek).toBe("2026-08-23");
    expect(data?.genreCounts).toEqual({ HEALTH_FITNESS: 3, FINANCE: 1 });
  });

  it("covers the whole storefront without a category", () => {
    const data = buildKeywordPageData(current, null, null);
    expect(data?.termCount).toBe(4);
    expect(data?.top.map((row) => row.term)).toEqual(["calm", "budget", "sleep tracker", "walktober"]);
    expect(data?.rising).toEqual([]);
  });

  it("returns null for a category Apple published nothing for", () => {
    expect(buildKeywordPageData(current, previous, "TRAVEL")).toBeNull();
  });
});

describe("per-term pages", () => {
  const current = buildDataset("US", "2026-09-20", [
    { term: "habit tracker", genre: "HEALTH_FITNESS", popularity: 62, rankInGenre: 14 },
    { term: "habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 55, rankInGenre: 30 },
    { term: "habit", genre: "HEALTH_FITNESS", popularity: 48, rankInGenre: 40 },
    { term: "daily habit tracker", genre: "HEALTH_FITNESS", popularity: 40, rankInGenre: 88 },
    { term: "to-do list", genre: "PRODUCTIVITY_UTILITIES", popularity: 50, rankInGenre: 31 },
    { term: "café", genre: "FOOD_DRINK", popularity: 45, rankInGenre: 5 },
  ]);
  const previous = buildDataset("US", "2026-08-23", [
    { term: "habit tracker", genre: "HEALTH_FITNESS", popularity: 57, rankInGenre: 20 },
  ]);

  it("builds readable, encodable paths", () => {
    expect(termSlug("Habit  Tracker")).toBe("habit-tracker");
    expect(termPath("US", "HEALTH_FITNESS", "habit tracker")).toBe(
      "/keywords/us/health-fitness/habit-tracker",
    );
    expect(termPath("US", "FOOD_DRINK", "café")).toBe("/keywords/us/food-drink/caf%C3%A9");
    expect(decodeTermSlug("caf%C3%A9")).toBe("café");
    // A malformed escape never throws; it just won't match a term.
    expect(decodeTermSlug("caf%E9%")).toBe("caf%e9%");
  });

  it("finds a term by slug, keeping its hyphens, and names its canonical category", () => {
    const found = resolveTermSlug(current, "HEALTH_FITNESS", "habit-tracker");
    expect(found).toMatchObject({ kind: "found", primaryGenre: "HEALTH_FITNESS" });
    const other = resolveTermSlug(current, "PRODUCTIVITY_UTILITIES", "habit-tracker");
    expect(other).toMatchObject({ kind: "found", primaryGenre: "HEALTH_FITNESS" });
    expect(resolveTermSlug(current, "PRODUCTIVITY_UTILITIES", "to-do-list")).toMatchObject({
      kind: "found",
    });
    expect(resolveTermSlug(current, "FOOD_DRINK", "caf%C3%A9")).toMatchObject({ kind: "found" });
    expect(resolveTermSlug(current, "HEALTH_FITNESS", "nothing-here").kind).toBe("missing");
    // Asked under a category that doesn't list it: still found, pointing home.
    expect(resolveTermSlug(current, "FOOD_DRINK", "habit-tracker")).toMatchObject({
      kind: "found",
      primaryGenre: "HEALTH_FITNESS",
    });
  });

  it("shapes the page from the week, the comparison week, and history", () => {
    const row = current.rows[0];
    const data = buildTermPageData(current, previous, row, [
      { week: "2026-08-23", popularity: 57 },
      { week: "2026-09-20", popularity: 62 },
    ]);
    expect(data).toMatchObject({
      term: "habit tracker",
      genre: "HEALTH_FITNESS",
      popularity: 62,
      rankInGenre: 14,
      genreSize: 3,
      previousPopularity: 57,
    });
    expect(data.otherGenres).toEqual([
      { genre: "PRODUCTIVITY_UTILITIES", popularity: 55, rankInGenre: 30 },
    ]);
    expect(data.related.map((item) => item.term)).toContain("daily habit tracker");
    expect(data.related.map((item) => item.term)).not.toContain("habit tracker");
    expect(data.history).toHaveLength(2);
  });

  it("warms neighbours in the same category, never the term itself", () => {
    const neighbours = historyNeighbors(current, current.rows[0], 24);
    expect(neighbours).toEqual(expect.arrayContaining(["habit", "daily habit tracker"]));
    expect(neighbours).not.toContain("habit tracker");
    expect(neighbours).not.toContain("to-do list");
    expect(
      historyNeighbors(current, { term: "unlisted", genre: "HEALTH_FITNESS", popularity: 1 }),
    ).toEqual([]);
  });

  it("lists each term once in the sitemap, under its canonical category", () => {
    const paths = termSitemapEntries(current, 100);
    expect(paths).toContain("/keywords/us/health-fitness/habit-tracker");
    expect(paths).not.toContain("/keywords/us/productivity-utilities/habit-tracker");
    expect(new Set(paths).size).toBe(paths.length);
    // Productivity's #1 is canonical elsewhere, so only two categories list a term.
    expect(termSitemapEntries(current, 1)).toHaveLength(2);
  });
});
