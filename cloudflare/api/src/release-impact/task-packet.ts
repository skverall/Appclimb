import type { ReleaseImpactResult } from "./types";
import type { GrowthContractThresholds } from "./config";

export interface TaskPacketApp {
  id: string;
  name: string;
  platform: "iOS";
}

export interface GrowthTaskPacket {
  schema_version: 1;
  task_id: string;
  app: TaskPacketApp;
  incident: {
    id: string;
    origin_release: string;
    stage: string;
    title: string;
    severity: string;
    confidence: number;
  };
  evidence: {
    baseline_rate: number | null;
    current_rate: number | null;
    baseline_sample: number;
    current_sample: number;
    absolute_change: number | null;
    relative_change: number | null;
    p_value: number | null;
    limitations: string[];
    trust: "verified_connector" | "signed_agent_observation" | "user_assertion" | "inference";
  };
  goal: string;
  hypothesis: {
    text: string;
    trust: "inference";
  };
  instructions: string[];
  acceptance_criteria: string[];
  guardrails: Array<{ metric: string; condition: string }>;
  verification_contract: {
    primary_metric: string;
    minimum_new_users: number;
    success: string;
    maximum_wait_days: number;
  };
  forbidden_actions: string[];
  reporting: {
    required: string[];
    optional: string[];
  };
}

export function buildTaskPacket(input: {
  taskId: string;
  incidentId: string;
  app: TaskPacketApp;
  originReleaseLabel: string;
  impact: ReleaseImpactResult;
  contract: GrowthContractThresholds;
  commitSha?: string | null;
}): GrowthTaskPacket {
  const { impact, contract } = input;
  return {
    schema_version: 1,
    task_id: input.taskId,
    app: input.app,
    incident: {
      id: input.incidentId,
      origin_release: input.originReleaseLabel,
      stage: impact.stageId,
      title: impact.title,
      severity: impact.severity ?? "important",
      confidence: impact.confidenceScore,
    },
    evidence: {
      baseline_rate: impact.baselineValue,
      current_rate: impact.currentValue,
      baseline_sample: impact.baselineSample,
      current_sample: impact.currentSample,
      absolute_change: impact.absoluteChange,
      relative_change: impact.relativeChange,
      p_value: impact.pValue,
      limitations: impact.limitations,
      trust: "verified_connector",
    },
    goal: "Restore first-value activation without harming trial starts or renewals.",
    hypothesis: {
      text: `A change in the ${input.originReleaseLabel} onboarding or first-value path may have added friction or broken activation instrumentation.`,
      trust: "inference",
    },
    instructions: [
      input.commitSha
        ? `Inspect code changes associated with commit ${input.commitSha} if available in the repository.`
        : "Inspect recent onboarding and first-value path changes for the origin release if commit metadata is available.",
      "Verify the activation event still represents the same user outcome.",
      "Prefer the smallest reversible change.",
      "Add or update tests and analytics assertions.",
      "Do not modify pricing, products, entitlements, or paywall configuration.",
    ],
    acceptance_criteria: [
      "The activation event fires exactly once for the intended first-value action.",
      "The affected flow passes its automated tests.",
      "No RevenueCat entitlement or product configuration changes are made.",
      "The change is delivered as a reviewable branch or pull request.",
    ],
    guardrails: [
      {
        metric: "trial_to_paid",
        condition: "must not materially regress",
      },
      {
        metric: "renewal_rate",
        condition: "must not materially regress",
      },
    ],
    verification_contract: {
      primary_metric: impact.primaryMetricKey,
      minimum_new_users: contract.minimumNewUsers,
      success:
        "statistically significant improvement versus the broken release and recovery of at least 80% of the lost gap",
      maximum_wait_days: contract.maximumCollectionDays,
    },
    forbidden_actions: [
      "merge_without_human_approval",
      "deploy_without_human_approval",
      "change_subscription_products",
      "change_prices",
      "send_source_credentials",
      "claim_causality_not_supported_by_evidence",
    ],
    reporting: {
      required: ["branch_name", "commit_sha", "tests_run", "change_summary"],
      optional: ["pull_request_url", "blocker"],
    },
  };
}

/** Portable appclimb.yml fragment (server remains source of truth). */
export function exportGrowthContractYaml(input: {
  appId: string;
  sessionEvent: string;
  activationEvent: string;
  versionProperty: string;
  buildProperty: string;
  contract: GrowthContractThresholds;
}): string {
  const c = input.contract;
  return [
    "schema_version: 1",
    `app_id: ${JSON.stringify(input.appId)}`,
    "platform: ios",
    "measurement:",
    `  session_event: ${JSON.stringify(input.sessionEvent)}`,
    `  activation_event: ${JSON.stringify(input.activationEvent)}`,
    `  version_property: ${JSON.stringify(input.versionProperty)}`,
    `  build_property: ${JSON.stringify(input.buildProperty)}`,
    `  activation_window_days: ${c.activationWindowDays}`,
    "release_evaluation:",
    `  minimum_new_users: ${c.minimumNewUsers}`,
    `  maximum_collection_days: ${c.maximumCollectionDays}`,
    `  minimum_complete_days: ${c.minimumCompleteDays}`,
    "  regression:",
    `    minimum_absolute_drop: ${c.regression.minimumAbsoluteDrop}`,
    `    minimum_relative_drop: ${c.regression.minimumRelativeDrop}`,
    `    p_value_threshold: ${c.regression.pValueThreshold}`,
    "  improvement:",
    `    minimum_absolute_gain: ${c.improvement.minimumAbsoluteGain}`,
    `    minimum_relative_gain: ${c.improvement.minimumRelativeGain}`,
    `    p_value_threshold: ${c.improvement.pValueThreshold}`,
    "guardrails:",
    "  trial_to_paid:",
    `    maximum_relative_drop: ${c.guardrails.trialToPaid.maximumRelativeDrop}`,
    "  renewal_rate:",
    `    maximum_relative_drop: ${c.guardrails.renewalRate.maximumRelativeDrop}`,
    "",
  ].join("\n");
}
