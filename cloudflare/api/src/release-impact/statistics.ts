/**
 * Pure statistical helpers for release impact classification.
 *
 * No network or database access.
 */

export interface ProportionSample {
  successes: number;
  trials: number;
}

export interface WilsonInterval {
  lower: number;
  upper: number;
}

export function clampRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function wilsonInterval(
  sample: ProportionSample,
  z = 1.96,
): WilsonInterval {
  const n = Math.max(0, sample.trials);
  if (n === 0) return { lower: 0, upper: 1 };
  const p = clampRate(sample.successes / n);
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return {
    lower: Math.max(0, (centre - spread) / denominator),
    upper: Math.min(1, (centre + spread) / denominator),
  };
}

/**
 * Two-sided p-value for equality of two binomial proportions via two-proportion
 * z-test with normal approximation. Returns 1 when samples are empty or pooled
 * variance collapses.
 */
export function twoProportionPValue(
  a: ProportionSample,
  b: ProportionSample,
): number {
  const n1 = Math.max(0, a.trials);
  const n2 = Math.max(0, b.trials);
  if (n1 === 0 || n2 === 0) return 1;

  const p1 = a.successes / n1;
  const p2 = b.successes / n2;
  const pooled = (a.successes + b.successes) / (n1 + n2);
  if (pooled <= 0 || pooled >= 1) {
    // Rates at 0 or 1 with non-empty samples: if rates differ, treat as extreme.
    if (p1 === p2) return 1;
    return 0;
  }

  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  const z = Math.abs(p1 - p2) / se;
  return normalTwoSidedPValue(z);
}

/** Standard normal two-sided p-value from |z|. */
export function normalTwoSidedPValue(absZ: number): number {
  const z = Math.abs(absZ);
  // Abramowitz & Stegun 7.1.26 approximation of erfc for Φ
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989422804014327; // 1/sqrt(2π)
  const poly =
    t *
    (0.319381530 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const oneSided = d * Math.exp((-z * z) / 2) * poly;
  return Math.min(1, Math.max(0, 2 * oneSided));
}

export function absoluteChange(
  current: number | null,
  baseline: number | null,
): number | null {
  if (current === null || baseline === null) return null;
  return current - baseline;
}

export function relativeChange(
  current: number | null,
  baseline: number | null,
): number | null {
  if (current === null || baseline === null) return null;
  if (baseline === 0) {
    if (current === 0) return 0;
    return current > 0 ? 1 : -1;
  }
  return (current - baseline) / baseline;
}

export function rateFromCounts(
  activated: number,
  newUsers: number,
): number | null {
  if (newUsers <= 0) return null;
  return clampRate(activated / newUsers);
}
