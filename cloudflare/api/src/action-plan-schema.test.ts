import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildActionPlan } from "./diagnosis/playbooks";
import type { ActionPlan, SourceProvider, StageId } from "./diagnosis/types";

/**
 * Action-plan schema completeness (plan section 15.1).
 *
 * A structured plan is the only thing standing between "here is the evidence"
 * and a generic "improve onboarding" recommendation, so every stage playbook
 * must carry steps, a primary metric, a guardrail, valid evidence IDs and no
 * instruction that AppClimb itself will change an external system.
 */

const STAGES: StageId[] = [
  "discover",
  "store",
  "install",
  "activate",
  "paywall",
  "trial",
  "paid",
  "renew",
];

const EVIDENCE_IDS = ["ev-1", "ev-2"];

/** Stages where a guardrail is mandatory: every one of them changes something
 *  a user sees, so an unguarded win is not a trustworthy win. */
const GUARDRAIL_REQUIRED: StageId[] = STAGES;

function planFor(stageId: StageId): ActionPlan {
  return buildActionPlan({
    stageId,
    stageLabel: stageId,
    sourceProvider: "posthog" as SourceProvider,
    observedRate: 0.21,
    benchmarkRate: 0.35,
    evidenceIds: EVIDENCE_IDS,
  });
}

describe.each(STAGES)("action plan for the %s stage", (stageId) => {
  const plan = planFor(stageId);

  it("states the problem, the outcome and why this action", () => {
    expect(plan.problem.trim().length).toBeGreaterThan(10);
    expect(plan.desiredOutcome.trim().length).toBeGreaterThan(10);
    expect(plan.whyThisAction.trim().length).toBeGreaterThan(10);
  });

  it("has non-empty, ordered, instructive steps", () => {
    expect(plan.steps.length).toBeGreaterThan(0);
    const orders = plan.steps.map((step) => step.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const step of plan.steps) {
      expect(step.title.trim()).not.toBe("");
      expect(step.instruction.trim().length).toBeGreaterThan(10);
      expect(["small", "medium", "large"]).toContain(step.effort);
    }
  });

  it("names a primary metric with a direction", () => {
    expect(plan.primaryMetric.key.trim()).not.toBe("");
    expect(plan.primaryMetric.label.trim()).not.toBe("");
    expect(["up", "down"]).toContain(plan.primaryMetric.targetDirection);
  });

  it("declares a guardrail where one is required", () => {
    if (!GUARDRAIL_REQUIRED.includes(stageId)) return;
    expect(plan.guardrails.length).toBeGreaterThan(0);
    for (const guardrail of plan.guardrails) {
      expect(guardrail.key.trim()).not.toBe("");
      expect(guardrail.label.trim()).not.toBe("");
    }
  });

  it("keeps the guardrail distinct from the primary metric", () => {
    expect(plan.guardrails.map((item) => item.key)).not.toContain(
      plan.primaryMetric.key,
    );
  });

  it("says when to stop and how the result is instrumented", () => {
    expect(plan.stopCondition.trim().length).toBeGreaterThan(10);
    expect(plan.instrumentation.length).toBeGreaterThan(0);
  });

  it("carries only evidence IDs it was given", () => {
    expect(plan.evidenceIds).toEqual(EVIDENCE_IDS);
    for (const id of plan.evidenceIds ?? []) {
      expect(EVIDENCE_IDS).toContain(id);
    }
  });

  it("never claims AppClimb will make the external change", () => {
    const prose = [
      plan.problem,
      plan.desiredOutcome,
      plan.whyThisAction,
      plan.stopCondition,
      plan.rollbackCondition ?? "",
      ...plan.steps.map((step) => `${step.title} ${step.instruction}`),
    ]
      .join(" ")
      .toLowerCase();
    expect(prose).not.toMatch(
      /appclimb (will|can) (publish|submit|change|update|edit|launch)/u,
    );
  });
});

describe("stage playbook mapping", () => {
  it("returns a distinct primary metric per stage family", () => {
    const byStage = Object.fromEntries(
      STAGES.map((stageId) => [stageId, planFor(stageId).primaryMetric.key]),
    );
    expect(byStage).toEqual({
      discover: "impressions",
      store: "product_page_view_rate",
      install: "install_conversion_rate",
      activate: "activation_rate",
      paywall: "paywall_views",
      trial: "trial_conversion_rate",
      paid: "paid_conversion_rate",
      renew: "renewals",
    });
  });

  it("is deterministic for identical input", () => {
    expect(JSON.stringify(planFor("activate"))).toBe(
      JSON.stringify(planFor("activate")),
    );
  });

  it("reflects the observed and benchmark rates it was given", () => {
    const plan = buildActionPlan({
      stageId: "store",
      stageLabel: "Store",
      sourceProvider: "app-store-connect",
      observedRate: 0.21,
      benchmarkRate: 0.35,
      evidenceIds: EVIDENCE_IDS,
    });
    expect(plan.problem).toContain("21.0%");
    expect(plan.problem).toContain("35%");
  });

  it("never invents a rate when none was observed", () => {
    const plan = buildActionPlan({
      stageId: "store",
      stageLabel: "Store",
      sourceProvider: "app-store-connect",
      observedRate: null,
      evidenceIds: EVIDENCE_IDS,
    });
    expect(plan.problem).toContain("low");
    expect(plan.problem).not.toMatch(/\d+\.\d%/u);
  });
});

describe("external mutation guard", () => {
  it("persists every action proposal with external_mutation_allowed = 0", () => {
    const persistSource = readFileSync(
      fileURLToPath(new URL("./diagnosis/persist.ts", import.meta.url)),
      "utf8",
    );
    expect(persistSource).toMatch(
      /external_mutation_allowed,[\s\S]*?VALUES\(\?,\?,\?,\?,\?,\?,\?,\?,0,/u,
    );
  });

  it("keeps the CHECK constraint that pins the column to 0", () => {
    const foundation = readFileSync(
      fileURLToPath(
        new URL("../migrations/0001_foundation.sql", import.meta.url),
      ),
      "utf8",
    );
    expect(foundation).toContain(
      "CHECK (external_mutation_allowed = 0)",
    );
  });
});
