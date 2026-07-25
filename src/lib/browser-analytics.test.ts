// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { trackWebConversion } from "@/lib/browser-analytics";

afterEach(() => {
  delete window.appclimbAnalytics;
  window.sessionStorage.clear();
});

describe("trackWebConversion", () => {
  it("returns false until the tracker is ready", () => {
    expect(trackWebConversion("account_created")).toBe(false);
  });

  it("tracks a named conversion", () => {
    const track = vi.fn();
    window.appclimbAnalytics = { track };

    expect(trackWebConversion("checkout_started")).toBe(true);
    expect(track).toHaveBeenCalledWith("conversion", {
      goal: "checkout_started",
    });
  });

  it("deduplicates session-scoped goals", () => {
    const track = vi.fn();
    window.appclimbAnalytics = { track };

    expect(trackWebConversion("paid_activated", true)).toBe(true);
    expect(trackWebConversion("paid_activated", true)).toBe(true);
    expect(track).toHaveBeenCalledTimes(1);
  });
});
