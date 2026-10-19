import { describe, expect, it } from "vitest";

import { makeStorage } from "../../tests/helpers/make-storage";
import {
  PRO_MONTHLY_USD,
  PRO_YEARLY_MONTHS_FREE,
  PRO_YEARLY_PER_MONTH_USD,
  PRO_YEARLY_SAVE_PERCENT,
  PRO_YEARLY_SAVING_USD,
  PRO_YEARLY_USD,
} from "@/lib/plan";
import {
  isUpgradeReason,
  orderedProFeatures,
  PENDING_UPGRADE_KEY,
  PENDING_UPGRADE_TTL_MS,
  PRO_FEATURE_LABELS,
  savePendingUpgrade,
  takePendingUpgrade,
  UPGRADE_COPY,
  upgradeCopy,
  type UpgradeReason,
} from "@/lib/upgrade";

describe("yearly pricing math", () => {
  it("matches the published $8/month and $64/year", () => {
    expect(PRO_MONTHLY_USD).toBe(8);
    expect(PRO_YEARLY_USD).toBe(64);
    expect(PRO_YEARLY_PER_MONTH_USD).toBe("5.33");
    expect(PRO_YEARLY_SAVING_USD).toBe(32);
    expect(PRO_YEARLY_SAVE_PERCENT).toBe(33);
    expect(PRO_YEARLY_MONTHS_FREE).toBe(4);
  });
});

describe("upgrade copy", () => {
  it("has a headline and a comparison for every reason", () => {
    for (const reason of Object.keys(UPGRADE_COPY) as UpgradeReason[]) {
      const copy = upgradeCopy(reason);
      expect(copy.headline.length).toBeGreaterThan(10);
      expect(copy.body.length).toBeGreaterThan(20);
      expect(copy.compare.freeShare).toBeGreaterThan(0);
      expect(copy.compare.freeShare).toBeLessThan(1);
    }
  });

  it("states the shipped plan limits, not invented ones", () => {
    expect(upgradeCopy("checks").compare).toMatchObject({ free: "30", pro: "Unlimited" });
    expect(upgradeCopy("history").compare).toMatchObject({ free: "12 weeks", pro: "52 weeks" });
    expect(upgradeCopy("assistant").compare).toMatchObject({ free: "5", pro: "200" });
    expect(PRO_FEATURE_LABELS.history).toBe("52 weeks of Apple popularity history");
    expect(PRO_FEATURE_LABELS.ranks).toBe("90 days of rank history");
  });

  it("lists the feature the reason is about first, without duplicates", () => {
    const order = orderedProFeatures("assistant");
    expect(order[0]).toBe("assistant");
    expect(new Set(order).size).toBe(order.length);
    expect(order).toHaveLength(Object.keys(PRO_FEATURE_LABELS).length);
    expect(orderedProFeatures("default")[0]).toBe("checks");
  });

  it("only accepts known reasons", () => {
    expect(isUpgradeReason("checks")).toBe(true);
    expect(isUpgradeReason("toString")).toBe(false);
    expect(isUpgradeReason("nope")).toBe(false);
    expect(isUpgradeReason(undefined)).toBe(false);
    expect(upgradeCopy("bogus" as UpgradeReason)).toBe(UPGRADE_COPY.default);
  });
});

describe("pending upgrade across sign-in", () => {
  it("round-trips once and then clears", () => {
    const storage = makeStorage();
    savePendingUpgrade(storage, { cycle: "monthly", reason: "apps" }, 1_000);
    expect(takePendingUpgrade(storage, 2_000)).toEqual({ cycle: "monthly", reason: "apps" });
    expect(takePendingUpgrade(storage, 2_000)).toBeNull();
    expect(storage.getItem(PENDING_UPGRADE_KEY)).toBeNull();
  });

  it("drops stale and malformed entries", () => {
    const storage = makeStorage();
    savePendingUpgrade(storage, { cycle: "yearly", reason: "checks" }, 0);
    expect(takePendingUpgrade(storage, PENDING_UPGRADE_TTL_MS + 1)).toBeNull();

    storage.setItem(PENDING_UPGRADE_KEY, "{not json");
    expect(takePendingUpgrade(storage, 0)).toBeNull();
    expect(storage.getItem(PENDING_UPGRADE_KEY)).toBeNull();

    storage.setItem(PENDING_UPGRADE_KEY, JSON.stringify({ cycle: "weekly", reason: "x", at: 5 }));
    expect(takePendingUpgrade(storage, 10)).toEqual({ cycle: "yearly", reason: "default" });
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(() => savePendingUpgrade(broken, { cycle: "yearly", reason: "default" })).not.toThrow();
    expect(takePendingUpgrade(broken)).toBeNull();
  });
});
