import type { Opportunity } from "@/lib/aso";

export function OpportunityPill({
  opportunity,
  compact = false,
}: {
  opportunity: Opportunity;
  compact?: boolean;
}) {
  return (
    <span
      className={`opp-pill opp-pill--${opportunity.verdict}${compact ? " opp-pill--compact" : ""}`}
      title={opportunity.reason}
    >
      <b>{opportunity.score}</b>
      {opportunity.label}
    </span>
  );
}

export function DeltaBadge({
  delta,
  suffix,
}: {
  delta: number | null;
  suffix?: string;
}) {
  if (delta === null) return null;
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
  return (
    <span
      className={`delta-badge delta-badge--${tone}`}
      title={suffix ? `Change over ${suffix.replace("w", " weeks")}` : undefined}
    >
      {arrow} {Math.abs(delta)}
      {suffix ? <small>{suffix}</small> : null}
    </span>
  );
}
