import type {
  ActionPlan,
  DashboardSnapshot,
  Evidence,
  Insight,
} from "@/lib/contracts";

/**
 * The one insight the Decision Home is allowed to promote.
 *
 * Order: the diagnosis run's own `primaryInsightId`, then the rank-1 insight,
 * then nothing. It never silently falls back to `insights[0]` when the backend
 * has explicitly named a different primary — that would show one problem while
 * the evidence and action plan describe another.
 */
export function selectPrimaryInsight(
  snapshot: DashboardSnapshot,
): Insight | undefined {
  const named = snapshot.diagnosis?.primaryInsightId;
  if (named) {
    const match = snapshot.insights.find((insight) => insight.id === named);
    if (match) return match;
  }

  const ranked = [...snapshot.insights].sort((a, b) => a.rank - b.rank);
  return ranked[0];
}

/** Evidence rows backing a specific insight, in snapshot order. */
export function evidenceForInsight(
  snapshot: DashboardSnapshot,
  insight?: Insight,
): Evidence[] {
  if (!insight) return [];
  return snapshot.evidence.filter((item) =>
    insight.evidenceIds.includes(item.id),
  );
}

/** The structured action plan tied to an insight, if one was generated. */
export function planForInsight(
  snapshot: DashboardSnapshot,
  insight?: Insight,
): ActionPlan | undefined {
  if (!insight) return undefined;

  const proposal = snapshot.actionProposals.find(
    (item) => item.insightId === insight.id,
  );
  if (proposal?.actionPlan) return proposal.actionPlan;

  return snapshot.actionPlans?.find(
    (plan) => plan.targetStageId === insight.stageId,
  );
}
