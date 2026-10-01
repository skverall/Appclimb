import { describe, expect, it } from "vitest";

import {
  PAGE_COUNTRIES,
  allKeywordPagePaths,
  buildKeywordPageData,
  categoryPath,
  countryFromSlug,
  countryInText,
  explorerLink,
  genreFromSlug,
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
