import type {
  ActionPlan,
  DashboardSnapshot,
  Experiment,
  Insight,
  StageId,
  StructuredActionStep,
} from "@/lib/contracts";

const METRICS_BY_STAGE: Record<
  StageId,
  Pick<Experiment, "primaryMetric" | "guardrailMetric">
> = {
  discover: {
    primaryMetric: "App Store impressions",
    guardrailMetric: "Product page conversion",
  },
  store: {
    primaryMetric: "Product page conversion",
    guardrailMetric: "Download volume",
  },
  install: {
    primaryMetric: "Product page conversion",
    guardrailMetric: "Download volume",
  },
  activate: {
    primaryMetric: "First key action within 24h",
    guardrailMetric: "D7 retention",
  },
  paywall: {
    primaryMetric: "Paywall view rate",
    guardrailMetric: "Activation volume",
  },
  trial: {
    primaryMetric: "Trial start rate",
    guardrailMetric: "Trial-to-paid conversion",
  },
  paid: {
    primaryMetric: "Trial-to-paid conversion",
    guardrailMetric: "Refund rate",
  },
  renew: {
    primaryMetric: "Renewal rate",
    guardrailMetric: "Paid subscriber volume",
  },
};

export interface ExperimentGuardrail {
  key: string;
  label: string;
  failureThreshold?: number;
}

/**
 * The persisted shape returned by `/v1/experiments`. `Experiment` in
 * `contracts.ts` still describes the fields the growth-map snapshot has always
 * carried; these five are the ones migration 0010 added so a Lab draft can be
 * fully reconstructed from the database instead of from React state.
 */
