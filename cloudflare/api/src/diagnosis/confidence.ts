import { CONFIDENCE_WEIGHTS, FRESHNESS_SPAN_HOURS, THRESHOLDS } from "./config";
import type { ConfidenceLevel, DiagnosisMetric } from "./types";

export interface ConfidenceAssessment {
  score: number; // 0..100
  level: ConfidenceLevel;
  note: string;
}

export function computeConfidence(
  metrics: DiagnosisMetric[],
  now: Date,
): ConfidenceAssessment {
  if (!metrics.length) {
    return {
      score: 0,
      level: "low",
      note: "No metric points collected",
    };
  }

  // 1. Average Completeness
  const totalCompleteness = metrics.reduce(
    (sum, m) => sum + (m.completeness ?? 1),
    0,
  );
  const avgCompleteness = totalCompleteness / metrics.length;

  // 2. Freshness Score per series
  const latestBySeries = new Map<string, number>();
  for (const m of metrics) {
    const key = `${m.provider}\u0000${m.key}`;
    const timestamp = new Date(m.occurredAt).getTime();
    latestBySeries.set(key, Math.max(timestamp, latestBySeries.get(key) ?? 0));
  }

  let totalFreshnessHours = 0;
  for (const [, timestamp] of latestBySeries) {
    const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
    totalFreshnessHours += ageHours;
  }

  const avgFreshnessHours = totalFreshnessHours / Math.max(1, latestBySeries.size);
  const freshnessFactor = Math.max(0, 1 - avgFreshnessHours / FRESHNESS_SPAN_HOURS);

  // 3. Sample sufficiency factor
  const totalVolume = metrics.reduce((sum, m) => sum + Math.max(0, m.value), 0);
  const sampleFactor = Math.min(1, totalVolume / 100);

  const score = Math.round(
    Math.max(
      0,
      Math.min(
        1,
        avgCompleteness * CONFIDENCE_WEIGHTS.completeness +
          freshnessFactor * CONFIDENCE_WEIGHTS.freshness +
          sampleFactor * CONFIDENCE_WEIGHTS.sampleSufficiency,
      ),
    ) * 100,
  );

  const level: ConfidenceLevel =
    score >= THRESHOLDS.confidenceHigh
      ? "high"
      : score >= THRESHOLDS.confidenceMedium
        ? "medium"
        : "low";

  return {
    score,
    level,
    note: `${latestBySeries.size} series assessed, ${score}% confidence`,
  };
}
