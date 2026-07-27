/**
 * Versioned Growth Contract defaults.
 *
 * Server-owned. Visible in Settings; not a wall of onboarding controls.
 */

export const GROWTH_CONTRACT_SCHEMA_VERSION = 1;
export const GROWTH_CONTRACT_VERSION = "1.0.0";

export interface GrowthContractThresholds {
  schemaVersion: number;
  contractVersion: string;
  activationWindowDays: number;
  minimumNewUsers: number;
  maximumCollectionDays: number;
  minimumCompleteDays: number;
  regression: {
    minimumAbsoluteDrop: number;
    minimumRelativeDrop: number;
    pValueThreshold: number;
  };
  improvement: {
    minimumAbsoluteGain: number;
    minimumRelativeGain: number;
    pValueThreshold: number;
  };
  guardrails: {
    trialToPaid: { maximumRelativeDrop: number };
    renewalRate: { maximumRelativeDrop: number };
  };
  /** Fraction of lost gap that must be recovered for full `resolved`. */
  verificationRecoveryRatio: number;
  claimTimeoutMinutes: number;
}

export const DEFAULT_GROWTH_CONTRACT: GrowthContractThresholds = {
  schemaVersion: GROWTH_CONTRACT_SCHEMA_VERSION,
  contractVersion: GROWTH_CONTRACT_VERSION,
  activationWindowDays: 7,
  minimumNewUsers: 30,
  maximumCollectionDays: 21,
  minimumCompleteDays: 3,
  regression: {
    minimumAbsoluteDrop: 0.03,
    minimumRelativeDrop: 0.12,
    pValueThreshold: 0.05,
  },
  improvement: {
    minimumAbsoluteGain: 0.03,
    minimumRelativeGain: 0.12,
    pValueThreshold: 0.05,
  },
  guardrails: {
    trialToPaid: { maximumRelativeDrop: 0.15 },
    renewalRate: { maximumRelativeDrop: 0.15 },
  },
  verificationRecoveryRatio: 0.8,
  claimTimeoutMinutes: 120,
};

export const PRIMARY_METRIC_KEY = "activation_rate";
export const RELEASE_COHORT_NEW_USERS = "release_cohort_new_users";
export const RELEASE_COHORT_ACTIVATED_USERS = "release_cohort_activated_users";
