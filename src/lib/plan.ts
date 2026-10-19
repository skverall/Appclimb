/**
 * Plan definitions and entitlement limits (ADR 0004).
 *
 * This module is shared by client and server code and must stay free of
 * server-only imports. A `null` limit means "unlimited".
 *
 * The free tier is a real product, not a demo; Pro is a convenience upgrade
 * under the founder's $10/month cap. Guests can search; tracking and the
 * assistant require a free account. See AGENTS.md (Product direction).
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
  /** Days of local snapshot history kept and charted. */
  historyDays: number;
  /** Weeks of official Apple popularity history shown per keyword. */
  historyWeeks: number;
  /** Whether cloud sync across devices is available. */
  cloudSync: boolean;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  free: {
    explorerChecksPerDay: 30,
    aiMessagesPerDay: 5,
    popularityPerDay: 200,
    trackedApps: 1,
    keywordsPerApp: 25,
    historyDays: 30,
    historyWeeks: 12,
    cloudSync: false,
  },
  pro: {
    explorerChecksPerDay: null,
    aiMessagesPerDay: 200,
    popularityPerDay: 2000,
    trackedApps: null,
    keywordsPerApp: null,
    historyDays: 90,
    historyWeeks: 52,
    cloudSync: true,
  },
};

/**
 * New keyword checks a day for a visitor with no account. Search never needs
 * a sign-in; a free account just raises this to the free plan's limit.
 */
export const GUEST_EXPLORER_CHECKS_PER_DAY = 8;

/** Free-plan limits as they apply to a visitor who has not signed in. */
export function guestLimits(): PlanLimits {
  return { ...PLAN_LIMITS.free, explorerChecksPerDay: GUEST_EXPLORER_CHECKS_PER_DAY };
}

/** Daily new-keyword checks for a guest, a free account, or Pro (`null`). */
export function explorerChecksFor(limits: PlanLimits, signedIn: boolean): number | null {
  if (!signedIn) return GUEST_EXPLORER_CHECKS_PER_DAY;
  return limits.explorerChecksPerDay;
}

export const PRO_MONTHLY_USD = 8;
export const PRO_YEARLY_USD = 64;
/** Founder cap — no plan may exceed this monthly price (ADR 0004). */
export const MAX_PRICE_USD_PER_MONTH = 10;

/** Yearly price spread over 12 months, as shown on plan cards ("5.33"). */
export const PRO_YEARLY_PER_MONTH_USD = (PRO_YEARLY_USD / 12).toFixed(2);
/** Dollars a yearly subscriber saves against 12 monthly payments. */
export const PRO_YEARLY_SAVING_USD = PRO_MONTHLY_USD * 12 - PRO_YEARLY_USD;
/** The same saving as a rounded percentage of a year of monthly billing. */
export const PRO_YEARLY_SAVE_PERCENT = Math.round((PRO_YEARLY_SAVING_USD / (PRO_MONTHLY_USD * 12)) * 100);
/** The same saving expressed as free months. */
export const PRO_YEARLY_MONTHS_FREE = Math.round(PRO_YEARLY_SAVING_USD / PRO_MONTHLY_USD);

/** Full refund window for any Pro payment, as stated on /refunds. */
export const REFUND_WINDOW_DAYS = 14;

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
