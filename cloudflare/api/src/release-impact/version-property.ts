/**
 * Deterministic PostHog version property discovery.
 *
 * Never silently trust a guessed property. Discover candidates, score them,
 * and require confirmation before release evaluation.
 */

export interface PropertyObservation {
  key: string;
  /** Distinct values observed (bounded sample). */
  sampleValues: string[];
  distinctCount: number;
  presentOnSessionEvent: boolean;
  lastSeenAt?: string;
  eventCount?: number;
}

export interface VersionPropertyCandidate {
  key: string;
  score: number;
  reasons: string[];
  sampleValues: string[];
  distinctCount: number;
  presentOnSessionEvent: boolean;
}

/** Strict HogQL-safe property key: alphanumeric, underscore, dollar prefix. */
const SAFE_PROPERTY_KEY = /^\$?[A-Za-z_][A-Za-z0-9_]*$/u;

export function isSafePropertyKey(key: string): boolean {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= 80 &&
    SAFE_PROPERTY_KEY.test(key)
  );
}

/** Escape a validated property key for HogQL property access. */
export function hogqlPropertyAccess(key: string): string {
  if (!isSafePropertyKey(key)) {
    throw new Error("invalid_property_key");
  }
  // Prefer properties.key form; $ keys are valid identifiers in PostHog.
  return `properties.${key}`;
}

const preferredExact = [
  "$app_version",
  "app_version",
  "appVersion",
  "version",
  "build_number",
  "buildNumber",
  "$app_build",
  "build",
];

const excludedExact = new Set([
  "$lib_version",
  "lib_version",
  "$lib",
  "sdk_version",
  "$sdk_version",
  "posthog_version",
]);

const semverLike =
  /^(v)?\d+(\.\d+){0,3}([-+][0-9A-Za-z.-]+)?$/u;
const buildLike = /^\d{1,10}$/u;

function valueLooksLikeVersion(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 40) return false;
  return semverLike.test(trimmed) || buildLike.test(trimmed);
}

function baseNameScore(key: string): number {
  const index = preferredExact.indexOf(key);
  if (index >= 0) return 100 - index * 8;
  if (excludedExact.has(key)) return -100;
  if (/lib_version|sdk_version|os_version|browser_version/iu.test(key)) {
    return -80;
  }
  if (/(app[_-]?version|build[_-]?(number|id)?)/iu.test(key)) return 50;
  if (/^version$/iu.test(key)) return 40;
  if (/build/iu.test(key)) return 25;
  return 0;
}

export function scoreVersionPropertyCandidate(
  observation: PropertyObservation,
): VersionPropertyCandidate | null {
  if (!isSafePropertyKey(observation.key)) return null;
  if (excludedExact.has(observation.key) && !observation.presentOnSessionEvent) {
    return null;
  }

  const reasons: string[] = [];
  let score = baseNameScore(observation.key);
  if (score <= -50) return null;

  if (observation.presentOnSessionEvent) {
    score += 30;
    reasons.push("present_on_session_event");
  }

  const values = observation.sampleValues.filter(Boolean).slice(0, 20);
  const versionLikeCount = values.filter(valueLooksLikeVersion).length;
  if (values.length > 0) {
    const ratio = versionLikeCount / values.length;
    score += Math.round(ratio * 25);
    if (ratio >= 0.6) reasons.push("semver_or_build_like_values");
  }

  // Bounded cardinality is good; unbounded free text is bad.
  if (observation.distinctCount > 0 && observation.distinctCount <= 40) {
    score += 15;
    reasons.push("bounded_cardinality");
  } else if (observation.distinctCount > 200) {
    score -= 20;
    reasons.push("high_cardinality");
  }

  if (observation.distinctCount >= 2) {
    score += 8;
    reasons.push("multiple_values_observed");
  }

  if (observation.lastSeenAt) {
    const ageMs = Date.now() - Date.parse(observation.lastSeenAt);
    if (Number.isFinite(ageMs) && ageMs < 14 * 24 * 60 * 60 * 1000) {
      score += 8;
      reasons.push("recently_observed");
    }
  }

  if (score < 20) return null;

  return {
    key: observation.key,
    score,
    reasons,
    sampleValues: values.slice(0, 8),
    distinctCount: observation.distinctCount,
    presentOnSessionEvent: observation.presentOnSessionEvent,
  };
}

export function rankVersionPropertyCandidates(
  observations: PropertyObservation[],
): VersionPropertyCandidate[] {
  const ranked = observations
    .map(scoreVersionPropertyCandidate)
    .filter((c): c is VersionPropertyCandidate => c !== null)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  // Dedupe by key
  const seen = new Set<string>();
  const result: VersionPropertyCandidate[] = [];
  for (const candidate of ranked) {
    if (seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    result.push(candidate);
  }
  return result.slice(0, 12);
}

export function suggestVersionProperty(
  observations: PropertyObservation[],
): VersionPropertyCandidate | null {
  return rankVersionPropertyCandidates(observations)[0] ?? null;
}
