/**
 * Server-only self-serve account deletion (the "Delete account" item in the
 * account menu, `DELETE /api/account`). Removes every row tied to the user in
 * one D1 batch. Visit analytics are not tied to accounts, so they stay.
 *
 * A Pro subscription that will still bill must be cancelled first: deleting
 * the account would not stop Paddle charging the card. Paddle webhooks for a
 * deleted user are ignored (billing.ts resolves no owner).
 */
import type { SubscriptionRecord } from "./entitlement";

const BILLING_STATUSES = new Set(["active", "trialing", "past_due", "paused"]);

/** True while Paddle will charge this subscription again. */
export function subscriptionStillBills(sub: SubscriptionRecord | null): boolean {
  return (
    sub !== null &&
    sub.paddle_subscription_id !== null &&
    BILLING_STATUSES.has(sub.status) &&
    sub.cancel_at_period_end !== 1
  );
}

export type DeleteAccountResult = { ok: true } | { ok: false; reason: "subscription_active" };

export async function deleteAccount(
  db: D1Database,
  user: { id: string; email: string },
): Promise<DeleteAccountResult> {
  const sub = await db
    .prepare("SELECT * FROM subscriptions WHERE user_id = ?")
    .bind(user.id)
    .first<SubscriptionRecord>();
  if (subscriptionStillBills(sub ?? null)) return { ok: false, reason: "subscription_active" };

  const subject = `user:${user.id}`;
  const byUser = [
    "sessions",
    "subscriptions",
    "sync_blobs",
    "email_prefs",
    "digest_log",
    "oauth_codes",
    "agent_tokens",
  ].map((table) => db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(user.id));

  await db.batch([
    db.prepare("DELETE FROM magic_links WHERE email = ?").bind(user.email),
    db.prepare("DELETE FROM ai_usage WHERE subject = ?").bind(subject),
    db.prepare("DELETE FROM agent_usage WHERE subject = ?").bind(subject),
    ...byUser,
    db.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return { ok: true };
}
