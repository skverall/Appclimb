/**
 * Rollout flags (ADR 0004).
 *
 * `NEXT_PUBLIC_PRO_ENABLED=1` turns on plan-aware client limits and is
 * one of two ways the account chrome becomes live. The other is runtime:
 * `GET /api/me` reporting `configured:true` (D1 bound). See `accountsAreLive`
 * in `src/lib/access.ts`. Until either is true, the tool keeps the
 * pre-monetization shape (no account chrome, legacy limits).
 */

export function proEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PRO_ENABLED === "1";
}
