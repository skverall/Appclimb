import { beforeEach, describe, expect, it } from "vitest";

import {
  createExperiment,
  deleteExperiment,
  experimentTimestamps,
  listExperiments,
  normalizeExperimentInput,
  normalizeFeedbackInput,
  normalizeGuardrails,
  normalizeSteps,
  recordProposalFeedback,
  updateExperiment,
} from "./experiments";
import {
  fakeDatabase,
  type FakeD1Database,
} from "../test-helpers/fake-d1";
import type { AuthContext } from "./types";

const auth: AuthContext = {
  userId: "user-1",
  workspaceId: "ws-1",
  role: "owner",
};

let db: FakeD1Database;

function asD1(database: FakeD1Database) {
  return database as unknown as D1Database;
}

const validInput = {
  title: "Shorter onboarding",
  stageId: "activate",
  hypothesis: "Removing one setup step raises first key action within 24h.",
  primaryMetric: "First key action within 24h",
  guardrailMetric: "D7 retention",
  source: "posthog",
  insightId: "insight-activation",
  actionProposalId: "action-activation",
  evidenceIds: ["ev-activation"],
  steps: [
    {
      order: 1,
      title: "Remove workspace configuration gate",
      instruction: "Let the first key action happen before configuration.",
      effort: "medium",
    },
  ],
  guardrails: [{ key: "d7_retention", label: "D7 retention" }],
  segment: "New installs, US storefront",
};

