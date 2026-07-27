import { describe, expect, it } from "vitest";
import { autoMapPostHogEvents, humanizePostHogEvent, type PostHogEventCandidate } from "./posthog-events";

describe("PostHog Event Auto Mapper & Fallback", () => {
  it("handles zero-row candidate lists without crashing", () => {
    const result = autoMapPostHogEvents([]);

    expect(result.sessionEvent).toBe("");
    expect(result.activationEvent).toBe("");
    expect(result.eventFlow).toEqual([]);
    expect(result.detectedEventCount).toBe(0);
  });

  it("correctly identifies session and activation events from candidates", () => {
    const candidates: PostHogEventCandidate[] = [
      { name: "$pageview", eventCount: 1500, uniqueUsers: 300 },
      { name: "onboarding_completed", eventCount: 200, uniqueUsers: 150 },
      { name: "feature_used", eventCount: 800, uniqueUsers: 220 },
      { name: "$screen_view", eventCount: 500, uniqueUsers: 180 },
      { name: "subscription_purchased", eventCount: 30, uniqueUsers: 25 },
    ];

    const result = autoMapPostHogEvents(candidates);

    expect(result.sessionEvent).toBe("$pageview");
    expect(result.activationEvent).toBe("onboarding_completed");
    expect(result.eventFlow.length).toBeGreaterThan(0);
    expect(result.detectedEventCount).toBe(5);
  });

  it("humanizes PostHog event names cleanly", () => {
    expect(humanizePostHogEvent("$pageview")).toBe("Pageview");
    expect(humanizePostHogEvent("onboarding_completed")).toBe("Onboarding completed");
    expect(humanizePostHogEvent("user-activated")).toBe("User activated");
  });
});
