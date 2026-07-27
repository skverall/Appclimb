/**
 * Versioned diagnosis configuration.
 *
 * Every number the engine uses to call a stage healthy, watch or critical lives
 * here. Bumping DIAGNOSIS_VERSION invalidates cached input hashes so a rule
 * change forces a fresh run instead of silently reinterpreting an old result.
 */
export const DIAGNOSIS_VERSION = "2026.07.V2.1";
export const DIAGNOSIS_WINDOW_DAYS = 30;

/**
 * Length of the "recent" window compared against the product's own history.
 * Two of these must fit inside DIAGNOSIS_WINDOW_DAYS for a previous-window
 * comparison to be possible.
 */
export const RECENT_WINDOW_DAYS = 14;

export const CONFIDENCE_WEIGHTS = {
  completeness: 0.50,
  freshness: 0.30,
  sampleSufficiency: 0.20,
} as const;

export const FRESHNESS_SPAN_HOURS = 72.0;

export const THRESHOLDS = {
  confidenceHigh: 80,
  confidenceMedium: 55,

  // Minimum denominator required on BOTH sides before a conversion rate may be
  // classified as critical or watch. Below this a comparison stays "unknown".
  minSampleForRateComparison: 30,

  // Deterioration factors vs the product's own baseline (never an industry
  // benchmark). recent / baseline below the factor means deterioration.
  criticalDeteriorationFactor: 0.80, // >= 20% deterioration from baseline
  watchDeteriorationFactor: 0.90,    // 10% - 20% deterioration

  // Minimum complete days required on each side of a comparison.
  minCompleteDays: 7,

  // Minimum earlier days required for the historical-average fallback, used
  // when a full previous window is not yet available.
  minHistoricalDays: 3,

  // A day counts as "complete" only when reported completeness reaches this.
  completeDayMinCompleteness: 0.95,

  // Two-proportion / Poisson z threshold (~p < 0.05, two-sided) required before
  // a deterioration is called real rather than noise.
  minSignificanceZ: 1.96,

  // Metric series older than this are stale: they cannot confirm a constraint.
  staleSeriesHours: 72,

  // Maximum insights per run (rank 1 to 3)
  maxRankedInsights: 3,
} as const;

/**
 * Queue lifecycle configuration for diagnosis runs.
 */
export const RUN_CONFIG = {
  /** Attempts a single diagnosis run gets before it is marked failed. */
  maxAttempts: 4,
  /** Base backoff in seconds; grows exponentially per attempt. */
  retryBaseSeconds: 30,
  /** Upper bound on a single backoff step. */
  retryMaxSeconds: 30 * 60,
  /** A run left 'running' longer than this is considered abandoned. */
  staleRunMinutes: 15,
  /**
   * Skip re-running when a successful run for the same input hash finished
   * within this many minutes. Prevents a fan-in of source syncs from producing
   * a stampede of identical diagnoses.
   */
  debounceMinutes: 30,
  /** Rows a single scheduled catch-up pass will re-enqueue. */
  catchUpBatchSize: 50,
} as const;
