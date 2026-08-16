import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, isoFromNow, nowIso } from "@/lib/db";

describe("db helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("nowIso returns the current UTC timestamp", () => {
    expect(nowIso()).toBe("2026-08-16T12:00:00.000Z");
  });

  it("isoFromNow offsets from now", () => {
    expect(isoFromNow(60_000)).toBe("2026-08-16T12:01:00.000Z");
    expect(isoFromNow(-60_000)).toBe("2026-08-16T11:59:00.000Z");
  });

  it("getDb returns null when no Cloudflare context is available", () => {
    // In the unit-test environment there is no Worker request context, so
    // getCloudflareContext throws and getDb degrades to null.
    expect(getDb()).toBeNull();
  });
});
