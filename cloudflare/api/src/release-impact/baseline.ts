import type { GrowthContractThresholds } from "./config";
import type { BaselineMethod, CohortCounts } from "./types";

export interface BaselineSelection {
  method: BaselineMethod;
  baseline: CohortCounts | null;
  pooledFrom: CohortCounts[];
  limitations: string[];
}

function mappingCompatible(
  candidate: CohortCounts,
  current: CohortCounts,
): boolean {
  return (
    candidate.sessionEvent === current.sessionEvent &&
    candidate.activationEvent === current.activationEvent &&
    candidate.versionProperty === current.versionProperty &&
    candidate.mappingConfirmed &&
    current.mappingConfirmed
  );
}

function poolCohorts(cohorts: CohortCounts[]): CohortCounts | null {
  if (!cohorts.length) return null;
  const newUsers = cohorts.reduce((sum, c) => sum + Math.max(0, c.newUsers), 0);
  const activatedUsers = cohorts.reduce(
    (sum, c) => sum + Math.max(0, Math.min(c.newUsers, c.activatedUsers)),
    0,
  );
  const first = cohorts[0];
  return {
    ...first,
    version: cohorts.map((c) => c.version).join("+"),
    buildNumber: "pooled",
    newUsers,
    activatedUsers,
    activationRate: newUsers > 0 ? activatedUsers / newUsers : null,
    evidenceIds: cohorts.flatMap((c) => c.evidenceIds),
  };
}

/**
 * Baseline selection order:
 * 1. Immediate previous release with compatible mapping + enough sample
 * 2. Pooled previous up to three compatible releases until min sample
 * 3. Trailing historical cohort (already expressed as candidates)
 * 4. None
 */
export function selectBaseline(
  current: CohortCounts | null,
  candidates: CohortCounts[],
  contract: GrowthContractThresholds,
): BaselineSelection {
  const limitations: string[] = [];
  if (!current) {
    return {
      method: "none",
      baseline: null,
      pooledFrom: [],
      limitations: ["Current release cohort is missing."],
    };
  }

  const compatible = candidates.filter((c) => mappingCompatible(c, current));
  if (!compatible.length) {
    limitations.push("No compatible baseline cohort with the same mapping.");
    return { method: "none", baseline: null, pooledFrom: [], limitations };
  }

  const min = contract.minimumNewUsers;
  const previous = compatible[0];
  if (previous.newUsers >= min) {
    return {
      method: "previous_release",
      baseline: previous,
      pooledFrom: [previous],
      limitations,
    };
  }

  const poolSource = compatible.slice(0, 3);
  let accumulated: CohortCounts[] = [];
  for (const cohort of poolSource) {
    accumulated = [...accumulated, cohort];
    const pooled = poolCohorts(accumulated);
    if (pooled && pooled.newUsers >= min) {
      limitations.push(
        `Pooled baseline from ${accumulated.length} previous release(s) to reach minimum sample.`,
      );
      return {
        method: "pooled_previous_releases",
        baseline: pooled,
        pooledFrom: accumulated,
        limitations,
      };
    }
  }

  // Trailing historical: use largest remaining compatible even if below min,
  // but mark method so engine can still collect/inconclusive on sample.
  const trailing = poolCohorts(compatible.slice(0, 5));
  if (trailing && trailing.newUsers > 0) {
    limitations.push(
      trailing.newUsers < min
        ? "Trailing historical baseline is below the minimum sample."
        : "Used trailing historical baseline.",
    );
    return {
      method: "trailing_historical",
      baseline: trailing,
      pooledFrom: compatible.slice(0, 5),
      limitations,
    };
  }

  limitations.push("No usable baseline sample.");
  return { method: "none", baseline: null, pooledFrom: [], limitations };
}