beforeEach(() => {
  db = fakeDatabase();
  db.rows("apps").push({
    id: "app-1",
    workspace_id: "ws-1",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  db.rows("apps").push({
    id: "app-other",
    workspace_id: "ws-2",
    created_at: "2026-01-02T00:00:00.000Z",
  });
});

describe("normalizeExperimentInput", () => {
  it("accepts a complete draft and keeps every required field", () => {
    const values = normalizeExperimentInput({ ...validInput });
    expect(values.title).toBe("Shorter onboarding");
    expect(values.stageId).toBe("activate");
    expect(values.status).toBe("draft");
    expect(values.evidenceIds).toEqual(["ev-activation"]);
    expect(values.steps).toHaveLength(1);
    expect(values.guardrails).toEqual([
      { key: "d7_retention", label: "D7 retention" },
    ]);
    expect(values.segment).toBe("New installs, US storefront");
  });

  it.each([
    ["title", { title: "  " }],
    ["hypothesis", { hypothesis: "" }],
    ["primaryMetric", { primaryMetric: "" }],
    ["guardrailMetric", { guardrailMetric: "" }],
  ])("rejects a draft with no %s", (_field, override) => {
    expect(() =>
      normalizeExperimentInput({ ...validInput, ...override }),
    ).toThrow(/invalid_experiment/u);
  });

  it("rejects an unknown stage, provider or status", () => {
    expect(() =>
      normalizeExperimentInput({ ...validInput, stageId: "web_visit" }),
    ).toThrow(/invalid_experiment_stage/u);
    expect(() =>
      normalizeExperimentInput({ ...validInput, source: "mixpanel" }),
    ).toThrow(/invalid_experiment_source/u);
    expect(() =>
      normalizeExperimentInput({ ...validInput, status: "launched" }),
    ).toThrow(/invalid_experiment_status/u);
  });

  it("bounds free text so an oversized payload cannot reach the column", () => {
    const values = normalizeExperimentInput({
      ...validInput,
      title: "t".repeat(400),
      hypothesis: "h".repeat(4000),
    });
    expect(values.title).toHaveLength(160);
    expect(values.hypothesis).toHaveLength(1200);
  });
});

describe("normalizeSteps and normalizeGuardrails", () => {
  it("renumbers steps in order and drops empty entries", () => {
    const steps = normalizeSteps([
      { order: 2, title: "Second", instruction: "b", effort: "large" },
      { title: "", instruction: "" },
      { order: 1, title: "First", instruction: "a", effort: "nonsense" },
    ]);
    expect(steps.map((step) => step.title)).toEqual(["First", "Second"]);
    expect(steps[0].effort).toBe("small");
    expect(steps[1].effort).toBe("large");
  });

  it("derives a guardrail key from the label when one is missing", () => {
    expect(normalizeGuardrails([{ label: "Refund rate" }])).toEqual([
      { key: "refund_rate", label: "Refund rate" },
    ]);
  });

  it("returns an empty list for non-array input", () => {
    expect(normalizeSteps("steps")).toEqual([]);
    expect(normalizeGuardrails(null)).toEqual([]);
  });
});

describe("experimentTimestamps", () => {
  const now = "2026-07-27T10:00:00.000Z";

  it("stamps started_at only when the run actually starts", () => {
    expect(experimentTimestamps(null, "draft", {}, now)).toEqual({
      startedAt: null,
      endedAt: null,
    });
    expect(experimentTimestamps("ready", "running", {}, now)).toEqual({
      startedAt: now,
      endedAt: null,
    });
  });

  it("stamps ended_at on completion and keeps the original start", () => {
    const started = "2026-07-20T09:00:00.000Z";
    expect(
      experimentTimestamps("running", "completed", { startedAt: started }, now),
    ).toEqual({ startedAt: started, endedAt: now });
  });

  it("clears ended_at when a completed experiment is reopened", () => {
    expect(
      experimentTimestamps(
        "completed",
        "running",
        { startedAt: "2026-07-20T09:00:00.000Z", endedAt: now },
        now,
      ).endedAt,
    ).toBeNull();
  });
});

describe("experiment persistence", () => {
  it("stores a draft and reads it back on a later request", async () => {
    const created = await createExperiment(asD1(db), auth, "app-1", validInput);
    expect(created.id).toBeTruthy();
    expect(created.status).toBe("draft");

    // A second, independent call is the API-level equivalent of a reload:
    // nothing is cached in module state, the row comes back from the database.
    const reloaded = await listExperiments(asD1(db), auth, "app-1");
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]).toMatchObject({
      id: created.id,
      title: "Shorter onboarding",
      insightId: "insight-activation",
      actionProposalId: "action-activation",
      evidenceIds: ["ev-activation"],
      segment: "New installs, US storefront",
    });
    expect(reloaded[0].steps).toHaveLength(1);
    expect(reloaded[0].guardrails).toHaveLength(1);
  });

  it("writes an experiment_created audit event", async () => {
    await createExperiment(asD1(db), auth, "app-1", validInput);
    const events = db
      .rows("audit_events")
      .filter((row) => row.action === "experiment_created");
    expect(events).toHaveLength(1);
    expect(JSON.parse(String(events[0].metadata))).toMatchObject({
      insightId: "insight-activation",
      externalMutation: false,
    });
  });

  it("does not create a second experiment for the same insight", async () => {
    const first = await createExperiment(asD1(db), auth, "app-1", validInput);
    const second = await createExperiment(asD1(db), auth, "app-1", validInput);
    expect(second.id).toBe(first.id);
    expect(await listExperiments(asD1(db), auth, "app-1")).toHaveLength(1);
  });

  it("refuses an app the workspace does not own", async () => {
    await expect(
      createExperiment(asD1(db), auth, "app-other", validInput),
    ).rejects.toThrow(/app_not_found/u);
  });

  it("records result and learnings and derives the run timestamps", async () => {
    const created = await createExperiment(asD1(db), auth, "app-1", validInput);

    const running = await updateExperiment(asD1(db), auth, created.id, {
      status: "running",
    });
    expect(running.startedAt).toBeTruthy();
    expect(running.endedAt).toBeUndefined();

    const completed = await updateExperiment(asD1(db), auth, created.id, {
      status: "completed",
      result: "Activation moved from 34% to 41%.",
      learnings: "The configuration gate was the blocker, not the copy.",
    });
    expect(completed.endedAt).toBeTruthy();
    expect(completed.result).toBe("Activation moved from 34% to 41%.");
    expect(completed.learnings).toBe(
      "The configuration gate was the blocker, not the copy.",
    );

    const reloaded = await listExperiments(asD1(db), auth, "app-1");
    expect(reloaded[0].learnings).toBe(
      "The configuration gate was the blocker, not the copy.",
    );
  });

  it("rejects blanking a required field through PATCH", async () => {
    const created = await createExperiment(asD1(db), auth, "app-1", validInput);
    await expect(
      updateExperiment(asD1(db), auth, created.id, { title: "   " }),
    ).rejects.toThrow(/invalid_experiment/u);
  });

  it("deletes an experiment and stops returning it", async () => {
    const created = await createExperiment(asD1(db), auth, "app-1", validInput);
    await deleteExperiment(asD1(db), auth, created.id);
    expect(await listExperiments(asD1(db), auth, "app-1")).toEqual([]);
    await expect(
      deleteExperiment(asD1(db), auth, created.id),
    ).rejects.toThrow(/experiment_not_found/u);
  });
});

