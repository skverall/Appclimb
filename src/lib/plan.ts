/**
 * Plan definitions and entitlement limits (ADR 0004).
 *
 * This module is shared by client and server code and must stay free of
 * server-only imports. A `null` limit means "unlimited".
 *
 * The free tier is a real product, not a demo; Pro is a convenience upgrade
 * under the founder's $10/month cap. Guests can search; tracking and the
 * assistant require a free account. See PRODUCT_DIRECTION.md.
 */

export type PlanId = "free" | "pro";

export interface PlanLimits {
  /** Keyword Explorer checks per day. `null` = unlimited. */
  explorerChecksPerDay: number | null;
  /** AI assistant messages per day. `null` = unlimited. */
  aiMessagesPerDay: number | null;
  /** Official Apple Ads popularity lookups per day. `null` = unlimited. */
  popularityPerDay: number | null;
  /** Number of tracked apps in My Apps. `null` = unlimited. */
  trackedApps: number | null;
  /** Keywords per tracked app. `null` = unlimited. */
  keywordsPerApp: number | null;
  /** Days of history kept and charted. */
  historyDays: number;
  /** Whether cloud sync across devices is available. */
  cloudSync: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    explorerChecksPerDay: 8,
    aiMessagesPerDay: 5,
    popularityPerDay: 30,
    trackedApps: 1,
    keywordsPerApp: 25,
    historyDays: 30,
    cloudSync: false,
  },
  pro: {
    explorerChecksPerDay: null,
    aiMessagesPerDay: 200,
    popularityPerDay: 500,
    trackedApps: null,
    keywordsPerApp: null,
    historyDays: 90,
    cloudSync: true,
  },
};

export const PRO_MONTHLY_USD = 8;
export const PRO_YEARLY_USD = 64;
/** Founder cap — no plan may exceed this monthly price (ADR 0004). */
export const MAX_PRICE_USD_PER_MONTH = 10;

export const PLAN_NAMES: Record<PlanId, string> = {
  free: "Free",
  pro: "Pro",
};

export function limitsForPlan(plan: PlanId): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export function isUnlimited(value: number | null): boolean {
  return value === null;
}

/** Coerce an unknown value to a valid plan id, defaulting to free. */
export function normalizePlan(raw: unknown): PlanId {
  return raw === "pro" ? "pro" : "free";
}

/** Subscription statuses that keep Pro entitlement active. */
const ACTIVE_PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface SubscriptionState {
  plan: string;
  status: string;
  current_period_end: string | null;
}

/**
 * Decide whether a stored subscription grants Pro right now.
 *
 * Active/trialing/past-due subscriptions grant Pro. A canceled subscription
 * keeps Pro until the paid period ends. A paused subscription does not.
 */
export function isProEntitled(sub: SubscriptionState | null | undefined, now: number = Date.now()): boolean {
  if (!sub) return false;
  if (sub.plan !== "pro") return false;
  if (ACTIVE_PRO_STATUSES.has(sub.status)) return true;
  if (sub.status === "paused") return false;
  if (sub.current_period_end) {
    const end = Date.parse(sub.current_period_end);
    if (Number.isFinite(end) && end > now) return true;
  }
  return false;
}
