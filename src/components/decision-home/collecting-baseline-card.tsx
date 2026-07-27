import { CalendarClock, Database, Eye, EyeOff } from "lucide-react";

interface CollectingBaselineCardProps {
  /**
   * Metric points already collected. Omit when the number is unknown — the card
   * shows "Not reported yet" rather than inventing a sample.
   */
  sampleSize?: number;
  /** Complete days collected so far. Omit when unknown. */
  completeDays?: number;
  /** Minimum complete days required before diagnosis runs. */
  minDaysRequired?: number;
  /** Minimum sample the diagnosis engine requires, when the backend states it. */
  minSampleRequired?: number;
  /** Next automatic sync, ISO string, when the backend states it. */
  nextCheckAt?: string;
  /** What the user can already trust today. */
  availableNow?: string[];
  /** What cannot be claimed yet at this sample. */
  notYetClaimable?: string[];
}

export function CollectingBaselineCard({
  sampleSize,
  completeDays,
  minDaysRequired,
  minSampleRequired,
  nextCheckAt,
  availableNow = [
    "Raw metric values per day, exactly as each source reported them",
    "Which sources are live and when they last delivered data",
  ],
  notYetClaimable = [
    "Which stage is the bottleneck — that needs a full baseline",
    "Whether a change helped, since there is no stable comparison period yet",
  ],
}: CollectingBaselineCardProps) {
  const hasDayProgress =
    typeof completeDays === "number" && typeof minDaysRequired === "number";
  const dayProgress = hasDayProgress
    ? Math.min(100, Math.round((completeDays / Math.max(1, minDaysRequired)) * 100))
    : 0;

  return (
    <section className="baseline-card" aria-label="Baseline collection progress">
      <div className="baseline-head">
        <span className="baseline-mark" aria-hidden="true">
          <Database size={17} />
        </span>
        <div>
          <h3>Data is live; AppClimb is building a trustworthy baseline</h3>
          <p>
            A diagnosis is only honest once it can compare a stage against your
            own history. Here is exactly how far along that is.
          </p>
        </div>
      </div>

      <div className="baseline-metrics">
        <div className="baseline-metric">
          <span>
            <CalendarClock size={13} />
            Complete days
          </span>
          <strong>
            {typeof completeDays === "number" ? (
              minDaysRequired ? `${completeDays} / ${minDaysRequired}` : completeDays
            ) : (
              <span className="fact-unreported">Not reported yet</span>
            )}
          </strong>
          {hasDayProgress && (
            <span
              className="baseline-meter"
              role="progressbar"
              aria-valuenow={dayProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Complete days collected"
            >
              <span style={{ width: `${Math.max(3, dayProgress)}%` }} />
            </span>
          )}
        </div>

        <div className="baseline-metric">
          <span>
            <Database size={13} />
            Metric points collected
          </span>
          <strong>
            {typeof sampleSize === "number" ? (
              sampleSize.toLocaleString("en-US")
            ) : (
              <span className="fact-unreported">Not reported yet</span>
            )}
          </strong>
          {typeof minSampleRequired === "number" && (
            <small>Minimum required: {minSampleRequired.toLocaleString("en-US")}</small>
          )}
        </div>

        {nextCheckAt && (
          <div className="baseline-metric">
            <span>
              <CalendarClock size={13} />
              Next automatic check
            </span>
            <strong>{formatMoment(nextCheckAt)}</strong>
          </div>
        )}
      </div>

      <div className="baseline-lists">
        <div className="baseline-list">
          <span>
            <Eye size={13} />
            You can already see
          </span>
          <ul>
            {availableNow.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="baseline-list is-muted">
          <span>
            <EyeOff size={13} />
            Not claimable yet
          </span>
          <ul>
            {notYetClaimable.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function formatMoment(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(parsed);
}
