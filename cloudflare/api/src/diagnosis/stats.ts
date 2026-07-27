/**
 * Deterministic sample-aware comparison helpers.
 *
 * The engine must never call a stage critical because a small denominator
 * wobbled. Every classification therefore passes through one of these tests
 * plus the minimum-sample gate in config.ts.
 */

export interface ProportionSample {
  successes: number;
  trials: number;
}

export interface WilsonInterval {
  lower: number;
  upper: number;
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * Reported alongside evidence so a user can see how wide the observed rate
 * really is instead of trusting a bare percentage.
 */
export function wilsonInterval(
  sample: ProportionSample,
  z = 1.96,
): WilsonInterval {
  const n = Math.max(0, sample.trials);
  if (n === 0) return { lower: 0, upper: 1 };
  const p = Math.min(1, Math.max(0, sample.successes / n));
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
 * Two-proportion z statistic for `recent` against `baseline`.
 *
 * Positive z means the recent rate is LOWER than the baseline, i.e. the
 * direction the engine treats as deterioration. Returns 0 when either sample
 * is empty or the pooled variance collapses.
 */
export function twoProportionZ(
  recent: ProportionSample,
  baseline: ProportionSample,
): number {
  const n1 = Math.max(0, recent.trials);
  const n2 = Math.max(0, baseline.trials);
  if (n1 === 0 || n2 === 0) return 0;

  const p1 = recent.successes / n1;
  const p2 = baseline.successes / n2;
  const pooled = (recent.successes + baseline.successes) / (n1 + n2);
  if (pooled <= 0 || pooled >= 1) return 0;

  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (standardError === 0) return 0;
  return (p2 - p1) / standardError;
}

/**
 * Normal-approximation z statistic for a count observed against an expected
 * count derived from the product's own baseline rate per day.
 *
 * Positive z means fewer events than the baseline predicted.
 */
export function countDeviationZ(observed: number, expected: number): number {
  const total = Math.max(0, observed) + Math.max(0, expected);
  if (total <= 0) return 0;
  return (expected - observed) / Math.sqrt(total);
}

/**
 * Ratio of recent to baseline, guarded against a zero baseline.
 *
 * Returns null when the baseline carries no signal, which the caller must map
 * to `unknown` rather than to a deterioration.
 */
export function deteriorationRatio(
  recent: number,
  baseline: number,
): number | null {
  if (!Number.isFinite(recent) || !Number.isFinite(baseline)) return null;
  if (baseline <= 0) return null;
  return recent / baseline;
}
