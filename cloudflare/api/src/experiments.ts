/**
 * Persistent Lab experiments and insight feedback (plan tasks P0.29 / P0.30).
 *
 * Before this module the Lab was session-only: the shell kept drafts in React
 * state and `growth-map` always answered `experiments: []`, so a draft died on
 * reload. Everything here is deterministic storage — nothing in this file talks
 * to App Store Connect, PostHog, RevenueCat or Superwall, and no route may ever
 * mutate a third-party system on the founder's behalf.
 */
import { audit } from "./db";
import type { AuthContext } from "./types";

export const EXPERIMENT_STATUSES = [
  "draft",
  "ready",
  "running",
  "completed",
] as const;
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

export const STAGE_IDS = [
  "discover",
  "store",
  "install",
  "activate",
  "paywall",
  "trial",
  "paid",
  "renew",
] as const;
export type ExperimentStageId = (typeof STAGE_IDS)[number];

export const SOURCE_PROVIDERS = [
  "app-store-connect",
  "revenuecat",
  "posthog",
  "superwall",
  "appclimb-rank",
] as const;
export type ExperimentSource = (typeof SOURCE_PROVIDERS)[number];

/**
 * The five product actions from P0.30. `accept` and `convert_to_experiment`
 * both land on `action_proposals.status = 'accepted'`; the other three land on
 * `dismissed`. The distinct action and its reason are stored separately so the
 * accepted / dismissed / diagnosis-to-experiment rates stay computable.
 */
export const FEEDBACK_ACTIONS = [
  "accept",
  "dismiss",
  "not_relevant",
  "mapping_wrong",
  "convert_to_experiment",
] as const;
export type FeedbackAction = (typeof FEEDBACK_ACTIONS)[number];

const FEEDBACK_STATUS: Record<FeedbackAction, "accepted" | "dismissed"> = {
  accept: "accepted",
  convert_to_experiment: "accepted",
  dismiss: "dismissed",
  not_relevant: "dismissed",
  mapping_wrong: "dismissed",
};

/** A reason is only meaningful for the two "this diagnosis is wrong" actions. */
const REASON_REQUIRED: FeedbackAction[] = ["not_relevant", "mapping_wrong"];

const MAX_EXPERIMENTS_PER_APP = 100;
const MAX_STEPS = 20;
const MAX_GUARDRAILS = 8;

export interface ExperimentStep {
  order: number;
  title: string;
  instruction: string;
  effort: "small" | "medium" | "large";
}

export interface ExperimentGuardrail {
  key: string;
  label: string;
  failureThreshold?: number;
}

export interface PersistedExperiment {
  id: string;
  appId: string;
  title: string;
  stageId: ExperimentStageId;
  hypothesis: string;
  primaryMetric: string;
  guardrailMetric: string;
  status: ExperimentStatus;
  source: ExperimentSource;
  actionProposalId?: string;
  insightId?: string;
  evidenceIds: string[];
  steps: ExperimentStep[];
  guardrails: ExperimentGuardrail[];
  segment?: string;
  startedAt?: string;
  endedAt?: string;
  result?: string;
  learnings?: string;
  createdAt: string;
  updatedAt: string;
}

interface ExperimentRow {
  id: string;
  app_id: string;
  stage_id: string;
  title: string;
  hypothesis: string;
  primary_metric: string;
  guardrail_metric: string;
  status: string;
  provider: string;
  action_proposal_id: string | null;
  insight_id: string | null;
  evidence_ids: string | null;
  steps: string | null;
  guardrails: string | null;
  segment: string | null;
  started_at: string | null;
  ended_at: string | null;
  result: string | null;
  learnings: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = `id,app_id,stage_id,title,hypothesis,primary_metric,
   guardrail_metric,status,provider,action_proposal_id,insight_id,evidence_ids,
   steps,guardrails,segment,started_at,ended_at,result,learnings,
   created_at,updated_at`;

function fail(code: string): never {
  throw new Error(code);
}

function parseJSON<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max: number): string | undefined {
  const cleaned = text(value, max);
  return cleaned || undefined;
}

function stringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeSteps(value: unknown): ExperimentStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_STEPS)
    .map((raw, index) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const title = text(item.title, 160);
      const instruction = text(item.instruction, 800);
      if (!title && !instruction) return null;
      const effort =
        item.effort === "medium" || item.effort === "large"
          ? item.effort
          : "small";
      const order = Number(item.order);
      return {
        order: Number.isFinite(order) && order > 0 ? Math.trunc(order) : index + 1,
        title: title || instruction.slice(0, 160),
        instruction: instruction || title,
        effort,
      } satisfies ExperimentStep;
    })
    .filter((item): item is ExperimentStep => item !== null)
    .sort((left, right) => left.order - right.order);
}

export function normalizeGuardrails(value: unknown): ExperimentGuardrail[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_GUARDRAILS)
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const label = text(item.label, 160);
      const key = text(item.key, 120) || label.toLowerCase().replace(/\s+/gu, "_");
      if (!label && !key) return null;
      const threshold = Number(item.failureThreshold);
      return {
        key,
        label: label || key,
        ...(Number.isFinite(threshold) ? { failureThreshold: threshold } : {}),
      } satisfies ExperimentGuardrail;
    })
    .filter((item): item is ExperimentGuardrail => item !== null);
}

export interface ExperimentInput {
  title: string;
  stageId: ExperimentStageId;
  hypothesis: string;
  primaryMetric: string;
  guardrailMetric: string;
  status: ExperimentStatus;
  source: ExperimentSource;
  actionProposalId?: string;
  insightId?: string;
  evidenceIds: string[];
  steps: ExperimentStep[];
  guardrails: ExperimentGuardrail[];
  segment?: string;
  result?: string;
  learnings?: string;
}

/**
 * Validates a create payload. Every required field must be present: an
 * experiment with no hypothesis, no primary metric or no guardrail is not a
 * learning loop, so it is rejected rather than stored half-formed.
 */
export function normalizeExperimentInput(
  input: Record<string, unknown>,
): ExperimentInput {
  const title = text(input.title, 160);
  const hypothesis = text(input.hypothesis, 1200);
  const primaryMetric = text(input.primaryMetric, 160);
  const guardrailMetric = text(input.guardrailMetric, 160);
  const stageId = text(input.stageId, 20) as ExperimentStageId;
  const source = text(input.source ?? input.provider, 40) as ExperimentSource;
  const status = (text(input.status, 20) || "draft") as ExperimentStatus;

  if (!title || !hypothesis || !primaryMetric || !guardrailMetric) {
    fail("invalid_experiment");
  }
  if (!STAGE_IDS.includes(stageId)) fail("invalid_experiment_stage");
  if (!SOURCE_PROVIDERS.includes(source)) fail("invalid_experiment_source");
  if (!EXPERIMENT_STATUSES.includes(status)) fail("invalid_experiment_status");

  return {
    title,
    stageId,
    hypothesis,
    primaryMetric,
    guardrailMetric,
    status,
    source,
    actionProposalId: optionalText(input.actionProposalId, 64),
    insightId: optionalText(input.insightId, 64),
    evidenceIds: stringArray(input.evidenceIds, 20, 64),
    steps: normalizeSteps(input.steps),
    guardrails: normalizeGuardrails(input.guardrails),
    segment: optionalText(input.segment, 160),
    result: optionalText(input.result, 2000),
    learnings: optionalText(input.learnings, 2000),
  };
}

