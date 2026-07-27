import { z } from "zod";

import type { DashboardSnapshot } from "@/lib/contracts";

const sourceProviderSchema = z.enum([
  "app-store-connect",
  "revenuecat",
  "posthog",
  "superwall",
  "appclimb-rank",
]);
const stageIdSchema = z.enum([
  "discover",
  "store",
  "install",
  "activate",
  "paywall",
  "trial",
  "paid",
  "renew",
]);
const confidenceSchema = z.enum(["high", "medium", "low"]);

const comparisonTypeSchema = z.enum([
  "same_source_funnel",
  "cohort",
  "time_baseline",
  "aggregate_directional",
  "not_comparable",
]);

const accessStatusSchema = z.enum([
  "not_connected",
  "verifying",
  "verified",
  "revoked",
  "error",
]);

const dataStatusSchema = z.enum([
  "none",
  "provider_pending",
  "collecting",
  "ready",
  "stale",
  "failed",
]);

const mappingStatusSchema = z.enum([
  "not_required",
  "automatic_unconfirmed",
  "confirmed",
  "manual",
  "insufficient_events",
  "invalid",
]);

const diagnosisStatusSchema = z.enum([
  "not_ready",
  "queued",
  "running",
  "ready",
  "no_confirmed_issue",
  "failed",
]);

const capabilityReadinessSchema = z.object({
  status: z.enum(["unsupported", "blocked", "collecting", "ready"]),
  reasonCode: z.string().optional(),
});

/**
 * Backend-derived readiness. The frontend must never re-derive this from a set
 * of loosely related arrays, so the validator insists on the structured shape
 * whenever the field is present at all.
 */
const workspaceReadinessSchema = z.object({
  state: z.enum([
    "product_required",
    "installation_required",
    "source_required",
    "source_pending",
    "collecting",
    "diagnosis_running",
    "diagnosis_ready",
    "no_confirmed_issue",
    "attention",
  ]),
  // Percent complete, 0-100. `deriveWorkspaceReadiness` emits whole percents
  // (0, 20, 25, 45, 60, 85, 100) and the readiness card renders them as such.
  // A 0-1 bound here rejects every authenticated snapshot, which silently
  // degrades the whole workspace to the "unavailable" state.
  progress: z.number().finite().min(0).max(100),
  primaryAction: z.object({
    kind: z.enum([
      "add_product",
      "install_web_tracking",
      "connect_source",
      "confirm_posthog_mapping",
      "retry_source",
      "open_diagnosis",
      "open_action_plan",
      "wait",
    ]),
    provider: sourceProviderSchema.optional(),
    reasonCode: z.string(),
  }),
  capabilities: z.object({
    acquisition: capabilityReadinessSchema,
    activation: capabilityReadinessSchema,
    monetization: capabilityReadinessSchema,
    retention: capabilityReadinessSchema,
  }),
  blockers: z.array(
    z.object({
      code: z.string(),
      provider: sourceProviderSchema.optional(),
      required: z.boolean(),
      current: z.number().finite().optional(),
      target: z.number().finite().optional(),
      lastCheckedAt: z.string().optional(),
      nextCheckAt: z.string().optional(),
    }),
  ),
});

const diagnosisSummarySchema = z.object({
  status: diagnosisStatusSchema,
  generatedAt: z.string().nullable(),
  version: z.string().nullable(),
  primaryInsightId: z.string().nullish(),
  limitations: z.array(z.string()).optional(),
  missingRequirements: z.array(z.string()).optional(),
  errorCode: z.string().nullish(),
});

const actionPlanSchema = z.object({
  targetStageId: z.string().optional(),
  problem: z.string(),
  desiredOutcome: z.string(),
  whyThisAction: z.string(),
  steps: z.array(
    z.object({
      order: z.number().int(),
      title: z.string(),
      instruction: z.string(),
      effort: z.enum(["small", "medium", "large"]),
    }),
  ),
  prerequisites: z.array(z.string()),
  instrumentation: z.array(z.string()),
  primaryMetric: z.object({
    key: z.string(),
    label: z.string(),
    current: z.number().finite().optional(),
    targetDirection: z.enum(["up", "down"]),
    successThreshold: z.number().finite().optional(),
  }),
  guardrails: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      failureThreshold: z.number().finite().optional(),
    }),
  ),
  segment: z.string().optional(),
  minimumSample: z.number().finite().optional(),
  minimumCompleteDays: z.number().finite().optional(),
  stopCondition: z.string(),
  rollbackCondition: z.string().optional(),
  evidenceIds: z.array(z.string()).optional(),
  sourceProviders: z.array(sourceProviderSchema).optional(),
});

