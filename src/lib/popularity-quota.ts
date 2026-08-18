// Daily rate bucket for the official-popularity overlay (server-side).
// Enforced per quota subject (IP for guests, account for signed-in users);
// the day window is UTC-midnight aligned like every other daily quota.

import { nextUtcMidnightMs } from "@/lib/day-window";

export const POPULARITY_MIN_INTERVAL_MS = 80;

export interface PopularityRateBucket {
  dayCount: number;
  dayReset: number;
  lastAt: number;
}

export function emptyPopularityBucket(now: number): PopularityRateBucket {
  return {
    dayCount: 0,
    dayReset: nextUtcMidnightMs(now),
    lastAt: 0,
  };
}

export interface PopularityRateResult {
  ok: boolean;
  reason?: string;
  retryAfterSec?: number;
  bucket: PopularityRateBucket;
}

export function consumePopularityRate(
  bucket: PopularityRateBucket,
  now: number,
  maxPerDay: number,
): PopularityRateResult {
  const next = { ...bucket };
  if (now >= next.dayReset) {
    next.dayCount = 0;
    next.dayReset = nextUtcMidnightMs(now);
  }
  if (now - next.lastAt < POPULARITY_MIN_INTERVAL_MS) {
    return {
      ok: false,
      reason: "Too many popularity lookups. Wait a moment.",
      retryAfterSec: 1,
      bucket: next,
    };
  }
  if (Number.isFinite(maxPerDay) && next.dayCount >= maxPerDay) {
    return {
      ok: false,
      reason: "Daily popularity lookup limit reached.",
      retryAfterSec: Math.max(1, Math.ceil((next.dayReset - now) / 1000)),
      bucket: next,
    };
  }
  next.dayCount += 1;
  next.lastAt = now;
  return { ok: true, bucket: next };
}