export function mapExperimentRow(row: ExperimentRow): PersistedExperiment {
  return {
    id: row.id,
    appId: row.app_id,
    title: row.title,
    stageId: row.stage_id as ExperimentStageId,
    hypothesis: row.hypothesis,
    primaryMetric: row.primary_metric,
    guardrailMetric: row.guardrail_metric,
    status: row.status as ExperimentStatus,
    source: row.provider as ExperimentSource,
    ...(row.action_proposal_id
      ? { actionProposalId: row.action_proposal_id }
      : {}),
    ...(row.insight_id ? { insightId: row.insight_id } : {}),
    evidenceIds: parseJSON<string[]>(row.evidence_ids, []),
    steps: parseJSON<ExperimentStep[]>(row.steps, []),
    guardrails: parseJSON<ExperimentGuardrail[]>(row.guardrails, []),
    ...(row.segment ? { segment: row.segment } : {}),
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.ended_at ? { endedAt: row.ended_at } : {}),
    ...(row.result ? { result: row.result } : {}),
    ...(row.learnings ? { learnings: row.learnings } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `started_at` and `ended_at` are derived from the status transition rather
 * than accepted from the client, so a Lab timeline can never claim a run began
 * before it was marked running.
 */
export function experimentTimestamps(
  previousStatus: ExperimentStatus | null,
  nextStatus: ExperimentStatus,
  current: { startedAt?: string | null; endedAt?: string | null },
  now: string,
): { startedAt: string | null; endedAt: string | null } {
  let startedAt = current.startedAt ?? null;
  let endedAt = current.endedAt ?? null;
  if (nextStatus === "running" && !startedAt) startedAt = now;
  if (nextStatus === "completed") {
    if (!startedAt) startedAt = now;
    if (!endedAt) endedAt = now;
  }
  if (
    previousStatus === "completed" &&
    (nextStatus === "running" || nextStatus === "ready" || nextStatus === "draft")
  ) {
    endedAt = null;
  }
  if (nextStatus === "draft" || nextStatus === "ready") {
    if (previousStatus === null || previousStatus === "draft") startedAt = null;
  }
  return { startedAt, endedAt };
}

async function resolveAppId(
  db: D1Database,
  workspaceId: string,
  requestedAppId: string,
): Promise<string> {
  if (requestedAppId) {
    const owned = await db
      .prepare(`SELECT id FROM apps WHERE workspace_id=? AND id=? LIMIT 1`)
      .bind(workspaceId, requestedAppId)
      .first<{ id: string }>();
    if (!owned) fail("app_not_found");
    return owned.id;
  }
  const fallback = await db
    .prepare(
      `SELECT id FROM apps WHERE workspace_id=? ORDER BY created_at LIMIT 1`,
    )
    .bind(workspaceId)
    .first<{ id: string }>();
  if (!fallback) fail("app_not_found");
  return fallback.id;
}

export async function listExperiments(
  db: D1Database,
  auth: AuthContext,
  requestedAppId: string,
): Promise<PersistedExperiment[]> {
  const appId = await resolveAppId(db, auth.workspaceId, requestedAppId);
  const result = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS}
         FROM experiments
        WHERE workspace_id=? AND app_id=?
        ORDER BY created_at DESC
        LIMIT ${MAX_EXPERIMENTS_PER_APP}`,
    )
    .bind(auth.workspaceId, appId)
    .all<ExperimentRow>();
  return result.results.map(mapExperimentRow);
}

export async function createExperiment(
  db: D1Database,
  auth: AuthContext,
  requestedAppId: string,
  input: Record<string, unknown>,
): Promise<PersistedExperiment> {
  const appId = await resolveAppId(db, auth.workspaceId, requestedAppId);
  const values = normalizeExperimentInput(input);

  const count = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM experiments WHERE workspace_id=? AND app_id=?`,
    )
    .bind(auth.workspaceId, appId)
    .first<{ total: number }>();
  if (Number(count?.total ?? 0) >= MAX_EXPERIMENTS_PER_APP) {
    fail("experiment_limit_reached");
  }

  // One experiment per insight keeps repeated "create draft" clicks idempotent.
  if (values.insightId) {
    const existing = await db
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM experiments
          WHERE workspace_id=? AND app_id=? AND insight_id=?
          ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(auth.workspaceId, appId, values.insightId)
      .first<ExperimentRow>();
    if (existing) return mapExperimentRow(existing);
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const timestamps = experimentTimestamps(null, values.status, {}, now);

  await db
    .prepare(
      `INSERT INTO experiments(
         id,workspace_id,app_id,stage_id,title,hypothesis,primary_metric,
         guardrail_metric,status,provider,started_at,ended_at,result,
         created_at,updated_at,action_proposal_id,evidence_ids,insight_id,
         steps,guardrails,segment,learnings
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      id,
      auth.workspaceId,
      appId,
      values.stageId,
      values.title,
      values.hypothesis,
      values.primaryMetric,
      values.guardrailMetric,
      values.status,
      values.source,
      timestamps.startedAt,
      timestamps.endedAt,
      values.result ?? null,
      now,
      now,
      values.actionProposalId ?? null,
      JSON.stringify(values.evidenceIds),
      values.insightId ?? null,
      JSON.stringify(values.steps),
      JSON.stringify(values.guardrails),
      values.segment ?? null,
      values.learnings ?? null,
    )
    .run();

  await audit(
    db,
    auth.workspaceId,
    auth.userId,
    "experiment_created",
    "experiment",
    id,
    {
      appId,
      stageId: values.stageId,
      insightId: values.insightId ?? null,
      actionProposalId: values.actionProposalId ?? null,
      evidenceIds: values.evidenceIds,
      externalMutation: false,
    },
  );

  const created = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM experiments WHERE id=? LIMIT 1`)
    .bind(id)
    .first<ExperimentRow>();
  if (!created) fail("experiment_not_found");
  return mapExperimentRow(created);
}

const UPDATABLE_TEXT_FIELDS: Array<[string, string, number]> = [
  ["title", "title", 160],
  ["hypothesis", "hypothesis", 1200],
  ["primaryMetric", "primary_metric", 160],
  ["guardrailMetric", "guardrail_metric", 160],
  ["segment", "segment", 160],
  ["result", "result", 2000],
  ["learnings", "learnings", 2000],
];

export async function updateExperiment(
  db: D1Database,
  auth: AuthContext,
  experimentId: string,
  input: Record<string, unknown>,
): Promise<PersistedExperiment> {
  const current = await db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM experiments
        WHERE workspace_id=? AND id=? LIMIT 1`,
    )
    .bind(auth.workspaceId, experimentId)
    .first<ExperimentRow>();
  if (!current) fail("experiment_not_found");

  const assignments: string[] = [];
  const bindings: (string | null)[] = [];

  for (const [field, column, max] of UPDATABLE_TEXT_FIELDS) {
    if (!(field in input)) continue;
    const value = text(input[field], max);
    // title/hypothesis/metrics are NOT NULL and must not be blanked out.
    const nullable = ["segment", "result", "learnings"].includes(field);
    if (!value && !nullable) fail("invalid_experiment");
    assignments.push(`${column}=?`);
    bindings.push(value || (nullable ? null : value));
  }

  if ("stageId" in input) {
    const stageId = text(input.stageId, 20) as ExperimentStageId;
    if (!STAGE_IDS.includes(stageId)) fail("invalid_experiment_stage");
    assignments.push("stage_id=?");
    bindings.push(stageId);
  }
  if ("source" in input) {
    const source = text(input.source, 40) as ExperimentSource;
    if (!SOURCE_PROVIDERS.includes(source)) fail("invalid_experiment_source");
    assignments.push("provider=?");
    bindings.push(source);
  }
  if ("steps" in input) {
    assignments.push("steps=?");
    bindings.push(JSON.stringify(normalizeSteps(input.steps)));
  }
  if ("guardrails" in input) {
    assignments.push("guardrails=?");
    bindings.push(JSON.stringify(normalizeGuardrails(input.guardrails)));
  }
  if ("evidenceIds" in input) {
    assignments.push("evidence_ids=?");
    bindings.push(JSON.stringify(stringArray(input.evidenceIds, 20, 64)));
  }

  const now = new Date().toISOString();
  let nextStatus = current.status as ExperimentStatus;
  if ("status" in input) {
    const status = text(input.status, 20) as ExperimentStatus;
    if (!EXPERIMENT_STATUSES.includes(status)) fail("invalid_experiment_status");
    nextStatus = status;
    assignments.push("status=?");
    bindings.push(status);
  }

  const timestamps = experimentTimestamps(
    current.status as ExperimentStatus,
    nextStatus,
    { startedAt: current.started_at, endedAt: current.ended_at },
    now,
  );
  if (timestamps.startedAt !== current.started_at) {
    assignments.push("started_at=?");
    bindings.push(timestamps.startedAt);
  }
  if (timestamps.endedAt !== current.ended_at) {
    assignments.push("ended_at=?");
    bindings.push(timestamps.endedAt);
  }

  if (!assignments.length) return mapExperimentRow(current);

  assignments.push("updated_at=?");
  bindings.push(now);

  await db
    .prepare(
      `UPDATE experiments SET ${assignments.join(",")}
        WHERE workspace_id=? AND id=?`,
    )
    .bind(...bindings, auth.workspaceId, experimentId)
    .run();

  if (nextStatus !== current.status) {
    await audit(
      db,
      auth.workspaceId,
      auth.userId,
      "experiment_status_changed",
      "experiment",
      experimentId,
      { from: current.status, to: nextStatus, externalMutation: false },
    );
  }

  const updated = await db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM experiments WHERE id=? LIMIT 1`)
    .bind(experimentId)
    .first<ExperimentRow>();
  if (!updated) fail("experiment_not_found");
  return mapExperimentRow(updated);
}

