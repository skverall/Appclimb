import { describe, expect, it } from "vitest";
import {
  autoMapPostHogEvents,
  buildPostHogMapping,
  humanizePostHogEvent,
  mappingConfidence,
  milestoneRoleLabel,
  postHogMappingContractStatus,
  postHogMappingNeedsAttention,
  type PostHogEventCandidate,
} from "./posthog-events";

const candidates: PostHogEventCandidate[] = [
  { name: "$pageview", eventCount: 1500, uniqueUsers: 300 },
  { name: "onboarding_completed", eventCount: 200, uniqueUsers: 150 },
  { name: "feature_used", eventCount: 800, uniqueUsers: 220 },
  { name: "$screen_view", eventCount: 500, uniqueUsers: 180 },
  { name: "subscription_purchased", eventCount: 30, uniqueUsers: 25 },
];

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

describe("PostHog mapping lifecycle", () => {
  it("starts every automatic map as unconfirmed, never as trusted", () => {
    const mapping = buildPostHogMapping(candidates);

    expect(mapping.mode).toBe("automatic");
    expect(mapping.status).toBe("automatic_unconfirmed");
    expect(mapping.confirmedAt).toBeUndefined();
    expect(mapping.sessionEvent).toBe("$pageview");
    expect(mapping.activationEvent).toBe("onboarding_completed");
    expect(mapping.detectedEventCount).toBe(5);
    expect(mapping.confidence).toBeGreaterThan(0.5);
    expect(postHogMappingNeedsAttention(mapping)).toBe(true);
    expect(postHogMappingContractStatus(mapping)).toBe("automatic_unconfirmed");
  });

  it("marks a project with no events as insufficient, not failed", () => {
    const mapping = buildPostHogMapping([]);

    expect(mapping.status).toBe("insufficient_events");
    expect(mapping.detectedEventCount).toBe(0);
    expect(mapping.confidence).toBe(0);
    expect(mapping.milestoneEvents).toEqual([]);
  });

  it("marks a mapping invalid when a chosen event left the project", () => {
    const mapping = buildPostHogMapping(candidates, {
      sessionEvent: "$pageview",
      activationEvent: "event_that_was_renamed",
    });

    expect(mapping.status).toBe("invalid");
    expect(mapping.confidence).toBe(0);
  });

  it("marks a mapping invalid when both roles point at one event", () => {
    expect(
      buildPostHogMapping(candidates, {
        sessionEvent: "$pageview",
        activationEvent: "$pageview",
      }).status,
    ).toBe("invalid");
  });

  it("records a user-chosen mapping as confirmed and manual", () => {
    const mapping = buildPostHogMapping(candidates, {
      mode: "manual",
      sessionEvent: "$screen_view",
      activationEvent: "subscription_purchased",
      confirmedAt: "2026-07-27T10:00:00.000Z",
    });

    expect(mapping.status).toBe("confirmed");
    expect(mapping.mode).toBe("manual");
    expect(mapping.confirmedAt).toBe("2026-07-27T10:00:00.000Z");
    expect(postHogMappingContractStatus(mapping)).toBe("manual");
    expect(postHogMappingNeedsAttention(mapping)).toBe(false);
  });

  it("keeps a confirmed automatic map distinguishable from a manual one", () => {
    const mapping = buildPostHogMapping(candidates, {
      mode: "automatic",
      sessionEvent: "$pageview",
      activationEvent: "onboarding_completed",
      confirmedAt: "2026-07-27T10:00:00.000Z",
    });

    expect(postHogMappingContractStatus(mapping)).toBe("confirmed");
  });

  it("drops milestone events the project no longer emits", () => {
    const mapping = buildPostHogMapping(candidates, {
      sessionEvent: "$pageview",
      activationEvent: "onboarding_completed",
      milestoneEvents: [
        { event: "feature_used", label: "Feature used", role: "habit" },
        { event: "deleted_event", label: "Deleted", role: "value" },
        { event: "feature_used", label: "Duplicate", role: "value" },
      ],
    });

    expect(mapping.milestoneEvents).toEqual([
      { event: "feature_used", label: "Feature used", role: "habit" },
    ]);
  });

  it("accepts the legacy eventFlow shape as milestone input", () => {
    const mapping = buildPostHogMapping(candidates, {
      sessionEvent: "$pageview",
      activationEvent: "onboarding_completed",
      milestoneEvents: [
        { event: "subscription_purchased", label: "", phase: "monetize" },
      ],
    });

    expect(mapping.milestoneEvents).toEqual([
      {
        event: "subscription_purchased",
        label: "Subscription purchased",
        role: "monetize",
      },
    ]);
  });

  it("scores confidence deterministically and only from observed evidence", () => {
    const strong = mappingConfidence(
      candidates,
      "$pageview",
      "onboarding_completed",
    );
    const weak = mappingConfidence(
      [
        { name: "$pageview", eventCount: 2, uniqueUsers: 1 },
        { name: "thing", eventCount: 1, uniqueUsers: 1 },
      ],
      "$pageview",
      "thing",
    );

    expect(strong).toBe(
      mappingConfidence(candidates, "$pageview", "onboarding_completed"),
    );
    expect(strong).toBeGreaterThan(weak);
    expect(weak).toBeGreaterThan(0);
    expect(strong).toBeLessThanOrEqual(1);
    expect(mappingConfidence(candidates, "$pageview", "missing")).toBe(0);
  });

  it("labels milestone roles for a reach view, not a funnel step", () => {
    expect(milestoneRoleLabel("visit")).toBe("Active use");
    expect(milestoneRoleLabel("value")).toBe("First value");
    expect(milestoneRoleLabel("habit")).toBe("Repeat use");
    expect(milestoneRoleLabel("monetize")).toBe("Monetization");
    expect(milestoneRoleLabel("unknown")).toBe("Product milestone");
  });

  it("exposes milestone events alongside the auto map", () => {
    const auto = autoMapPostHogEvents(candidates);

    expect(auto.milestoneEvents.length).toBe(auto.eventFlow.length);
    expect(auto.milestoneEvents[0]).toMatchObject({
      event: auto.eventFlow[0]?.event,
      role: auto.eventFlow[0]?.phase,
    });
    expect(auto.confidence).toBeGreaterThan(0);
  });
});
