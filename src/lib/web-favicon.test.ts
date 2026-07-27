import { describe, expect, it } from "vitest";

import {
  looksLikeWebDomain,
  normalizeWebDomain,
  preferredWebFaviconUrl,
  webFaviconCandidates,
} from "@/lib/web-favicon";

describe("web-favicon", () => {
  it("normalizes domains from full URLs", () => {
    expect(normalizeWebDomain("https://www.appclimb.app/path")).toBe(
      "appclimb.app",
    );
  });

  it("builds a multi-source candidate list with duckduckgo first after preferred", () => {
    const candidates = webFaviconCandidates(
      "appclimb.app",
      "https://example.com/custom.png",
    );
    expect(candidates[0]).toBe("https://example.com/custom.png");
    expect(candidates[1]).toContain("duckduckgo.com");
    expect(candidates.some((url) => url.includes("icon.horse"))).toBe(
      true,
    );
  });

  it("detects web domains vs store ids", () => {
    expect(looksLikeWebDomain("appclimb.app")).toBe(true);
    expect(looksLikeWebDomain("web:appclimb.app")).toBe(true);
    expect(looksLikeWebDomain("6756513314")).toBe(false);
  });

  it("returns a duckduckgo default icon url", () => {
    expect(preferredWebFaviconUrl("cardealertracker.app")).toBe(
      "https://icons.duckduckgo.com/ip3/cardealertracker.app.ico",
    );
  });
});
