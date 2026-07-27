/**
 * Decision System V2 rollout flags (plan section 18).
 *
 * All four default to OFF. A flag that is absent from the environment is off,
 * which is what lets this land as dormant code: the diagnosis pipeline runs and
 * records its verdict in shadow mode, and only the user-facing output is gated.
 *
 * Flags are read from the Worker environment at request/queue time rather than
 * being baked in, so a bad run can be switched off from the Cloudflare
 * dashboard without a redeploy.
 */
export const ROLLOUT_FLAGS = [
  "READINESS_V2_ENABLED",
  "DIAGNOSIS_V2_ENABLED",
  "ACTION_PLAN_V2_ENABLED",
  "POSTHOG_COHORT_ACTIVATION_ENABLED",
] as const;

export type RolloutFlag = (typeof ROLLOUT_FLAGS)[number];

/**
 * Truthy spellings accepted for a flag value. Anything else — including an
 * unset variable — is off.
 */
const ENABLED_VALUES = new Set(["true", "1", "on", "enabled", "yes"]);

export function isFlagEnabled(env: Cloudflare.Env, flag: RolloutFlag): boolean {
  const raw = (env as unknown as Record<string, unknown>)[flag];
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return false;
  return ENABLED_VALUES.has(raw.trim().toLowerCase());
}

export function rolloutFlagState(
  env: Cloudflare.Env,
): Record<RolloutFlag, boolean> {
  return {
    READINESS_V2_ENABLED: isFlagEnabled(env, "READINESS_V2_ENABLED"),
    DIAGNOSIS_V2_ENABLED: isFlagEnabled(env, "DIAGNOSIS_V2_ENABLED"),
    ACTION_PLAN_V2_ENABLED: isFlagEnabled(env, "ACTION_PLAN_V2_ENABLED"),
    POSTHOG_COHORT_ACTIVATION_ENABLED: isFlagEnabled(
      env,
      "POSTHOG_COHORT_ACTIVATION_ENABLED",
    ),
  };
}
