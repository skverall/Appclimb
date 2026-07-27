import { describe, expect, it } from "vitest";

import {
  dashboardSnapshotSchema,
  isDashboardSnapshot,
} from "@/lib/dashboard-schema";
import { demoSnapshot } from "@/lib/demo-data";
import { deriveWorkspaceReadiness } from "../../cloudflare/api/src/diagnosis/readiness";

describe("dashboardSnapshotSchema", () => {
  it("accepts the complete demo contract", () => {
    expect(isDashboardSnapshot(demoSnapshot)).toBe(true);
  });

  it("rejects a partial payload before the shell can hydrate", () => {
    expect(
      isDashboardSnapshot({
        workspaceName: "Partial workspace",
        stages: [],
        sources: [],
      }),
    ).toBe(false);
  });

  it("accepts nullable timestamps from the Go JSON response", () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.sources[0].lastSyncAt = null;
    expect(dashboardSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it("accepts Web platform app snapshots", () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.app.platform = "Web";
    expect(isDashboardSnapshot(snapshot)).toBe(true);
  });
});

describe("Decision System V2 snapshot fields", () => {
  const readiness = {
    state: "collecting" as const,
    progress: 0.4,
    primaryAction: {
      kind: "confirm_posthog_mapping" as const,
      provider: "posthog" as const,
      reasonCode: "posthog_mapping_unconfirmed",
    },
    capabilities: {
      acquisition: { status: "collecting" as const },
      activation: { status: "blocked" as const, reasonCode: "mapping" },
      monetization: { status: "unsupported" as const },
      retention: { status: "unsupported" as const },
    },
    blockers: [
      {
        code: "apple_reports_pending",
        provider: "app-store-connect" as const,
        required: true,
        lastCheckedAt: "2026-07-27T10:00:00.000Z",
        nextCheckAt: "2026-07-27T16:00:00.000Z",
      },
    ],
  };

  const actionPlan = {
    targetStageId: "activate",
    problem: "New users do not reach first value.",
    desiredOutcome: "Raise activation for new users.",
    whyThisAction: "Activation dropped against this product's own baseline.",
    steps: [
      {
        order: 1,
        title: "Shorten onboarding",
        instruction: "Remove the second optional step.",
        effort: "small" as const,
      },
    ],
    prerequisites: [],
    instrumentation: ["posthog:first_value_reached"],
    primaryMetric: {
      key: "activation_rate",
      label: "Activation rate",
      targetDirection: "up" as const,
    },
    guardrails: [{ key: "churn_rate", label: "Churn" }],
    stopCondition: "Stop after 14 complete days.",
  };

  function decisionSnapshot() {
    const snapshot = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    snapshot.readiness = readiness;
    snapshot.diagnosis = {
      status: "ready",
      generatedAt: "2026-07-27T10:00:00.000Z",
      version: "v2",
      primaryInsightId: "insight-activate",
      limitations: ["Apple reports are two days behind."],
      missingRequirements: [],
      errorCode: null,
    };
    snapshot.actionPlans = [actionPlan];
    return snapshot;
  }

  it("accepts readiness, diagnosis and structured action plans", () => {
    expect(isDashboardSnapshot(decisionSnapshot())).toBe(true);
  });

  it("rejects a readiness payload missing its primary action", () => {
    const snapshot = decisionSnapshot();
    snapshot.readiness = { ...readiness, primaryAction: undefined };
    expect(isDashboardSnapshot(snapshot)).toBe(false);
  });

  it("rejects an unknown readiness primary action kind", () => {
    const snapshot = decisionSnapshot();
    snapshot.readiness = {
      ...readiness,
      primaryAction: { kind: "do_something", reasonCode: "x" },
    };
    expect(isDashboardSnapshot(snapshot)).toBe(false);
  });

  it("rejects an action plan without steps or a stop condition", () => {
    const snapshot = decisionSnapshot();
    snapshot.actionPlans = [{ ...actionPlan, steps: undefined }];
    expect(isDashboardSnapshot(snapshot)).toBe(false);

    const missingStop = decisionSnapshot();
    missingStop.actionPlans = [{ ...actionPlan, stopCondition: undefined }];
    expect(isDashboardSnapshot(missingStop)).toBe(false);
  });

  it("accepts stage comparability, sample size and readiness reason", () => {
    const snapshot = structuredClone(demoSnapshot);
    Object.assign(snapshot.stages[0], {
      comparisonType: "time_baseline",
      sampleSize: 812,
      readinessReason: "baseline_window_complete",
      valueState: "measured",
      baselineMethod: "previous_window",
      baselineWindow: { from: "2026-06-01", to: "2026-06-30" },
      confidence: "medium",
    });
    expect(isDashboardSnapshot(snapshot)).toBe(true);
  });

  it("rejects an unsupported stage comparison type", () => {
    const snapshot = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const stages = snapshot.stages as Array<Record<string, unknown>>;
    stages[0].comparisonType = "industry_benchmark";
    expect(isDashboardSnapshot(snapshot)).toBe(false);
  });

  it("accepts normalized source access, data and mapping statuses", () => {
    const snapshot = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const sources = snapshot.sources as Array<Record<string, unknown>>;
    Object.assign(sources[0], {
      accessStatus: "verified",
      dataStatus: "provider_pending",
      mappingStatus: "not_required",
      lastVerifiedAt: "2026-07-26T09:00:00.000Z",
      nextCheckAt: "2026-07-27T15:00:00.000Z",
      firstDataAt: null,
    });
    expect(isDashboardSnapshot(snapshot)).toBe(true);
  });

  it("rejects a source status that is not part of the normalized model", () => {
    const snapshot = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const sources = snapshot.sources as Array<Record<string, unknown>>;
    sources[0].dataStatus = "connected";
    expect(isDashboardSnapshot(snapshot)).toBe(false);
  });

  it("accepts a persisted PostHog mapping on a source", () => {
    const snapshot = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const sources = snapshot.sources as Array<Record<string, unknown>>;
    sources[0].mappingStatus = "automatic_unconfirmed";
    sources[0].mapping = {
      mode: "automatic",
      status: "automatic_unconfirmed",
      confidence: 0.72,
      sessionEvent: "$pageview",
      activationEvent: "first_value_reached",
      milestoneEvents: [
        { event: "first_value_reached", label: "First value", role: "value" },
      ],
      detectedEventCount: 24,
    };
    expect(isDashboardSnapshot(snapshot)).toBe(true);

    sources[0].mapping = {
      mode: "automatic",
      status: "automatic_unconfirmed",
      confidence: 4,
      milestoneEvents: [],
      detectedEventCount: 24,
    };
    expect(isDashboardSnapshot(snapshot)).toBe(false);
  });

  it("accepts a cohort activation summary and a null one", () => {
    const snapshot = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const pulse = snapshot.posthogPulse as Record<string, unknown>;
    pulse.activation = {
      newUsers: 240,
      activatedUsers: 66,
      activationRate: 0.275,
      activationWindowDays: 7,
      sampleSize: 240,
      cohortStart: "2026-06-19T00:00:00.000Z",
      cohortEnd: "2026-07-19T00:00:00.000Z",
      sessionEvent: "$pageview",
      activationEvent: "first_value_reached",
    };
    expect(isDashboardSnapshot(snapshot)).toBe(true);

    pulse.activation = null;
    expect(isDashboardSnapshot(snapshot)).toBe(true);
  });

  it("rejects a cohort whose activation window is not a real window", () => {
    const snapshot = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    const pulse = snapshot.posthogPulse as Record<string, unknown>;
    pulse.activation = {
      newUsers: 240,
      activatedUsers: 66,
      activationRate: 0.275,
      activationWindowDays: 0,
      sampleSize: 240,
      cohortStart: null,
      cohortEnd: null,
    };
    expect(isDashboardSnapshot(snapshot)).toBe(false);
  });

  it("accepts web installation status without a verified event", () => {
    const snapshot = structuredClone(demoSnapshot) as unknown as Record<string, unknown>;
    snapshot.webInstall = {
      status: "script_pending",
      domain: "example.com",
      verifiedHostname: null,
      firstEventAt: null,
      installationVersion: 1,
    };
    expect(isDashboardSnapshot(snapshot)).toBe(true);

    snapshot.webInstall = { status: "connected", domain: "example.com" };
    expect(isDashboardSnapshot(snapshot)).toBe(false);
  });

  it("still accepts a snapshot that carries none of the new fields", () => {
    expect(isDashboardSnapshot(demoSnapshot)).toBe(true);
  });
});

/**
 * Cross-boundary contract check.
 *
 * The validator and the readiness derivation live on opposite sides of the
 * Worker/Next boundary and were written by different agents. A disagreement
 * between them is invisible in isolation — `isDashboardSnapshot` simply returns
 * false and `page.tsx` degrades the whole workspace to "unavailable" without an
 * error — so the real backend output is asserted against the real validator
 * here. This caught `progress` being emitted as a percent while the schema
 * bounded it to 0-1, which broke Pulse for every authenticated user.
 */
describe("readiness output satisfies the snapshot validator", () => {
  const cases: Array<[string, Parameters<typeof deriveWorkspaceReadiness>[0]]> = [
    [
      "no product",
      {
        app: null,
        sources: [],
        metricCount: 0,
        completeDays: 0,
        hasDiagnosisRun: false,
        hasConfirmedInsight: false,
      },
    ],
    [
      "web app awaiting its first event",
      {
        app: { id: "a", name: "Site", platform: "Web" },
        webProperty: { id: "p", domain: "example.com", firstEventAt: null },
        sources: [],
        metricCount: 0,
        completeDays: 0,
        hasDiagnosisRun: false,
        hasConfirmedInsight: false,
      },
    ],
    [
      "iOS app without App Store Connect",
      {
        app: { id: "a", name: "App", platform: "iOS" },
        sources: [],
        metricCount: 0,
        completeDays: 0,
        hasDiagnosisRun: false,
        hasConfirmedInsight: false,
      },
    ],
    [
      "Apple reports pending",
      {
        app: { id: "a", name: "App", platform: "iOS" },
        sources: [
          {
            provider: "app-store-connect",
            status: "connected",
            lastErrorCode: "no_data_in_window",
          },
        ],
        metricCount: 0,
        completeDays: 0,
        hasDiagnosisRun: false,
        hasConfirmedInsight: false,
      },
    ],
    [
      "collecting a baseline",
      {
        app: { id: "a", name: "App", platform: "iOS" },
        sources: [{ provider: "app-store-connect", status: "connected" }],
        metricCount: 15,
        completeDays: 1,
        hasDiagnosisRun: false,
        hasConfirmedInsight: false,
      },
    ],
    [
      "diagnosis ready",
      {
        app: { id: "a", name: "App", platform: "iOS" },
        sources: [{ provider: "app-store-connect", status: "connected" }],
        metricCount: 150,
        completeDays: 14,
        hasDiagnosisRun: true,
        hasConfirmedInsight: true,
      },
    ],
    [
      "source needs attention",
      {
        app: { id: "a", name: "App", platform: "iOS" },
        sources: [
          {
            provider: "posthog",
            status: "needs-attention",
            lastErrorCode: "authorization_expired",
          },
        ],
        metricCount: 0,
        completeDays: 0,
        hasDiagnosisRun: false,
        hasConfirmedInsight: false,
      },
    ],
  ];

  for (const [name, input] of cases) {
    it(`accepts the payload for: ${name}`, () => {
      const snapshot = structuredClone(
        demoSnapshot,
      ) as unknown as Record<string, unknown>;
      snapshot.readiness = deriveWorkspaceReadiness(input);

      const result = dashboardSnapshotSchema.safeParse(snapshot);
      // Surface the offending path rather than a bare `false`.
      expect(
        result.success ? [] : result.error.issues.map((i) => i.path.join(".")),
      ).toEqual([]);
    });
  }
});
