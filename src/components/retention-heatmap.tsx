import type { RetentionCell } from "@/lib/contracts";

function cellTone(value: number): number {
  if (value === 0) return 0;
  if (value >= 80) return 5;
  if (value >= 55) return 4;
  if (value >= 40) return 3;
  if (value >= 28) return 2;
  return 1;
}

export function RetentionHeatmap({ rows }: { rows: RetentionCell[] }) {
  return (
    <section className="support-card" aria-labelledby="retention-heading">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow">Behavior</span>
          <h2 id="retention-heading">Retention cohorts</h2>
        </div>
        <span className="text-button static-label">PostHog cohorts</span>
      </div>
      <p className="support-subtitle">
        Users returning after their first vehicle
      </p>
      <div className="heatmap" role="table" aria-label="Weekly retention cohorts">
        <div className="heatmap-row heatmap-header" role="row">
          <span role="columnheader">Cohort</span>
          {["W0", "W1", "W2", "W3", "W4", "W5"].map((week) => (
            <span role="columnheader" key={week}>
              {week}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div className="heatmap-row" role="row" key={row.cohort}>
            <span role="rowheader">{row.cohort}</span>
            {row.values.map((value, index) => (
              <span
                role="cell"
                className={`heat-cell tone-${cellTone(value)}`}
                key={`${row.cohort}-${index}`}
                aria-label={`${row.cohort}, week ${index}: ${
                  value === 0 ? "not available" : `${value}%`
                }`}
              >
                {value > 0 ? `${value}%` : "—"}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-note">
        <span className="mini-signal warning" />
        Retention changed with the Jul 9 onboarding release
      </div>
    </section>
  );
}
