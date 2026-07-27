import { describe, expect, it } from "vitest";
import {
  hogqlPropertyAccess,
  isSafePropertyKey,
  rankVersionPropertyCandidates,
  suggestVersionProperty,
} from "./version-property";

describe("version property safety", () => {
  it("accepts common PostHog keys", () => {
    expect(isSafePropertyKey("$app_version")).toBe(true);
    expect(isSafePropertyKey("app_version")).toBe(true);
    expect(isSafePropertyKey("build_number")).toBe(true);
  });

  it("rejects injection attempts", () => {
    expect(isSafePropertyKey("app_version; drop table")).toBe(false);
    expect(isSafePropertyKey("version`")).toBe(false);
    expect(isSafePropertyKey("a b")).toBe(false);
    expect(isSafePropertyKey("")).toBe(false);
    expect(() => hogqlPropertyAccess("evil;select")).toThrow(
      "invalid_property_key",
    );
  });

  it("escapes only after validation", () => {
    expect(hogqlPropertyAccess("$app_version")).toBe("properties.$app_version");
  });
});

describe("rankVersionPropertyCandidates", () => {
  it("prefers $app_version over lib_version", () => {
    const ranked = rankVersionPropertyCandidates([
      {
        key: "$lib_version",
        sampleValues: ["1.2.3"],
        distinctCount: 3,
        presentOnSessionEvent: true,
      },
      {
        key: "$app_version",
        sampleValues: ["2.4.1", "2.4.0", "2.3.9"],
        distinctCount: 5,
        presentOnSessionEvent: true,
        lastSeenAt: new Date().toISOString(),
      },
      {
        key: "random_note",
        sampleValues: ["hello world", "foo"],
        distinctCount: 500,
        presentOnSessionEvent: false,
      },
    ]);
    expect(ranked[0]?.key).toBe("$app_version");
    expect(ranked.every((c) => c.key !== "$lib_version")).toBe(true);
  });

  it("requires confirmation path — suggestion is not automatic trust", () => {
    const suggestion = suggestVersionProperty([
      {
        key: "app_version",
        sampleValues: ["1.0.0"],
        distinctCount: 2,
        presentOnSessionEvent: true,
      },
    ]);
    expect(suggestion?.key).toBe("app_version");
    // Caller must still set versionPropertyConfirmed before evaluation.
  });
});
