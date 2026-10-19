import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps same-origin paths with query and hash", () => {
    expect(safeRedirectPath("/pricing")).toBe("/pricing");
    expect(safeRedirectPath("/keywords/us?x=1#top")).toBe("/keywords/us?x=1#top");
  });

  it("rejects anything that could leave the site", () => {
    for (const raw of [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "https://evil.com",
      "evil.com",
      "javascript:alert(1)",
      "/\tevil",
      "/\n/evil.com",
      "",
      "   ",
    ]) {
      expect(safeRedirectPath(raw)).toBe("/");
    }
  });

  it("uses the fallback for missing or oversized values", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined, "")).toBe("");
    expect(safeRedirectPath(`/${"a".repeat(600)}`)).toBe("/");
  });
});
