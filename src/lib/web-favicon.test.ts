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

  it("strips the web: prefix, ports and trailing dots", () => {
    expect(normalizeWebDomain("web:Example.COM:8443.")).toBe("example.com");
  });

  it("resolves icons through the same-origin proxy", () => {
    expect(webFaviconCandidates("appclimb.app")).toEqual([
      "/api/site-icon?domain=appclimb.app",
    ]);
  });

  it("drops stored icon URLs the CSP would block", () => {
    const candidates = webFaviconCandidates(
      "appclimb.app",
      "https://icons.duckduckgo.com/ip3/appclimb.app.ico",
    );
    expect(candidates).toEqual(["/api/site-icon?domain=appclimb.app"]);
  });

  it("keeps stored icon URLs the CSP allows, ahead of the proxy", () => {
    const candidates = webFaviconCandidates(
      "appclimb.app",
      "https://is1-ssl.mzstatic.com/icon.png",
    );
    expect(candidates).toEqual([
      "https://is1-ssl.mzstatic.com/icon.png",
      "/api/site-icon?domain=appclimb.app",
    ]);
  });

  it("keeps data URIs and same-origin paths", () => {
    expect(webFaviconCandidates("appclimb.app", "data:image/png;base64,AA")[0]).toBe(
      "data:image/png;base64,AA",
    );
    expect(webFaviconCandidates("appclimb.app", "/uploads/icon.png")[0]).toBe(
      "/uploads/icon.png",
    );
  });

  it("rejects insecure and malformed stored icon URLs", () => {
    expect(webFaviconCandidates("appclimb.app", "http://appclimb.app/i.png")).toEqual([
      "/api/site-icon?domain=appclimb.app",
    ]);
    expect(webFaviconCandidates("appclimb.app", "not a url")).toEqual([
      "/api/site-icon?domain=appclimb.app",
    ]);
  });

  it("returns no candidates without a domain", () => {
    expect(webFaviconCandidates("")).toEqual([]);
    expect(preferredWebFaviconUrl("")).toBe("");
  });

  it("detects web domains vs store ids", () => {
    expect(looksLikeWebDomain("appclimb.app")).toBe(true);
    expect(looksLikeWebDomain("web:appclimb.app")).toBe(true);
    expect(looksLikeWebDomain("6756513314")).toBe(false);
    expect(looksLikeWebDomain("")).toBe(false);
    expect(looksLikeWebDomain(null)).toBe(false);
  });

  it("points the stored default at the proxy", () => {
    expect(preferredWebFaviconUrl("cardealertracker.app")).toBe(
      "/api/site-icon?domain=cardealertracker.app",
    );
  });
});
