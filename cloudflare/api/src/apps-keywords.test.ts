import { describe, expect, it } from "vitest";

import { sanitizeClientAppMetadata } from "./apps-keywords";

describe("sanitizeClientAppMetadata", () => {
  it("accepts well-formed metadata and bounds every field", () => {
    const cleaned = sanitizeClientAppMetadata({
      appStoreId: "123456",
      name: "Car Dealer Tracker",
      bundleId: "com.example.dealer",
      developer: "Example Studio",
      genre: "Business",
      iconUrl: "https://example.com/icon.png",
      storeUrl: "https://apps.apple.com/app/id123456",
    });
    expect(cleaned).toEqual({
      appStoreId: "123456",
      name: "Car Dealer Tracker",
      bundleId: "com.example.dealer",
      developer: "Example Studio",
      genre: "Business",
      iconUrl: "https://example.com/icon.png",
      storeUrl: "https://apps.apple.com/app/id123456",
    });
  });

  it("rejects a non-numeric appStoreId", () => {
    expect(() =>
      sanitizeClientAppMetadata({ appStoreId: "abc", name: "App" }),
    ).toThrow(/invalid_app_store_id/u);
  });

  it("rejects a missing or empty name", () => {
    expect(() =>
      sanitizeClientAppMetadata({ appStoreId: "1", name: "   " }),
    ).toThrow(/invalid_app_metadata/u);
  });

  it("truncates over-long display fields to their column limits", () => {
    const cleaned = sanitizeClientAppMetadata({
      appStoreId: "1",
      name: "x".repeat(500),
      bundleId: "b".repeat(500),
      developer: "d".repeat(500),
      genre: "g".repeat(200),
      iconUrl: "i".repeat(2000),
      storeUrl: "s".repeat(2000),
    });
    expect(cleaned.name).toHaveLength(120);
    expect(cleaned.bundleId).toHaveLength(255);
    expect(cleaned.developer).toHaveLength(160);
    expect(cleaned.genre).toHaveLength(80);
    expect(cleaned.iconUrl).toHaveLength(1024);
    expect(cleaned.storeUrl).toHaveLength(1024);
  });
});
