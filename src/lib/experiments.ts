import type {
  DashboardSnapshot,
  Experiment,
  Insight,
  StageId,
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

export function experimentIdForInsight(insightId: string) {
  return `draft-${insightId}`;
}

export function createExperimentDraft(
  snapshot: DashboardSnapshot,
  insight: Insight,
): Experiment {
  const proposal = snapshot.actionProposals.find(
    (item) => item.insightId === insight.id,
  );
  const evidence = snapshot.evidence.find((item) =>
    insight.evidenceIds.includes(item.id),
  );
  const stage = snapshot.stages.find((item) => item.id === insight.stageId);
  const metrics = METRICS_BY_STAGE[insight.stageId];

  return {
    id: experimentIdForInsight(insight.id),
    title: proposal?.title ?? `Investigate ${insight.title.toLowerCase()}`,
    stageId: insight.stageId,
    hypothesis:
      proposal?.rationale ??
      "A focused change at the earliest supported bottleneck will improve the primary metric.",
    ...metrics,
    status: "draft",
    source: evidence?.source ?? stage?.source ?? "posthog",
  };
}
