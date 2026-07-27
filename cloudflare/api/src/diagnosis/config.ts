export const DIAGNOSIS_VERSION = "2026.07.V2";
export const DIAGNOSIS_WINDOW_DAYS = 30;

export const CONFIDENCE_WEIGHTS = {
  completeness: 0.50,
  freshness: 0.30,
  sampleSufficiency: 0.20,
} as const;

export const FRESHNESS_SPAN_HOURS = 72.0;

export const THRESHOLDS = {
  confidenceHigh: 80,
  confidenceMedium: 55,

  // Minimum sample size required to classify a conversion rate as critical/watch
  minSampleForRateComparison: 30,

  // Deterioration factors vs benchmark or own historical baseline
  criticalDeteriorationFactor: 0.80, // >= 20% deterioration from baseline
  watchDeteriorationFactor: 0.90,    // 10% - 20% deterioration

  // Minimum complete days required in a 30-day window
  minCompleteDays: 7,

  // Maximum insights per run (rank 1 to 3)
  maxRankedInsights: 3,
} as const;
