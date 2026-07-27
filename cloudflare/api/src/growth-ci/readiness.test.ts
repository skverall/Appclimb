import { describe, expect, it } from "vitest";
import { computeMeasurementReadiness } from "./readiness";
import { assessGrowthCiAccess } from "./entitlement";

describe("computeMeasurementReadiness", () => {
  it("blocks when version is unconfirmed", () => {
    const result = computeMeasurementReadiness({
      revenueCatConnected: true,
      revenueCatHasData: true,
      posthogConnected: true,
      mappingStatus: "confirmed",
      sessionEvent: "app_opened",
      activationEvent: "first_value",
      versionProperty: "$app_version",
      versionPropertyStatus: "unconfirmed",
    });
    expect(result.overall).toBe("blocked");
    expect(result.version.status).toBe("blocked");
    expect(result.nextAction).toMatch(/version/i);
  });

  it("is ready when money, activation, and version are confirmed", () => {
    const result = computeMeasurementReadiness({
      revenueCatConnected: true,
      revenueCatHasData: true,
      posthogConnected: true,
      mappingStatus: "confirmed",
      sessionEvent: "app_opened",
      activationEvent: "first_value",
      versionProperty: "$app_version",
      versionPropertyStatus: "confirmed",
    });
    expect(result.overall).toBe("ready");
    expect(result.money.status).toBe("ready");
    expect(result.activation.status).toBe("ready");
    expect(result.version.status).toBe("ready");
  });
});

describe("assessGrowthCiAccess", () => {
  it("allows free first verdict without paid plan", () => {
    const access = assessGrowthCiAccess(
      {
        subscriptionStatus: "none",
        trialEndsAt: "2020-01-01T00:00:00.000Z",
      },
      null,
    );
    expect(access.canRunReleaseChecks).toBe(true);
    expect(access.canUseAgentBridge).toBe(false);
    expect(access.reason).toBe("free_first_verdict");
  });

  it("blocks automation after free verdict without paid", () => {
    const access = assessGrowthCiAccess(
      {
        subscriptionStatus: "none",
        trialEndsAt: "2020-01-01T00:00:00.000Z",
      },
      "2026-07-01T00:00:00.000Z",
    );
    expect(access.canRunReleaseChecks).toBe(false);
    expect(access.canUseAgentBridge).toBe(false);
    expect(access.reason).toBe("free_exhausted");
  });

  it("keeps paid access after free verdict consumed", () => {
    const access = assessGrowthCiAccess(
      {
        subscriptionStatus: "active",
        trialEndsAt: "2020-01-01T00:00:00.000Z",
        entitlementEndsAt: "2099-01-01T00:00:00.000Z",
      },
      "2026-07-01T00:00:00.000Z",
    );
    expect(access.canRunReleaseChecks).toBe(true);
    expect(access.canUseAgentBridge).toBe(true);
    expect(access.reason).toBe("paid");
  });
});
