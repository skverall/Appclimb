import { describe, expect, it } from "vitest";

import {
  autoMapPostHogEvents,
  humanizePostHogEvent,
} from "@/lib/posthog-events";

describe("autoMapPostHogEvents", () => {
  it("prefers a session event and a meaningful first-value event", () => {
    const mapped = autoMapPostHogEvents([
      { name: "$pageview", eventCount: 900, uniqueUsers: 120 },
      { name: "paywall_purchase_cancelled", eventCount: 50, uniqueUsers: 20 },
      { name: "guest_first_car_added", eventCount: 42, uniqueUsers: 36 },
      { name: "vehicle_exported", eventCount: 21, uniqueUsers: 18 },
      { name: "subscription_started", eventCount: 8, uniqueUsers: 7 },
    ]);

    expect(mapped.sessionEvent).toBe("$pageview");
    expect(mapped.activationEvent).toBe("guest_first_car_added");
    expect(mapped.eventFlow.map((step) => step.event)).not.toContain(
      "paywall_purchase_cancelled",
    );
    expect(mapped.eventFlow.map((step) => step.event)).toContain(
      "vehicle_exported",
    );
    expect(mapped.eventFlow.at(-1)?.phase).toBe("monetize");
  });

  it("returns a truthful empty map before the first event exists", () => {
    expect(autoMapPostHogEvents([])).toEqual({
      sessionEvent: "",
      activationEvent: "",
      eventFlow: [],
      detectedEventCount: 0,
    });
  });

  it("keeps an app-open signal but does not mistake a notification for a session", () => {
    const mapped = autoMapPostHogEvents([
      { name: "notification_opened", eventCount: 80, uniqueUsers: 50 },
      { name: "app_opened", eventCount: 70, uniqueUsers: 45 },
      { name: "workspace_created", eventCount: 20, uniqueUsers: 18 },
    ]);

    expect(mapped.sessionEvent).toBe("app_opened");
    expect(mapped.eventFlow.map((step) => step.event)).toContain("app_opened");
  });

  it("prefers completed product value over merely starting onboarding", () => {
    const mapped = autoMapPostHogEvents([
      { name: "$pageview", eventCount: 500, uniqueUsers: 100 },
      { name: "onboarding_started", eventCount: 90, uniqueUsers: 70 },
      { name: "activation_first_vehicle_created", eventCount: 30, uniqueUsers: 25 },
      { name: "inventory_returned", eventCount: 15, uniqueUsers: 12 },
      { name: "subscription_started", eventCount: 8, uniqueUsers: 7 },
    ]);

    expect(mapped.activationEvent).toBe("activation_first_vehicle_created");
    expect(new Set(mapped.eventFlow.map((step) => step.phase))).toEqual(
      new Set(["visit", "value", "habit", "monetize"]),
    );
  });
});

describe("humanizePostHogEvent", () => {
  it("turns raw event keys into short labels", () => {
    expect(humanizePostHogEvent("guest_first_car_added")).toBe(
      "Guest first car added",
    );
  });
});
