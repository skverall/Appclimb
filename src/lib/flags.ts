/**
 * Rollout flags (ADR 0004).
 *
 * `NEXT_PUBLIC_PRO_ENABLED=1` turns on the account/upgrade UI and the
 * plan-aware client limits. Until the founder flips it, the tool behaves
 * exactly as it did pre-monetization (no account chrome, legacy limits) —
 * so phases can ship to production safely before billing is configured.
 */

export function proEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PRO_ENABLED === "1";
}
