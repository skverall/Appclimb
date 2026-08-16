import { describe, expect, it } from "vitest";

import {
  appleInsightsGenreCandidates,
  genreLookupAliases,
  inferAppleGenre,
  isAppleAdsGenre,
  mapItunesGenre,
} from "@/lib/apple-ads-genres";

describe("mapItunesGenre", () => {
  it("maps common iTunes names to Ads tokens", () => {
    expect(mapItunesGenre("Health & Fitness")).toBe("HEALTH_FITNESS");
    expect(mapItunesGenre("Photo & Video")).toBe("PHOTO_VIDEO");
    expect(mapItunesGenre("Productivity")).toBe("PRODUCTIVITY_UTILITIES");
    expect(mapItunesGenre("Games")).toBe("GAMES");
    expect(mapItunesGenre("Food & Drink")).toBe("FOOD_DRINK");
  });

  it("accepts Ads tokens and underscored aliases", () => {
    expect(mapItunesGenre("HEALTH_AND_FITNESS")).toBe("HEALTH_AND_FITNESS");
    expect(mapItunesGenre("health-and-fitness")).toBe("HEALTH_AND_FITNESS");
    expect(isAppleAdsGenre("PRODUCTIVITY")).toBe(true);
    expect(isAppleAdsGenre("not-a-genre")).toBe(false);
  });

  it("returns null for empty or unknown names", () => {
    expect(mapItunesGenre("")).toBeNull();
    expect(mapItunesGenre("   ")).toBeNull();
    expect(mapItunesGenre("Made Up Category")).toBeNull();
  });
});

describe("inferAppleGenre", () => {
  it("picks the most common genre and breaks ties by rank", () => {
    expect(
      inferAppleGenre([
        { genre: "Health & Fitness" },
        { genre: "Lifestyle" },
        { genre: "Health & Fitness" },
        { genre: "Lifestyle" },
        { genre: "Lifestyle" },
      ]),
    ).toBe("LIFESTYLE");
    expect(
      inferAppleGenre([
        { genre: "Productivity" },
        { genre: "Utilities" },
      ]),
    ).toBe("PRODUCTIVITY_UTILITIES");
  });

  it("returns null when nothing maps", () => {
    expect(inferAppleGenre([])).toBeNull();
    expect(inferAppleGenre([{ genre: "" }, { genre: "???" }])).toBeNull();
  });
});

describe("genreLookupAliases", () => {
  it("tries both Health Fitness token spellings", () => {
    expect(genreLookupAliases("HEALTH_AND_FITNESS")).toEqual([
      "HEALTH_AND_FITNESS",
      "HEALTH_FITNESS",
    ]);
    expect(genreLookupAliases("PRODUCTIVITY")).toEqual(["PRODUCTIVITY"]);
  });

  it("uses Apple's Insights tokens for Productivity", () => {
    expect(appleInsightsGenreCandidates("PRODUCTIVITY")[0]).toBe(
      "PRODUCTIVITY_UTILITIES",
    );
    expect(appleInsightsGenreCandidates("UTILITIES")).toEqual([
      "PRODUCTIVITY_UTILITIES",
    ]);
    expect(appleInsightsGenreCandidates("HEALTH_AND_FITNESS")).toEqual([
      "HEALTH_FITNESS",
    ]);
    expect(appleInsightsGenreCandidates("FOOD_AND_DRINK")).toEqual(["FOOD_DRINK"]);
    expect(appleInsightsGenreCandidates("PHOTO_AND_VIDEO")).toEqual([
      "PHOTO_VIDEO",
    ]);
    expect(appleInsightsGenreCandidates("NEWS")).toEqual(["NEW_PUBLICATION"]);
    expect(appleInsightsGenreCandidates("TRAVEL")).toEqual(["TRAVEL"]);
  });
});