export interface PersistedExperiment extends Experiment {
  insightId?: string;
  steps?: StructuredActionStep[];
  guardrails?: ExperimentGuardrail[];
  segment?: string;
  learnings?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function experimentIdForInsight(insightId: string) {
  return `draft-${insightId}`;
}

export function actionPlanFor(
  snapshot: DashboardSnapshot,
  insight: Insight,
): ActionPlan | undefined {
  const proposal = snapshot.actionProposals.find(
    (item) => item.insightId === insight.id,
  );
  if (proposal?.actionPlan) return proposal.actionPlan;
  return snapshot.actionPlans?.find(
    (plan) => plan.targetStageId === insight.stageId,
  );
}

/**
 * Builds the local draft shown before the API answers. Everything traces to a
 * deterministic record: the structured action plan when the diagnosis produced
 * one, otherwise the action proposal and the stage metric table. No rationale
 * is invented here.
 */
export function createExperimentDraft(
  snapshot: DashboardSnapshot,
  insight: Insight,
): PersistedExperiment {
  const proposal = snapshot.actionProposals.find(
    (item) => item.insightId === insight.id,
  );
  const evidence = snapshot.evidence.find((item) =>
    insight.evidenceIds.includes(item.id),
  );
  const stage = snapshot.stages.find((item) => item.id === insight.stageId);
  const metrics = METRICS_BY_STAGE[insight.stageId];
  const plan = actionPlanFor(snapshot, insight);

  return {
    id: experimentIdForInsight(insight.id),
    title: proposal?.title ?? `Investigate ${insight.title.toLowerCase()}`,
    stageId: insight.stageId,
    hypothesis:
      plan?.desiredOutcome ??
      proposal?.rationale ??
      "A focused change at the earliest supported bottleneck will improve the primary metric.",
    primaryMetric: plan?.primaryMetric?.label ?? metrics.primaryMetric,
    guardrailMetric:
      plan?.guardrails?.[0]?.label ?? metrics.guardrailMetric,
    status: "draft",
    source: evidence?.source ?? stage?.source ?? "posthog",
    insightId: insight.id,
    ...(proposal ? { actionProposalId: proposal.id } : {}),
    evidenceIds: plan?.evidenceIds?.length
      ? plan.evidenceIds
      : insight.evidenceIds,
    steps: plan?.steps ?? [],
    guardrails: plan?.guardrails ?? [],
    ...(plan?.segment ? { segment: plan.segment } : {}),
  };
}

/**
 * Payload for `POST /v1/experiments`. Only fields the API validates are sent;
 * `id` is assigned server-side so a draft never carries a client-invented key
 * into the database.
 */
export function experimentCreatePayload(
  appId: string,
  draft: PersistedExperiment,
) {
  return {
    appId,
    title: draft.title,
    stageId: draft.stageId,
    hypothesis: draft.hypothesis,
    primaryMetric: draft.primaryMetric,
    guardrailMetric: draft.guardrailMetric,
    status: draft.status,
    source: draft.source,
    insightId: draft.insightId ?? "",
    actionProposalId: draft.actionProposalId ?? "",
    evidenceIds: draft.evidenceIds ?? [],
    steps: draft.steps ?? [],
    guardrails: draft.guardrails ?? [],
    segment: draft.segment ?? "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Defensive read of an API row: an unrecognised row is dropped, not rendered. */
export function parsePersistedExperiment(
  value: unknown,
): PersistedExperiment | null {
  if (!isRecord(value)) return null;
  const { id, title, stageId, hypothesis, status, source } = value;
  if (
    typeof id !== "string" ||
    !id ||
    typeof title !== "string" ||
    typeof stageId !== "string" ||
    typeof hypothesis !== "string" ||
    typeof status !== "string" ||
    typeof source !== "string"
  ) {
    return null;
  }
  if (!["draft", "ready", "running", "completed"].includes(status)) return null;
  return {
    ...(value as unknown as PersistedExperiment),
    id,
    title,
    stageId: stageId as StageId,
    hypothesis,
    status: status as Experiment["status"],
    primaryMetric:
      typeof value.primaryMetric === "string" ? value.primaryMetric : "",
    guardrailMetric:
      typeof value.guardrailMetric === "string" ? value.guardrailMetric : "",
    source: source as Experiment["source"],
    steps: Array.isArray(value.steps)
      ? (value.steps as StructuredActionStep[])
      : [],
    guardrails: Array.isArray(value.guardrails)
      ? (value.guardrails as ExperimentGuardrail[])
      : [],
    evidenceIds: Array.isArray(value.evidenceIds)
      ? (value.evidenceIds as string[])
      : [],
  };
}

export function parseExperimentList(payload: unknown): PersistedExperiment[] {
  const rows = isRecord(payload) && Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];
  return rows
    .map(parsePersistedExperiment)
    .filter((item): item is PersistedExperiment => item !== null);
}

async function readJSON(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class ExperimentApiError extends Error {}

/** Thin client over the Next relay routes; every call is workspace-scoped. */
export const experimentApi = {
  async list(appId: string): Promise<PersistedExperiment[]> {
    const url = new URL("/api/experiments", window.location.origin);
    if (appId) url.searchParams.set("appId", appId);
    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) throw new ExperimentApiError(String(response.status));
    return parseExperimentList(await readJSON(response));
  },

  async create(
    appId: string,
    draft: PersistedExperiment,
  ): Promise<PersistedExperiment> {
    const response = await fetch("/api/experiments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(experimentCreatePayload(appId, draft)),
    });
    const payload = await readJSON(response);
    const parsed = isRecord(payload)
      ? parsePersistedExperiment(payload.data)
      : null;
    if (!response.ok || !parsed) {
      throw new ExperimentApiError(String(response.status));
    }
    return parsed;
  },

  async update(
    id: string,
    patch: Record<string, unknown>,
  ): Promise<PersistedExperiment> {
    const response = await fetch(`/api/experiments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const payload = await readJSON(response);
    const parsed = isRecord(payload)
      ? parsePersistedExperiment(payload.data)
      : null;
    if (!response.ok || !parsed) {
      throw new ExperimentApiError(String(response.status));
    }
    return parsed;
  },

  async remove(id: string): Promise<void> {
    const response = await fetch(`/api/experiments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok && response.status !== 204) {
      throw new ExperimentApiError(String(response.status));
    }
  },
};

export type InsightFeedbackAction =
  | "accept"
  | "dismiss"
  | "not_relevant"
  | "mapping_wrong"
  | "convert_to_experiment";

export const INSIGHT_FEEDBACK_LABELS: Record<InsightFeedbackAction, string> = {
  accept: "Accept recommendation",
  dismiss: "Dismiss",
  not_relevant: "Not relevant",
  mapping_wrong: "Mapping or data is wrong",
  convert_to_experiment: "Converted to experiment",
};

/** The two actions that assert the diagnosis is wrong must carry a reason. */
export const FEEDBACK_REASON_REQUIRED: InsightFeedbackAction[] = [
  "not_relevant",
  "mapping_wrong",
];

export async function sendInsightFeedback(
  proposalId: string,
  action: InsightFeedbackAction,
  options: { reason?: string; experimentId?: string } = {},
): Promise<void> {
  const response = await fetch(
    `/api/action-proposals/${encodeURIComponent(proposalId)}/feedback`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        reason: options.reason ?? "",
        experimentId: options.experimentId ?? "",
      }),
    },
  );
  if (!response.ok) throw new ExperimentApiError(String(response.status));
}
