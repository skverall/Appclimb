/**
 * Server-only entitlement resolution (ADR 0004): maps a user's stored Paddle
 * subscription row to an effective plan. Pure read logic; the Paddle webhook
 * is responsible for keeping the `subscriptions` row up to date.
 */
import { isProEntitled, type PlanId } from "./plan";

export interface SubscriptionRecord {
  user_id: string;
  paddle_customer_id: string | null;
  paddle_subscription_id: string | null;
  status: string;
  price_id: string | null;
  plan: string;
  current_period_end: string | null;
  cancel_at_period_end: number;
  updated_at: string;
}

export async function getSubscription(
  db: D1Database,
  userId: string,
): Promise<SubscriptionRecord | null> {
  const row = await db
    .prepare("SELECT * FROM subscriptions WHERE user_id = ?")
    .bind(userId)
    .first<SubscriptionRecord>();
  return row ?? null;
}

export async function getPlanForUser(db: D1Database, userId: string): Promise<PlanId> {
  const sub = await getSubscription(db, userId);
  if (sub && isProEntitled(sub)) return "pro";
  return "free";
}

/** Effective plan for a possibly-unknown subscription row. */
export function planFromSubscription(sub: SubscriptionRecord | null): PlanId {
  return isProEntitled(sub) ? "pro" : "free";
}
