/**
 * Server-only daily budget for App Store keyword checks made by agents over
 * MCP (ADR 0008). An agent check costs the same as one in the explorer — a
 * live App Store search — so it draws on the plan's daily explorer checks.
 * Pro is unlimited on the site; agents get a high fair-use cap instead,
 * because every check shares one rate-limited path to Apple.
 */
import { limitsForPlan, type PlanId } from "./plan";
import { usageDay } from "./ai-usage";

export const AGENT_PRO_DAILY_CHECKS = 1000;

export function agentDailyChecks(plan: PlanId): number {
  return limitsForPlan(plan).explorerChecksPerDay ?? AGENT_PRO_DAILY_CHECKS;
}

export async function readAgentUsage(db: D1Database, subject: string, now: Date = new Date()): Promise<number> {
  const row = await db
    .prepare("SELECT count FROM agent_usage WHERE subject = ? AND day = ?")
    .bind(subject, usageDay(now))
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Take up to `wanted` checks from today's allowance and return how many
 * were granted (0 when the cap is reached). The conditional upsert keeps
 * parallel calls from overshooting the cap.
 */
export async function consumeAgentChecks(
  db: D1Database,
  subject: string,
  wanted: number,
  maxPerDay: number,
  now: Date = new Date(),
): Promise<number> {
  const day = usageDay(now);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const used = await readAgentUsage(db, subject, now);
    const granted = Math.min(Math.max(0, Math.floor(wanted)), Math.max(0, maxPerDay - used));
    if (granted === 0) return 0;
    const row = await db
      .prepare(
        `INSERT INTO agent_usage (subject, day, count, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (subject, day) DO UPDATE SET count = count + excluded.count, updated_at = excluded.updated_at
         WHERE agent_usage.count + excluded.count <= ?
         RETURNING count`,
      )
      .bind(subject, day, granted, now.toISOString(), maxPerDay)
      .first<{ count: number }>();
    if (row) return granted;
  }
  return 0;
}

/** Give back checks that failed before Apple answered. */
export async function refundAgentChecks(
  db: D1Database,
  subject: string,
  amount: number,
  now: Date = new Date(),
): Promise<void> {
  if (amount <= 0) return;
  await db
    .prepare("UPDATE agent_usage SET count = MAX(0, count - ?), updated_at = ? WHERE subject = ? AND day = ?")
    .bind(amount, now.toISOString(), subject, usageDay(now))
    .run();
}
