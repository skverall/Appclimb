import { afterEach, describe, expect, it, vi } from "vitest";

import {
  searchAppStoreCatalog,
  keywordRankPosition,
  deriveKeywordSuggestions,
  cleanSearchResult,
} from "./itunes";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchAppStoreCatalog", () => {
  it("queries iTunes directly and returns cleaned results", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void init;
        // Verify the request targets iTunes with the expected query params.
        expect(String(input)).toBe(
          "https://itunes.apple.com/search?term=car+dealer&country=US&media=software&entity=software&limit=8&explicit=No",
        );
        return Response.json({
          resultCount: 1,
          results: [
            {
              trackId: 6756513314,
              trackName: "Car Dealer Tracker",
              bundleId: "com.aydmaxx.carddealertracker",
              sellerName: "Aydmaxx",
              primaryGenreName: "Business",
              artworkUrl100: "https://is1-ssl.mzstatic.com/icon.jpg",
              trackViewUrl: "https://apps.apple.com/app/id6756513314",
            },
          ],
        });
      },
    );
    vi.stubGlobal("fetch", fetchImpl);

    await expect(
      searchAppStoreCatalog("car dealer", "US", { fetchImpl }),
    ).resolves.toEqual([
      {
        appStoreId: "6756513314",
        name: "Car Dealer Tracker",
        bundleId: "com.aydmaxx.carddealertracker",
        developer: "Aydmaxx",
        genre: "Business",
        iconUrl: "https://is1-ssl.mzstatic.com/icon.jpg",
        storeUrl: "https://apps.apple.com/app/id6756513314",
      },
    ]);
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("rejects too-short queries before calling Apple", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    await expect(searchAppStoreCatalog("x", "US", { fetchImpl })).rejects.toThrow(
      /invalid_app_search/u,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("throws an honest error containing the Apple status on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    await expect(searchAppStoreCatalog("ok", "US")).rejects.toThrow(
      /app_store_catalog_unavailable:403/u,
    );
  });
});

describe("keywordRankPosition", () => {
  it("returns 1-based position of the app, or null when not ranked", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [{ trackId: 111 }, { trackId: 222 }, { trackId: 333 }],
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    await expect(
      keywordRankPosition("kw", "US", "222", { fetchImpl }),
    ).resolves.toBe(2);
    await expect(
      keywordRankPosition("kw", "US", "999", { fetchImpl }),
    ).resolves.toBeNull();
  });
});

describe("deriveKeywordSuggestions", () => {
  it("starts with the app title and dedupes candidates", () => {
    const suggestions = deriveKeywordSuggestions(
      {
        trackName: "Car Dealer Tracker",
        primaryGenreName: "Business",
        description: "Track your car dealership inventory and sales.",
      },
      "fallback",
    );
    expect(suggestions[0]).toEqual({
      keyword: "car dealer tracker",
      reason: "App title",
    });
    const keywords = suggestions.map((s) => s.keyword);
    expect(new Set(keywords).size).toBe(keywords.length);
  });
});

describe("cleanSearchResult", () => {
  it("drops results without a numeric trackId or a name", () => {
    expect(cleanSearchResult({ trackName: "No Id" })).toBeNull();
    expect(cleanSearchResult({ trackId: 123 })).toBeNull();
    expect(cleanSearchResult({ trackId: 123, trackName: "  " })).toBeNull();
  });
});
