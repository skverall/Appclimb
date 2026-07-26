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

export const dashboardSnapshotSchema = z.object({
  mode: z
    .enum(["demo", "empty", "live", "restricted", "unavailable"])
    .optional(),
  generatedAt: z.string().min(1),
  workspaceName: z.string(),
  app: z.object({
    id: z.string(),
    name: z.string(),
    platform: z.literal("iOS"),
    storefront: z.string(),
    period: z.string(),
  }),
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
    }),
  ),
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
    }),
  ),
  sources: z.array(
    z.object({
      provider: sourceProviderSchema,
      label: z.string(),
      status: z.enum(["connected", "needs-attention", "not-connected"]),
      accountLabel: z.string().optional(),
      lastSyncAt: z.string().nullish(),
      nextSyncAt: z.string().nullish(),
      freshnessHours: z.number().finite().nullish(),
      lastErrorCode: z.string().nullish(),
      syncStatus: z
        .enum(["queued", "running", "retrying", "succeeded", "failed"])
        .nullish(),
      syncAttempt: z.number().int().nonnegative().optional(),
      syncMaxAttempts: z.number().int().nonnegative().optional(),
      metricCount: z.number().int().nonnegative().optional(),
      lastMetricAt: z.string().nullish(),
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
  posthogPulse: z
    .object({
      status: z.enum(["live", "preparing", "not-connected"]),
      autoMapped: z.boolean(),
      detectedEventCount: z.number().int().nonnegative(),
      updatedAt: z.string().nullable(),
      activeUserDays: z.number().finite().nonnegative(),
      activationUserDays: z.number().finite().nonnegative(),
      activationRate: z.number().finite().min(0).max(1).nullable(),
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
