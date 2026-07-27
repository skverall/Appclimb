import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActionPlan, DashboardSnapshot } from "@/lib/contracts";
import { demoSnapshot } from "@/lib/demo-data";
import {
  actionPlanFor,
  createExperimentDraft,
  experimentApi,
  experimentCreatePayload,
  experimentIdForInsight,
  FEEDBACK_REASON_REQUIRED,
  parseExperimentList,
  parsePersistedExperiment,
  sendInsightFeedback,
} from "@/lib/experiments";

const activationPlan: ActionPlan = {
  targetStageId: "activate",
  problem: "Activation rate (21.0%) trails the 35% benchmark.",
  desiredOutcome: "Raise first key action within 24h to the benchmark.",
  whyThisAction: "Activate is the earliest supported constraint.",
  steps: [
    {
      order: 1,
      title: "Remove the workspace configuration gate",
      instruction: "Let the first key action happen before configuration.",
      effort: "medium",
    },
  ],
  prerequisites: ["PostHog activation event confirmed"],
  instrumentation: ["activation_rate from PostHog"],
  primaryMetric: {
    key: "activation_rate",
    label: "Activation rate",
    targetDirection: "up",
  },
  guardrails: [{ key: "d7_retention", label: "D7 retention" }],
  segment: "New installs",
  stopCondition: "Run for 14 complete UTC days.",
  evidenceIds: ["ev-activation"],
};

