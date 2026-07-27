import { describe, expect, it } from "vitest";

import {
  buildConversionSnippet,
  buildCrawlerForwardingSnippet,
  buildFrameworkInstallTabs,
  buildTrackingSnippet,
} from "./tracking-snippet";
import {
  buildCrawlerAgentPrompt,
  buildTrackingAgentPrompt,
} from "./tracking-agent-prompt";
import {
  BASELINE_TARGET_DAYS,
  BASELINE_TARGET_SESSIONS,
  canonicalHostname,
  deriveWebInstallState,
} from "./web-install-state";

const NOW = new Date("2026-07-27T12:00:00.000Z");
const target = {
  domain: "cardealertracker.app",
  trackingToken: "acwa1_test_token",
  collectorOrigin: "https://appclimb.app",
};

describe("deriveWebInstallState", () => {
  it("reports a saved domain as saved, never as connected", () => {
    const state = deriveWebInstallState(
      { propertyId: "prop-1", domain: target.domain },
      NOW,
    );
    expect(state.status).toBe("domain_saved");
    expect(state.label).toBe("Website saved");
    expect(state.trackingInstalled).toBe(false);
    expect(state.live).toBe(false);
    expect(state.step).toBe("install");
    expect(state.resumeLabel).toBe("Continue website setup");
  });

  it("moves to awaiting_deploy once the user reached the deploy step", () => {
    const state = deriveWebInstallState(
      { propertyId: "prop-1", reachedStep: "deploy" },
      NOW,
    );
    expect(state.status).toBe("awaiting_deploy");
    expect(state.trackingInstalled).toBe(false);
  });

  it("reports listening while bounded verification polling runs", () => {
    const state = deriveWebInstallState(
      { propertyId: "prop-1", reachedStep: "verify", listening: true },
      NOW,
    );
    expect(state.status).toBe("listening");
    expect(state.label).toBe("Listening for first event");
  });

  it("only says Tracking installed after a real accepted event", () => {
    const state = deriveWebInstallState(
      {
        propertyId: "prop-1",
        firstEventAt: "2026-07-27T11:59:00.000Z",
        lastEventAt: "2026-07-27T11:59:00.000Z",
        baselineSessions: 2,
        baselineDays: 1,
      },
      NOW,
    );
    expect(state.status).toBe("first_event_verified");
    expect(state.label).toBe("Tracking installed");
    expect(state.trackingInstalled).toBe(true);
    expect(state.live).toBe(true);
    // The verified step is shown before the goal question.
    expect(state.step).toBe("verify");
  });

  it("does not treat an unmeasured sample as zero", () => {
    const state = deriveWebInstallState(
      {
        propertyId: "prop-1",
        firstEventAt: "2026-07-27T11:00:00.000Z",
        lastEventAt: "2026-07-27T11:00:00.000Z",
        baselineSessions: null,
        baselineDays: null,
        primaryConversionGoal: "account_created",
      },
      NOW,
    );
    expect(state.status).toBe("first_event_verified");
    expect(state.baseline.progress).toBeNull();
    expect(state.baseline.sessions).toBeNull();
    expect(state.readyForDiagnosis).toBe(false);
  });

  it("collects a baseline before it claims Ready for diagnosis", () => {
    const collecting = deriveWebInstallState(
      {
        propertyId: "prop-1",
        firstEventAt: "2026-07-25T11:00:00.000Z",
        lastEventAt: "2026-07-27T11:00:00.000Z",
        baselineSessions: BASELINE_TARGET_SESSIONS - 1,
        baselineDays: BASELINE_TARGET_DAYS,
        primaryConversionGoal: "account_created",
      },
      NOW,
    );
    expect(collecting.status).toBe("collecting");
    expect(collecting.readyForDiagnosis).toBe(false);

    const ready = deriveWebInstallState(
      {
        propertyId: "prop-1",
        firstEventAt: "2026-07-20T11:00:00.000Z",
        lastEventAt: "2026-07-27T11:00:00.000Z",
        baselineSessions: BASELINE_TARGET_SESSIONS,
        baselineDays: BASELINE_TARGET_DAYS,
        primaryConversionGoal: "account_created",
      },
      NOW,
    );
    expect(ready.status).toBe("ready");
    expect(ready.label).toBe("Ready for diagnosis");
    expect(ready.complete).toBe(true);
    expect(ready.resumeLabel).toBeNull();
  });

  it("blocks conversion diagnosis while no goal is configured", () => {
    const state = deriveWebInstallState(
      {
        propertyId: "prop-1",
        firstEventAt: "2026-07-20T11:00:00.000Z",
        lastEventAt: "2026-07-27T11:00:00.000Z",
        baselineSessions: 500,
        baselineDays: 7,
        reachedStep: "goal",
      },
      NOW,
    );
    expect(state.conversionDiagnosisBlocked).toBe(true);
    expect(state.complete).toBe(false);
    expect(state.step).toBe("goal");
  });

  it("reports stale instead of live when a verified install stops reporting", () => {
    const state = deriveWebInstallState(
      {
        propertyId: "prop-1",
        firstEventAt: "2026-06-01T11:00:00.000Z",
        lastEventAt: "2026-07-01T11:00:00.000Z",
        baselineSessions: 0,
        baselineDays: 0,
        primaryConversionGoal: "account_created",
      },
      NOW,
    );
    expect(state.status).toBe("stale");
    expect(state.live).toBe(false);
    expect(state.resumeLabel).toBe("Reconnect website tracking");
  });

  it("surfaces a collector error above every other state", () => {
    const state = deriveWebInstallState(
      {
        propertyId: "prop-1",
        firstEventAt: "2026-07-27T11:59:00.000Z",
        errorCode: "invalid_tracking_token",
      },
      NOW,
    );
    expect(state.status).toBe("error");
    expect(state.resumeLabel).toBe("Fix website tracking");
  });

  it("resumes on the exact incomplete step after a reload", () => {
    expect(deriveWebInstallState({}, NOW).step).toBe("domain");
    expect(
      deriveWebInstallState(
        { propertyId: "p", reachedStep: "deploy" },
        NOW,
      ).step,
    ).toBe("deploy");
    // A reached step cannot exceed what the server can prove.
    expect(
      deriveWebInstallState(
        { propertyId: "p", reachedStep: "baseline" },
        NOW,
      ).step,
    ).toBe("verify");
  });
});