describe("insight feedback", () => {
  beforeEach(() => {
    db.rows("action_proposals").push({
      id: "action-activation",
      workspace_id: "ws-1",
      app_id: "app-1",
      insight_id: "insight-activation",
      status: "proposed",
    });
  });

  it("requires a known action", () => {
    expect(() => normalizeFeedbackInput({ action: "ignore" })).toThrow(
      /invalid_feedback_action/u,
    );
  });

  it("requires a reason for not-relevant and mapping-is-wrong", () => {
    expect(() => normalizeFeedbackInput({ action: "not_relevant" })).toThrow(
      /feedback_reason_required/u,
    );
    expect(() => normalizeFeedbackInput({ action: "mapping_wrong" })).toThrow(
      /feedback_reason_required/u,
    );
    expect(normalizeFeedbackInput({ action: "accept" }).reason).toBeNull();
  });

  it("moves a proposal to accepted and writes the audit event", async () => {
    const result = await recordProposalFeedback(
      asD1(db),
      auth,
      "action-activation",
      { action: "accept" },
    );
    expect(result.status).toBe("accepted");
    expect(db.rows("action_proposals")[0].status).toBe("accepted");
    expect(db.rows("action_proposal_feedback")).toHaveLength(1);
    expect(
      db.rows("audit_events").some(
        (row) => row.action === "recommendation_accepted",
      ),
    ).toBe(true);
  });

  it("stores the reason for a mapping complaint and dismisses the proposal", async () => {
    await recordProposalFeedback(asD1(db), auth, "action-activation", {
      action: "mapping_wrong",
      reason: "Activation maps to the signup event, not first key action.",
    });
    const proposal = db.rows("action_proposals")[0];
    expect(proposal.status).toBe("dismissed");
    expect(proposal.feedback_action).toBe("mapping_wrong");
    expect(proposal.feedback_reason).toBe(
      "Activation maps to the signup event, not first key action.",
    );
    expect(
      db.rows("audit_events").some(
        (row) => row.action === "recommendation_dismissed",
      ),
    ).toBe(true);
  });

  it("links the experiment when a proposal is converted", async () => {
    const experiment = await createExperiment(
      asD1(db),
      auth,
      "app-1",
      validInput,
    );
    const result = await recordProposalFeedback(
      asD1(db),
      auth,
      "action-activation",
      { action: "convert_to_experiment", experimentId: experiment.id },
    );
    expect(result.status).toBe("accepted");
    expect(db.rows("action_proposals")[0].converted_experiment_id).toBe(
      experiment.id,
    );
    expect(db.rows("action_proposal_feedback")[0]).toMatchObject({
      action: "convert_to_experiment",
      insight_id: "insight-activation",
      experiment_id: experiment.id,
    });
  });

  it("refuses feedback for a proposal in another workspace", async () => {
    await expect(
      recordProposalFeedback(asD1(db), { ...auth, workspaceId: "ws-2" },
        "action-activation", { action: "accept" }),
    ).rejects.toThrow(/action_proposal_not_found/u);
  });
});
