/**
 * Server-only daily assistant usage in D1. A message is charged before the
 * model is called and refunded if the call fails, so errors never burn quota
 * and parallel requests cannot overshoot the cap.
 */

import { AI_LIMITS } from "@/lib/ai-chat";
import type { PlanId } from "@/lib/plan";
import { aiDailyLimit, proQuotasEnabled } from "@/lib/quota";

/** Messages per UTC day: the plan's limit once quotas are on, else the legacy cap. */
export function assistantDailyLimit(plan: PlanId): number {
  return proQuotasEnabled() ? aiDailyLimit(plan) : AI_LIMITS.maxMessagesPerDay;
}

/** UTC calendar day, matching the reset of the in-memory rate bucket. */
export function usageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function readAiUsage(
  db: D1Database,
  subject: string,
  now: Date = new Date(),
): Promise<number> {
  const row = await db
    .prepare("SELECT count FROM ai_usage WHERE subject = ? AND day = ?")
    .bind(subject, usageDay(now))
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Atomically take one message from today's allowance. Returns the new count,
 * or null when the cap is already reached.
 */
export async function consumeAiUsage(
  db: D1Database,
  subject: string,
  maxPerDay: number,
  now: Date = new Date(),
): Promise<number | null> {
  if (maxPerDay <= 0) return null;
  const row = await db
    .prepare(
      `INSERT INTO ai_usage (subject, day, count, updated_at) VALUES (?, ?, 1, ?)
       ON CONFLICT (subject, day) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
       WHERE ai_usage.count < ?
       RETURNING count`,
    )
    .bind(subject, usageDay(now), now.toISOString(), maxPerDay)
    .first<{ count: number }>();
  return row ? row.count : null;
}

/** Give back a message whose reply never arrived. */
export async function refundAiUsage(
  db: D1Database,
  subject: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .prepare(
      "UPDATE ai_usage SET count = MAX(0, count - 1), updated_at = ? WHERE subject = ? AND day = ?",
    )
    .bind(now.toISOString(), subject, usageDay(now))
    .run();
}
