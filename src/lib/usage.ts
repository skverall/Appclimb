/**
 * Client-side daily usage counters for plan limits (ADR 0004).
 *
 * These mirror the existing `appclimb:ai:day` pattern: a small per-day counter
 * in localStorage that enforces the free-tier caps in the browser. Server-side
 * quotas (popularity, AI) back these up; the client counters exist for flows
 * that run entirely in the browser (Keyword Explorer checks).
 */

export const EXPLORER_DAY_KEY = "appclimb:explorer:day";

export interface DayUsage {
  day: string;
  count: number;
}

/** Local calendar date as `YYYY-MM-DD` (UTC, matching other day keys). */
export function todayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function readDayUsage(storage: Storage, key: string, now: Date = new Date()): DayUsage {
  const today = todayStamp(now);
  try {
    const raw = storage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DayUsage>;
      if (
        parsed &&
        parsed.day === today &&
        typeof parsed.count === "number" &&
        Number.isFinite(parsed.count) &&
        parsed.count >= 0
      ) {
        return { day: today, count: parsed.count };
      }
    }
  } catch {
    // Corrupt value — treat as a fresh day.
  }
  return { day: today, count: 0 };
}

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  /** True when the counter was actually incremented (write succeeded). */
  consumed: boolean;
}

/**
 * Try to consume one unit of a daily quota. `limit === null` means unlimited
 * (Pro). Returns whether the action is allowed and how many uses remain.
 */
export function consumeDayUsage(
  storage: Storage,
  key: string,
  limit: number | null,
  now: Date = new Date(),
): ConsumeResult {
  if (limit === null) {
    return {
      allowed: true,
      remaining: Number.POSITIVE_INFINITY,
      consumed: false,
    };
  }
  const usage = readDayUsage(storage, key, now);
  if (usage.count >= limit) {
    return { allowed: false, remaining: 0, consumed: false };
  }
  const next: DayUsage = { day: usage.day, count: usage.count + 1 };
  try {
    storage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — fail open rather than block the tool.
    return {
      allowed: true,
      remaining: limit - usage.count,
      consumed: false,
    };
  }
  return {
    allowed: true,
    remaining: limit - next.count,
    consumed: true,
  };
}

/**
 * Reverse one unit of a daily quota. A failed attempt is not a check, so a
 * caller that consumed for an operation that then errored may refund it.
 * Never ticks below zero and only touches today's count.
 */
export function refundDayUsage(
  storage: Storage,
  key: string,
  now: Date = new Date(),
): void {
  const usage = readDayUsage(storage, key, now);
  if (usage.count <= 0) return;
  const next: DayUsage = { day: usage.day, count: usage.count - 1 };
  try {
    storage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — keep the count as-is rather than crash.
  }
}

/** Current count today without consuming. */
export function peekDayUsage(storage: Storage, key: string, now: Date = new Date()): number {
  return readDayUsage(storage, key, now).count;
}
