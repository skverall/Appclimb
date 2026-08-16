/**
 * Server-only quota resolution (ADR 0004): decides who is making a request
 * (a signed-in user on a plan, or an anonymous IP on the free tier) and the
 * daily limit that applies. Enforcement itself stays best-effort in-memory in
 * each route handler, mirroring the existing rate-limit pattern.
 */
import type { NextRequest } from "next/server";

import { getPlanForUser } from "./entitlement";
import { limitsForPlan, type PlanId } from "./plan";
import { clientIpFromHeaders } from "./rate-limit";
import { getCurrentSession } from "./session";

export interface QuotaSubject {
  /** Stable bucket key: `user:<id>` or `ip:<ip>`. */
  key: string;
  plan: PlanId;
  isSignedIn: boolean;
}

export async function resolveQuotaSubject(
  request: NextRequest,
  db: D1Database | null,
): Promise<QuotaSubject> {
  if (db) {
    const current = await getCurrentSession(request, db);
    if (current) {
      const plan = await getPlanForUser(db, current.user.id);
      return { key: `user:${current.user.id}`, plan, isSignedIn: true };
    }
  }
  const ip = clientIpFromHeaders((name) => request.headers.get(name));
  return { key: `ip:${ip}`, plan: "free", isSignedIn: false };
}

/** Daily official-popularity lookup limit for a plan. */
export function popularityDailyLimit(plan: PlanId): number {
  return limitsForPlan(plan).popularityPerDay ?? Number.POSITIVE_INFINITY;
}

/** Daily AI-assistant message limit for a plan. */
export function aiDailyLimit(plan: PlanId): number {
  return limitsForPlan(plan).aiMessagesPerDay ?? Number.POSITIVE_INFINITY;
}