const postHogMappingSchema = z.object({
  mode: z.enum(["automatic", "manual"]),
  status: z.enum([
    "automatic_unconfirmed",
    "confirmed",
    "insufficient_events",
    "invalid",
  ]),
  confidence: z.number().finite().min(0).max(1),
  sessionEvent: z.string().optional(),
  activationEvent: z.string().optional(),
  milestoneEvents: z.array(
    z.object({
      event: z.string(),
      label: z.string(),
      role: z.string(),
    }),
  ),
  detectedEventCount: z.number().int().nonnegative(),
  confirmedAt: z.string().optional(),
});

/**
 * The real activation cohort. `null` means "not measured", which is why the
 * whole object is nullable rather than defaulting every number to zero.
 */
const activationCohortSchema = z
  .object({
    newUsers: z.number().int().nonnegative(),
    activatedUsers: z.number().int().nonnegative(),
    activationRate: z.number().finite().min(0).max(1).nullable(),
    activationWindowDays: z.number().int().positive(),
    sampleSize: z.number().int().nonnegative(),
    cohortStart: z.string().nullable(),
    cohortEnd: z.string().nullable(),
    sessionEvent: z.string().optional(),
    activationEvent: z.string().optional(),
  })
  .nullable();

/** Web tracking installation state (Task P0.24). */
const webInstallSchema = z.object({
  status: z.enum([
    "not_configured",
    "domain_saved",
    "script_pending",
    "verifying",
    "verified",
    "stale",
  ]),
  domain: z.string().optional(),
  verifiedHostname: z.string().nullish(),
  firstEventAt: z.string().nullish(),
  lastEventAt: z.string().nullish(),
  verifiedAt: z.string().nullish(),
  installationVersion: z.number().int().nonnegative().optional(),
  primaryConversionGoal: z.string().nullish(),
});

