/**
 * Growth CI access rules.
 *
 * - Paid / active entitlement: full automation
 * - Active calendar trial (legacy): full automation (backward compatible)
 * - Free: allowed through first complete release verdict; automation stops after
 *
 * Existing paid customers are never downgraded.
 */
import type { Workspace } from "../types";
import { isEntitled } from "../db";

export type GrowthCiAccess = {
  workspaceEntitled: boolean;
  freeVerdictConsumed: boolean;
  freeVerdictRemaining: boolean;
  canConnectSources: boolean;
  canRunReleaseChecks: boolean;
  canUseAgentBridge: boolean;
  canViewHistory: boolean;
  reason:
    | "paid"
    | "trial"
    | "free_first_verdict"
    | "free_exhausted"
    | "not_entitled";
};

export function assessGrowthCiAccess(
  workspace: Pick<
    Workspace,
    "subscriptionStatus" | "trialEndsAt" | "entitlementEndsAt"
  >,
  freeVerdictConsumedAt: string | null | undefined,
  now = new Date(),
): GrowthCiAccess {
  const freeVerdictConsumed = Boolean(freeVerdictConsumedAt);
  const freeVerdictRemaining = !freeVerdictConsumed;
  const workspaceEntitled = isEntitled(workspace, now);

  const paidLike =
    ["active", "past_due", "paused"].includes(workspace.subscriptionStatus) &&
    (workspace.subscriptionStatus === "active" ||
      (workspace.entitlementEndsAt &&
        new Date(workspace.entitlementEndsAt).getTime() > now.getTime()));

  const trialActive =
    workspace.subscriptionStatus === "trialing" &&
    new Date(workspace.trialEndsAt).getTime() > now.getTime();

  if (paidLike || workspace.subscriptionStatus === "active") {
    return {
      workspaceEntitled: true,
      freeVerdictConsumed,
      freeVerdictRemaining,
      canConnectSources: true,
      canRunReleaseChecks: true,
      canUseAgentBridge: true,
      canViewHistory: true,
      reason: "paid",
    };
  }

  if (trialActive) {
    return {
      workspaceEntitled: true,
      freeVerdictConsumed,
      freeVerdictRemaining,
      canConnectSources: true,
      canRunReleaseChecks: true,
      canUseAgentBridge: true,
      canViewHistory: true,
      reason: "trial",
    };
  }

  // Free first-verdict path: always allow setup until first terminal verdict
  if (freeVerdictRemaining) {
    return {
      workspaceEntitled: true,
      freeVerdictConsumed: false,
      freeVerdictRemaining: true,
      canConnectSources: true,
      canRunReleaseChecks: true,
      canUseAgentBridge: false, // Agent Bridge is Pro
      canViewHistory: true,
      reason: "free_first_verdict",
    };
  }

  // Free exhausted without paid
  return {
    workspaceEntitled: workspaceEntitled,
    freeVerdictConsumed: true,
    freeVerdictRemaining: false,
    canConnectSources: true, // keep revoke/reconnect for cleanup
    canRunReleaseChecks: false,
    canUseAgentBridge: false,
    canViewHistory: true,
    reason: "free_exhausted",
  };
}
