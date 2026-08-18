// Shared UTC day-window helpers for daily quotas (client-safe, zero imports).

/**
 * Milliseconds at the start of the current UTC calendar day. Daily quotas are
 * aligned to the same UTC-midnight boundary the browser counters use, so a
 * user who reaches a cap late at night is unblocked at midnight instead of
 * staying locked for a full rolling 24h.
 */
export function utcDayStartMs(now: number): number {
  const time = new Date(now);
  return Date.UTC(
    time.getUTCFullYear(),
    time.getUTCMonth(),
    time.getUTCDate(),
  );
}

/** Milliseconds at the next UTC midnight (the daily quota boundary). */
export function nextUtcMidnightMs(now: number): number {
  return utcDayStartMs(now) + 24 * 60 * 60 * 1000;
}
