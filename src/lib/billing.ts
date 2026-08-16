/**
 * Server-only billing writes (ADR 0004): maps a verified Paddle subscription
 * event into the `subscriptions` row that drives entitlements.
 */
import type { PaddleSubscriptionInfo } from "./paddle";
import type { PlanId } from "./plan";

/**
 * Resolve the AppClimb user a subscription belongs to. Prefers the `user_id`
 * carried in checkout `custom_data`; falls back to a previously stored row
 * with the same Paddle subscription id.
 */
export async function resolveSubscriptionOwner(
  db: D1Database,
  info: PaddleSubscriptionInfo,
): Promise<string | null> {
  if (info.userId) {
    const user = await db.prepare("SELECT id FROM users WHERE id = ?").bind(info.userId).first<{ id: string }>();
    if (user) return user.id;
  }
  const existing = await db
    .prepare("SELECT user_id FROM subscriptions WHERE paddle_subscription_id = ?")
    .bind(info.subscriptionId)
    .first<{ user_id: string }>();
  return existing?.user_id ?? null;
}

/**
 * Upsert the subscription row for the owner. The `updated_at` timestamp lets
 * webhook replays converge to the latest state (idempotent).
 */
export async function upsertSubscription(
  db: D1Database,
  userId: string,
  info: PaddleSubscriptionInfo,
  plan: PlanId,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO subscriptions
        (user_id, paddle_customer_id, paddle_subscription_id, status, price_id, plan, current_period_end, cancel_at_period_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         paddle_customer_id = excluded.paddle_customer_id,
         paddle_subscription_id = excluded.paddle_subscription_id,
         status = excluded.status,
         price_id = excluded.price_id,
         plan = excluded.plan,
         current_period_end = excluded.current_period_end,
         cancel_at_period_end = excluded.cancel_at_period_end,
         updated_at = excluded.updated_at`,
    )
    .bind(
      userId,
      info.customerId || null,
      info.subscriptionId || null,
      info.status || "unknown",
      info.priceId,
      plan,
      info.currentPeriodEnd,
      info.cancelAtPeriodEnd ? 1 : 0,
    )
    .run();
}