describe("canonicalHostname", () => {
  it.each([
    ["https://www.Example.com/pricing?x=1", "example.com"],
    ["example.com", "example.com"],
    ["http://sub.example.co.uk:8443/", "sub.example.co.uk"],
    ["localhost", "localhost"],
  ])("normalizes %s", (input, expected) => {
    expect(canonicalHostname(input)).toBe(expected);
  });

  it.each(["", "   ", "not a domain", "example", "https://", "..com", "a.1"])(
    "rejects %s",
    (input) => {
      expect(canonicalHostname(input)).toBe("");
    },
  );
});

describe("canonical generators", () => {
  it("emits one snippet shape", () => {
    const snippet = buildTrackingSnippet(target);
    expect(snippet).toContain(
      'src="https://appclimb.app/appclimb-analytics.js"',
    );
    expect(snippet).toContain('data-token="acwa1_test_token"');
    expect(snippet).toContain('data-storage="session"');
    expect(buildTrackingSnippet({ ...target, collectorOrigin: "" })).toContain(
      "https://appclimb.app",
    );
  });

  it("keeps optional crawler forwarding out of the default agent prompt", () => {
    const prompt = buildTrackingAgentPrompt({ ...target, name: "Car Dealer" });
    expect(prompt).toContain(buildTrackingSnippet(target));
    expect(prompt).toContain("Car Dealer (cardealertracker.app)");
    expect(prompt).not.toContain("APPCLIMB_TRACKING_TOKEN");
    expect(prompt).not.toContain("track/crawler");
    expect(prompt).toContain("after it accepts a real browser event");
    expect(prompt).toContain("Do not fire synthetic or test events");
  });

  it("uses the configured goal in the prompt when one exists", () => {
    const prompt = buildTrackingAgentPrompt({
      ...target,
      conversionGoal: "subscription_started",
    });
    expect(prompt).toContain('goal: "subscription_started"');
  });

  it("keeps the crawler prompt separate and server-side", () => {
    const prompt = buildCrawlerAgentPrompt(target);
    expect(prompt).toContain("APPCLIMB_TRACKING_TOKEN");
    expect(prompt).toContain("never expose it in a client bundle");
    expect(buildCrawlerForwardingSnippet(target)).toContain(
      "https://appclimb.app/api/track/crawler",
    );
  });

  it("orders install tabs with crawler forwarding last", () => {
    const tabs = buildFrameworkInstallTabs(target);
    expect(tabs.map((tab) => tab.id)).toEqual([
      "nextjs",
      "react-vite",
      "html",
      "crawler",
    ]);
    expect(tabs.at(-1)?.advanced).toBe(true);
    expect(tabs[0].code).toContain('data-token="acwa1_test_token"');
  });

  it("builds a conversion call for the configured goal", () => {
    expect(buildConversionSnippet("checkout_started")).toContain(
      'goal: "checkout_started"',
    );
    expect(buildConversionSnippet("  ")).toContain('goal: "account_created"');
  });
});