export const dashboardSnapshotSchema = z.object({
  mode: z
    .enum(["demo", "empty", "live", "restricted", "unavailable"])
    .optional(),
  generatedAt: z.string().min(1),
  workspaceName: z.string(),
  app: z.object({
    id: z.string(),
    name: z.string(),
    platform: z.enum(["iOS", "Web"]),
    bundleId: z.string().optional(),
    appStoreId: z.string().optional(),
    iconUrl: z.string().optional(),
    storefront: z.string(),
    period: z.string(),
  }),
  readiness: workspaceReadinessSchema.optional(),
  diagnosis: diagnosisSummarySchema.optional(),
  confidence: z.object({
    score: z.number().finite(),
    level: confidenceSchema,
    note: z.string(),
  }),
  stages: z.array(
    z.object({
      id: stageIdSchema,
      label: z.string(),
      value: z.number().finite(),
      formattedValue: z.string(),
      conversionRate: z.number().finite().nullable(),
      health: z.enum(["healthy", "watch", "critical", "unknown"]),
      source: sourceProviderSchema,
      evidenceIds: z.array(z.string()),
      flowWidth: z.number().finite(),
      benchmark: z.number().finite().optional(),
      comparisonType: comparisonTypeSchema.optional(),
      readinessReason: z.string().optional(),
      sampleSize: z.number().finite().nonnegative().optional(),
      valueState: z
        .enum(["measured", "explicit_zero", "missing"])
        .optional(),
      baselineMethod: z
        .enum([
          "previous_window",
          "historical_average",
          "explicit_target",
          "none",
        ])
        .optional(),
      baselineWindow: z
        .object({ from: z.string(), to: z.string() })
        .nullish(),
      confidence: confidenceSchema.optional(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      occurredAt: z.string(),
      label: z.string(),
      detail: z.string(),
      type: z.enum(["release", "metadata", "screenshots", "price", "paywall"]),
      color: z.enum(["teal", "blue", "coral", "violet"]),
    }),
  ),
  evidence: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      finding: z.string(),
      source: sourceProviderSchema,
      metricKeys: z.array(z.string()),
      window: z.object({ from: z.string(), to: z.string() }),
      confidence: confidenceSchema,
      before: z.object({ label: z.string(), value: z.string() }),
      after: z.object({ label: z.string(), value: z.string() }),
    }),
  ),
  insights: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string(),
      kind: z.enum(["Observed", "Derived", "Hypothesis"]),
      stageId: stageIdSchema,
      evidenceIds: z.array(z.string()),
      confidence: confidenceSchema,
      impact: z.enum(["high", "medium", "low"]),
      effort: z.enum(["low", "medium", "high"]),
      rank: z.number().int(),
    }),
  ),
  actionProposals: z.array(
    z.object({
      id: z.string(),
      insightId: z.string(),
      title: z.string(),
      rationale: z.string(),
      experimentTemplate: z.string(),
      status: z.enum(["proposed", "accepted", "dismissed"]),
      externalMutationAllowed: z.literal(false),
      actionPlan: actionPlanSchema.optional(),
    }),
  ),
  actionPlans: z.array(actionPlanSchema).optional(),
  experiments: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      stageId: stageIdSchema,
      hypothesis: z.string(),
      primaryMetric: z.string(),
      guardrailMetric: z.string(),
      status: z.enum(["draft", "ready", "running", "completed"]),
      source: sourceProviderSchema,
      startedAt: z.string().optional(),
      endedAt: z.string().optional(),
      actionProposalId: z.string().optional(),
      evidenceIds: z.array(z.string()).optional(),
      result: z.string().optional(),
    }),
  ),
  sources: z.array(
    z.object({
      provider: sourceProviderSchema,
      label: z.string(),
      status: z.enum(["connected", "needs-attention", "not-connected"]),
      accessStatus: accessStatusSchema.optional(),
      dataStatus: dataStatusSchema.optional(),
      mappingStatus: mappingStatusSchema.optional(),
      accountLabel: z.string().optional(),
      lastVerifiedAt: z.string().nullish(),
      lastSyncAt: z.string().nullish(),
      nextSyncAt: z.string().nullish(),
      nextCheckAt: z.string().nullish(),
      firstDataAt: z.string().nullish(),
      freshnessHours: z.number().finite().nullish(),
      lastErrorCode: z.string().nullish(),
      syncStatus: z
        .enum(["queued", "running", "retrying", "succeeded", "failed"])
        .nullish(),
      syncAttempt: z.number().int().nonnegative().optional(),
      syncMaxAttempts: z.number().int().nonnegative().optional(),
      metricCount: z.number().int().nonnegative().optional(),
      lastMetricAt: z.string().nullish(),
      mapping: postHogMappingSchema.optional(),
      capabilities: z.array(z.string()),
      readOnly: z.literal(true),
    }),
  ),
  retention: z.array(
    z.object({
      cohort: z.string(),
      values: z.array(z.number().finite()),
    }),
  ),
  customerClusters: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      mentions: z.number().finite(),
      sentiment: z.enum(["positive", "mixed", "negative"]),
      x: z.number().finite(),
      y: z.number().finite(),
      radius: z.number().finite(),
    }),
  ),
  webInstall: webInstallSchema.optional(),
  posthogPulse: z
    .object({
      status: z.enum(["live", "preparing", "not-connected"]),
      autoMapped: z.boolean(),
      detectedEventCount: z.number().int().nonnegative(),
      updatedAt: z.string().nullable(),
      /** Activity volume. Never a denominator for the activation rate. */
      activeUserDays: z.number().finite().nonnegative(),
      /** Activity volume. Never a numerator for the activation rate. */
      activationUserDays: z.number().finite().nonnegative(),
      activationRate: z.number().finite().min(0).max(1).nullable(),
      activation: activationCohortSchema.optional(),
      mapping: postHogMappingSchema.optional(),
      dailyActive: z.array(
        z.object({
          date: z.string(),
          value: z.number().finite().nonnegative(),
        }),
      ),
      flow: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          event: z.string(),
          role: z.string(),
          value: z.number().finite().nonnegative(),
        }),
      ),
    })
    .optional(),
});

export function isDashboardSnapshot(
  value: unknown,
): value is DashboardSnapshot {
  return dashboardSnapshotSchema.safeParse(value).success;
}
