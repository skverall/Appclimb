import { afterEach, describe, expect, it, vi } from "vitest";

import { searchAppStoreCatalog } from "./apps-keywords";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchAppStoreCatalog", () => {
  it("returns a small sanitized App Store result set", async () => {
    const providerFetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input;
        void init;
        return Response.json({
        resultCount: 1,
        results: [
          {
            trackId: 123456,
            trackName: "Car Dealer Tracker",
            bundleId: "com.example.dealer",
            sellerName: "Example Studio",
            primaryGenreName: "Business",
            artworkUrl100: "https://example.com/icon.png",
            trackViewUrl: "https://apps.apple.com/app/id123456",
          },
        ],
        });
      },
    );
    vi.stubGlobal("fetch", providerFetch);

    await expect(searchAppStoreCatalog("car dealer", "US")).resolves.toEqual([
      {
        appStoreId: "123456",
        name: "Car Dealer Tracker",
        bundleId: "com.example.dealer",
        developer: "Example Studio",
        genre: "Business",
        iconUrl: "https://example.com/icon.png",
        storeUrl: "https://apps.apple.com/app/id123456",
      },
    ]);
    expect(String(providerFetch.mock.calls[0]?.[0])).toContain(
      "term=car+dealer",
    );
    expect(String(providerFetch.mock.calls[0]?.[0])).toContain("limit=8");
  });

  it("rejects broad or malformed searches before calling Apple", async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);

    await expect(searchAppStoreCatalog("x", "US")).rejects.toMatchObject({
      code: "invalid_app_search",
    });
    await expect(searchAppStoreCatalog("valid", "USA")).rejects.toMatchObject({
      code: "invalid_storefront",
    });
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