export async function deleteExperiment(
  db: D1Database,
  auth: AuthContext,
  experimentId: string,
): Promise<void> {
  const current = await db
    .prepare(
      `SELECT id,app_id FROM experiments WHERE workspace_id=? AND id=? LIMIT 1`,
    )
    .bind(auth.workspaceId, experimentId)
    .first<{ id: string; app_id: string }>();
  if (!current) fail("experiment_not_found");

  await db
    .prepare(`DELETE FROM experiments WHERE workspace_id=? AND id=?`)
    .bind(auth.workspaceId, experimentId)
    .run();

  await audit(
    db,
    auth.workspaceId,
    auth.userId,
    "experiment_deleted",
    "experiment",
    experimentId,
    { appId: current.app_id },
  );
}

export interface ProposalFeedbackResult {
  proposalId: string;
  insightId: string | null;
  action: FeedbackAction;
  status: "accepted" | "dismissed";
  reason: string | null;
  experimentId: string | null;
  recordedAt: string;
}

export function normalizeFeedbackInput(input: Record<string, unknown>): {
  action: FeedbackAction;
  reason: string | null;
  experimentId: string | null;
} {
  const action = text(input.action, 40) as FeedbackAction;
  if (!FEEDBACK_ACTIONS.includes(action)) fail("invalid_feedback_action");
  const reason = optionalText(input.reason, 1000) ?? null;
  if (REASON_REQUIRED.includes(action) && !reason) {
    fail("feedback_reason_required");
  }
  return {
    action,
    reason,
    experimentId: optionalText(input.experimentId, 64) ?? null,
  };
}

