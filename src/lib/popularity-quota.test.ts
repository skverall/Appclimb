import { describe, expect, it } from "vitest";

import {
  consumePopularityRate,
  emptyPopularityBucket,
  POPULARITY_MIN_INTERVAL_MS,
} from "./popularity-quota";

const NOW = Date.UTC(2026, 7, 18, 12, 0, 0);
const GUEST_LIMIT = 30;

describe("consumePopularityRate", () => {
  it("allows the 30th lookup and blocks the 31st (guest 30/day)", () => {
    let bucket = emptyPopularityBucket(NOW);
    for (let i = 1; i <= 30; i += 1) {
      const step = consumePopularityRate(
        bucket,
        NOW + i * (POPULARITY_MIN_INTERVAL_MS + 5),
        GUEST_LIMIT,
      );
      expect(step.ok, `lookup #${i} should pass`).toBe(true);
      if (step.ok) bucket = step.bucket;
    }
    expect(bucket.dayCount).toBe(30);

    const blocked = consumePopularityRate(
      bucket,
      NOW + 31 * (POPULARITY_MIN_INTERVAL_MS + 5),
      GUEST_LIMIT,
    );
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toMatch(/limit/i);
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("resets the day window at UTC midnight", () => {
    let bucket = emptyPopularityBucket(NOW);
    for (let i = 1; i <= 30; i += 1) {
      const step = consumePopularityRate(
        bucket,
        NOW + i * (POPULARITY_MIN_INTERVAL_MS + 5),
        GUEST_LIMIT,
      );
      if (step.ok) bucket = step.bucket;
    }
    const afterMidnight = Date.UTC(2026, 7, 19, 0, 0, 1);
    const unlocked = consumePopularityRate(
      bucket,
      afterMidnight,
      GUEST_LIMIT,
    );
    expect(unlocked.ok).toBe(true);
    expect(unlocked.bucket.dayCount).toBe(1);
  });

  it("enforces the minimum interval between lookups", () => {
    const bucket = emptyPopularityBucket(NOW);
    const first = consumePopularityRate(bucket, NOW, GUEST_LIMIT);
    expect(first.ok).toBe(true);
    const tooSoon = consumePopularityRate(
      first.bucket,
      NOW + POPULARITY_MIN_INTERVAL_MS - 1,
      GUEST_LIMIT,
    );
    expect(tooSoon.ok).toBe(false);
    expect(tooSoon.retryAfterSec).toBe(1);
  });

  it("treats an unlimited plan as unlimited", () => {
    const bucket = emptyPopularityBucket(NOW);
    const step = consumePopularityRate(
      bucket,
      NOW + 1_000_000,
      Number.POSITIVE_INFINITY,
    );
    expect(step.ok).toBe(true);
    expect(step.bucket.dayCount).toBe(1);
  });
});
