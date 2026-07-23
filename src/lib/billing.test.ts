import { describe, expect, it } from "vitest";

import { BILLING_PLANS, getTrialState } from "@/lib/billing";

describe("billing contract", () => {
  it("offers the approved monthly and yearly prices", () => {
    expect(BILLING_PLANS.monthly.amount).toBe(12.99);
    expect(BILLING_PLANS.yearly.amount).toBe(129);
  });

  it("provides a 14-day no-card entitlement window", () => {
    expect(
      getTrialState(
        "2026-07-01T00:00:00.000Z",
        new Date("2026-07-03T00:00:00.000Z"),
      ),
    ).toMatchObject({ active: true, daysRemaining: 12 });
    expect(
      getTrialState(
        "2026-07-01T00:00:00.000Z",
        new Date("2026-07-16T00:00:00.000Z"),
      ).active,
    ).toBe(false);
  });
});