/**
 * Records one accept / dismiss / not-relevant / mapping-wrong /
 * converted-to-experiment decision. The audit event is the source of truth for
 * the insight accepted, insight dismissed and diagnosis-to-experiment rates.
 */
export async function recordProposalFeedback(
  db: D1Database,
  auth: AuthContext,
  proposalId: string,
  input: Record<string, unknown>,
): Promise<ProposalFeedbackResult> {
  const { action, reason, experimentId } = normalizeFeedbackInput(input);

  const proposal = await db
    .prepare(
      `SELECT id,app_id,insight_id,status FROM action_proposals
        WHERE workspace_id=? AND id=? LIMIT 1`,
    )
    .bind(auth.workspaceId, proposalId)
    .first<{
      id: string;
      app_id: string;
      insight_id: string | null;
      status: string;
    }>();
  if (!proposal) fail("action_proposal_not_found");

  if (experimentId) {
    const owned = await db
      .prepare(
        `SELECT id FROM experiments WHERE workspace_id=? AND id=? LIMIT 1`,
      )
      .bind(auth.workspaceId, experimentId)
      .first<{ id: string }>();
    if (!owned) fail("experiment_not_found");
  }

  const status = FEEDBACK_STATUS[action];
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `UPDATE action_proposals
            SET status=?,feedback_action=?,feedback_reason=?,feedback_at=?,
                converted_experiment_id=COALESCE(?,converted_experiment_id),
                updated_at=?
          WHERE workspace_id=? AND id=?`,
      )
      .bind(
        status,
        action,
        reason,
        now,
        experimentId,
        now,
        auth.workspaceId,
        proposalId,
      ),
    db
      .prepare(
        `INSERT INTO action_proposal_feedback(
           id,workspace_id,app_id,proposal_id,insight_id,action,reason,
           experiment_id,actor_user_id,created_at
         ) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        auth.workspaceId,
        proposal.app_id,
        proposalId,
        proposal.insight_id,
        action,
        reason,
        experimentId,
        auth.userId,
        now,
      ),
  ]);

  await audit(
    db,
    auth.workspaceId,
    auth.userId,
    status === "accepted" ? "recommendation_accepted" : "recommendation_dismissed",
    "action_proposal",
    proposalId,
    {
      appId: proposal.app_id,
      insightId: proposal.insight_id,
      feedbackAction: action,
      reason,
      experimentId,
      previousStatus: proposal.status,
      externalMutation: false,
    },
  );

  return {
    proposalId,
    insightId: proposal.insight_id,
    action,
    status,
    reason,
    experimentId,
    recordedAt: now,
  };
}
