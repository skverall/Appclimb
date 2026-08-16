import { describe, expect, it } from "vitest";

import {
  isProEntitled,
  isUnlimited,
  limitsForPlan,
  MAX_PRICE_USD_PER_MONTH,
  normalizePlan,
  PLAN_LIMITS,
  PRO_MONTHLY_USD,
  PRO_YEARLY_USD,
} from "@/lib/plan";

describe("plan limits", () => {
  it("free tier caps explorer checks at 8/day and AI at 5/day", () => {
    const free = limitsForPlan("free");
    expect(free.explorerChecksPerDay).toBe(8);
    expect(free.aiMessagesPerDay).toBe(5);
    expect(free.popularityPerDay).toBe(30);
    expect(free.trackedApps).toBe(1);
    expect(free.keywordsPerApp).toBe(25);
    expect(free.historyDays).toBe(30);
    expect(free.cloudSync).toBe(false);
  });

  it("pro tier lifts limits and enables sync", () => {
    const pro = limitsForPlan("pro");
    expect(pro.explorerChecksPerDay).toBeNull();
    expect(pro.aiMessagesPerDay).toBe(200);
    expect(pro.popularityPerDay).toBe(500);
    expect(pro.trackedApps).toBeNull();
    expect(pro.keywordsPerApp).toBeNull();
    expect(pro.historyDays).toBe(90);
    expect(pro.cloudSync).toBe(true);
  });

  it("falls back to free for unknown plans", () => {
    // Cast on purpose: simulate an invalid stored value.
    expect(limitsForPlan("bogus" as never)).toEqual(PLAN_LIMITS.free);
  });

  it("pricing stays under the founder cap", () => {
    expect(PRO_MONTHLY_USD).toBeLessThanOrEqual(MAX_PRICE_USD_PER_MONTH);
    expect(PRO_YEARLY_USD / 12).toBeLessThanOrEqual(MAX_PRICE_USD_PER_MONTH);
  });

  it("isUnlimited treats null as unlimited", () => {
    expect(isUnlimited(null)).toBe(true);
    expect(isUnlimited(8)).toBe(false);
    expect(isUnlimited(0)).toBe(false);
  });

  it("normalizePlan coerces to a valid id", () => {
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("free")).toBe("free");
    expect(normalizePlan("enterprise")).toBe("free");
    expect(normalizePlan(undefined)).toBe("free");
  });
});

describe("isProEntitled", () => {
  const now = Date.parse("2026-08-16T12:00:00.000Z");

  it("returns false with no subscription", () => {
    expect(isProEntitled(null, now)).toBe(false);
    expect(isProEntitled(undefined, now)).toBe(false);
  });

  it("requires the pro plan", () => {
    expect(
      isProEntitled({ plan: "free", status: "active", current_period_end: "2027-01-01T00:00:00Z" }, now),
    ).toBe(false);
  });

  it("active, trialing and past_due statuses grant pro", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(
        isProEntitled({ plan: "pro", status, current_period_end: "2026-01-01T00:00:00Z" }, now),
      ).toBe(true);
    }
  });

  it("paused never grants pro", () => {
    expect(
      isProEntitled({ plan: "pro", status: "paused", current_period_end: "2027-01-01T00:00:00Z" }, now),
    ).toBe(false);
  });

  it("canceled keeps pro until the paid period ends", () => {
    expect(
      isProEntitled({ plan: "pro", status: "canceled", current_period_end: "2026-09-01T00:00:00Z" }, now),
    ).toBe(true);
    expect(
      isProEntitled({ plan: "pro", status: "canceled", current_period_end: "2026-08-01T00:00:00Z" }, now),
    ).toBe(false);
  });

  it("handles invalid or missing period end", () => {
    expect(isProEntitled({ plan: "pro", status: "canceled", current_period_end: null }, now)).toBe(false);
    expect(isProEntitled({ plan: "pro", status: "canceled", current_period_end: "not-a-date" }, now)).toBe(false);
  });
});