function snapshotWithPlan(): DashboardSnapshot {
  const snapshot = structuredClone(demoSnapshot) as DashboardSnapshot;
  snapshot.actionProposals = snapshot.actionProposals.map((proposal) =>
    proposal.insightId === "insight-activation"
      ? { ...proposal, actionPlan: activationPlan }
      : proposal,
  );
  return snapshot;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("experiment drafts", () => {
  it("derives activation metrics and source from the selected evidence", () => {
    const insight = demoSnapshot.insights.find(
      (item) => item.id === "insight-activation",
    );
    expect(insight).toBeDefined();

    const draft = createExperimentDraft(demoSnapshot, insight!);

    expect(draft).toMatchObject({
      id: "draft-insight-activation",
      title: "Run a shorter onboarding experiment",
      stageId: "activate",
      primaryMetric: "First key action within 24h",
      guardrailMetric: "D7 retention",
      source: "posthog",
      status: "draft",
    });
  });

  it("uses Store evidence instead of hardcoded activation defaults", () => {
    const insight = demoSnapshot.insights.find(
      (item) => item.id === "insight-store",
    );
    expect(insight).toBeDefined();

    const draft = createExperimentDraft(demoSnapshot, insight!);

    expect(draft.primaryMetric).toBe("Product page conversion");
    expect(draft.guardrailMetric).toBe("Download volume");
    expect(draft.source).toBe("app-store-connect");
  });

  it("returns a stable id so repeated clicks do not duplicate a draft", () => {
    expect(experimentIdForInsight("insight-renewal")).toBe(
      "draft-insight-renewal",
    );
  });

  it("prefers the structured action plan over the stage metric table", () => {
    const snapshot = snapshotWithPlan();
    const insight = snapshot.insights.find(
      (item) => item.id === "insight-activation",
    )!;

    const draft = createExperimentDraft(snapshot, insight);

    expect(draft.primaryMetric).toBe("Activation rate");
    expect(draft.guardrailMetric).toBe("D7 retention");
    expect(draft.hypothesis).toBe(activationPlan.desiredOutcome);
    expect(draft.segment).toBe("New installs");
    expect(draft.steps).toHaveLength(1);
    expect(draft.evidenceIds).toEqual(["ev-activation"]);
    expect(draft.insightId).toBe("insight-activation");
    expect(draft.actionProposalId).toBe("action-activation");
  });

  it("finds a plan attached to the proposal for the selected insight", () => {
    const snapshot = snapshotWithPlan();
    const insight = snapshot.insights.find(
      (item) => item.id === "insight-activation",
    )!;
    expect(actionPlanFor(snapshot, insight)).toBe(activationPlan);
    const other = snapshot.insights.find((item) => item.id === "insight-store")!;
    expect(actionPlanFor(snapshot, other)).toBeUndefined();
  });

  it("sends only server-validated fields and never a client id", () => {
    const snapshot = snapshotWithPlan();
    const insight = snapshot.insights.find(
      (item) => item.id === "insight-activation",
    )!;
    const payload = experimentCreatePayload(
      "app-1",
      createExperimentDraft(snapshot, insight),
    );
    expect(payload).not.toHaveProperty("id");
    expect(payload.appId).toBe("app-1");
    expect(payload.insightId).toBe("insight-activation");
    expect(payload.status).toBe("draft");
  });
});

describe("persisted experiment parsing", () => {
  const row = {
    id: "exp-1",
    title: "Shorter onboarding",
    stageId: "activate",
    hypothesis: "Removing a step raises activation.",
    primaryMetric: "Activation rate",
    guardrailMetric: "D7 retention",
    status: "running",
    source: "posthog",
    evidenceIds: ["ev-activation"],
    steps: [],
    guardrails: [],
  };

  it("accepts a well-formed row", () => {
    expect(parsePersistedExperiment(row)?.id).toBe("exp-1");
  });

  it("rejects rows that are missing or malformed", () => {
    expect(parsePersistedExperiment(null)).toBeNull();
    expect(parsePersistedExperiment({ ...row, id: "" })).toBeNull();
    expect(parsePersistedExperiment({ ...row, status: "launched" })).toBeNull();
    expect(parsePersistedExperiment({ ...row, stageId: 4 })).toBeNull();
  });

  it("drops unusable rows from a list instead of rendering them", () => {
    expect(
      parseExperimentList({ data: [row, { id: "broken" }] }),
    ).toHaveLength(1);
  });

  it("defaults array fields when the API omits them", () => {
    const parsed = parsePersistedExperiment({
      ...row,
      steps: undefined,
      guardrails: undefined,
      evidenceIds: undefined,
    });
    expect(parsed?.steps).toEqual([]);
    expect(parsed?.guardrails).toEqual([]);
    expect(parsed?.evidenceIds).toEqual([]);
  });
});

describe("experiment API client", () => {
  it("requests the workspace app and parses the rows", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () =>
      Response.json({
        data: [
          {
            id: "exp-1",
            title: "Shorter onboarding",
            stageId: "activate",
            hypothesis: "h",
            primaryMetric: "p",
            guardrailMetric: "g",
            status: "draft",
            source: "posthog",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { location: { origin: "https://appclimb.app" } });

    const rows = await experimentApi.list("app-1");

    expect(rows).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/api/experiments?appId=app-1",
    );
  });

  it("throws instead of pretending an unauthenticated create succeeded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Authentication required" }, { status: 401 }),
      ),
    );
    await expect(
      experimentApi.create("app-1", {
        id: "draft-x",
        title: "t",
        stageId: "activate",
        hypothesis: "h",
        primaryMetric: "p",
        guardrailMetric: "g",
        status: "draft",
        source: "posthog",
      }),
    ).rejects.toThrow("401");
  });
});

describe("insight feedback client", () => {
  it("posts the action and reason to the proposal endpoint", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendInsightFeedback("action-activation", "mapping_wrong", {
      reason: "Activation maps to signup.",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/action-proposals/action-activation/feedback",
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0][1]?.body)),
    ).toEqual({
      action: "mapping_wrong",
      reason: "Activation maps to signup.",
      experimentId: "",
    });
  });

  it("marks the two wrong-diagnosis actions as needing a reason", () => {
    expect(FEEDBACK_REASON_REQUIRED).toEqual(["not_relevant", "mapping_wrong"]);
  });
});
