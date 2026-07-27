import { ArrowRight, CheckCircle2, Eye, HelpCircle } from "lucide-react";

import type { DashboardSnapshot, GrowthStage, StageId } from "@/lib/contracts";

import { providerLabel } from "./readiness-copy";

interface NoConfirmedIssueCardProps {
  snapshot: DashboardSnapshot;
  /** Next useful step. Without it the card still explains coverage, never a blank screen. */
  onNextStep?: () => void;
  nextStepLabel?: string;
}

const STAGE_ORDER: StageId[] = [
  "discover",
  "store",
  "install",
  "activate",
  "paywall",
  "trial",
  "paid",
  "renew",
];

/**
 * Readiness state F. The plan forbids an empty screen here: the card has to say
 * what was actually covered, what is still unknown, the strongest watch signal,
 * and one useful next step.
 */
export function NoConfirmedIssueCard({
  snapshot,
  onNextStep,
  nextStepLabel,
}: NoConfirmedIssueCardProps) {
  const stages = [...snapshot.stages].sort(
    (a, b) => STAGE_ORDER.indexOf(a.id) - STAGE_ORDER.indexOf(b.id),
  );

  const covered = stages.filter(
    (stage) => stage.health === "healthy" || stage.health === "watch",
  );
  const unknown = stages.filter((stage) => stage.health === "unknown");
  const watch = stages.filter((stage) => stage.health === "watch");
  const strongestWatch = pickStrongestWatch(watch);

  const missingCapabilities = Object.entries(
    snapshot.readiness?.capabilities ?? {},
  )
    .filter(([, capability]) => capability.status !== "ready")
    .map(([name]) => name);

  const fallbackLabel = unknown.length
    ? "Close the coverage gaps"
    : "Review stage detail";

  return (
    <section className="no-issue-card" aria-label="No confirmed bottleneck">
      <div className="no-issue-head">
        <span className="no-issue-mark" aria-hidden="true">
          <CheckCircle2 size={17} />
        </span>
        <div>
          <h3>No confirmed bottleneck in the current window</h3>
          <p>
            {covered.length > 0
              ? `AppClimb compared ${covered.length} covered ${covered.length === 1 ? "stage" : "stages"} against your own baseline and none of them broke a threshold. That is a result about the stages below — not about every stage.`
              : "AppClimb could not confirm a bottleneck because no stage has comparable data in this window yet."}
          </p>
        </div>
      </div>

      <div className="no-issue-columns">
        <div className="no-issue-group is-covered">
          <span>
            <CheckCircle2 size={13} />
            Covered stages ({covered.length})
          </span>
          {covered.length > 0 ? (
            <ul>
              {covered.map((stage) => (
                <li key={stage.id}>
                  <strong>{stage.label}</strong>
                  <span>{stage.formattedValue}</span>
                  <small>{providerLabel(stage.source)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-issue-empty">
              No stage has enough comparable data to be scored yet.
            </p>
          )}
        </div>

        <div className="no-issue-group is-unknown">
          <span>
            <HelpCircle size={13} />
            Still unknown ({unknown.length})
          </span>
          {unknown.length > 0 ? (
            <ul>
              {unknown.map((stage) => (
                <li key={stage.id}>
                  <strong>{stage.label}</strong>
                  <small>
                    {stage.readinessReason ||
                      "No source is reporting this stage yet."}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-issue-empty">
              Every stage in the journey is covered by a live source.
            </p>
          )}
        </div>
      </div>

      <div className="no-issue-watch">
        <span>
          <Eye size={13} />
          Strongest watch signal
        </span>
        {strongestWatch ? (
          <p>
            <strong>{strongestWatch.label}</strong> is inside its threshold but
            closest to breaking it
            {typeof strongestWatch.conversionRate === "number"
              ? ` at ${formatRate(strongestWatch.conversionRate)} conversion`
              : ""}
            . Nothing is confirmed here — it is the stage to re-check first next
            window.
          </p>
        ) : (
          <p>
            No stage is trending toward a threshold in this window. AppClimb is
            not flagging one just to fill the space.
          </p>
        )}
      </div>

      {missingCapabilities.length > 0 && (
        <p className="no-issue-note">
          Not every capability is connected:{" "}
          {missingCapabilities.join(", ")}. A bottleneck may exist in a part of
          the journey AppClimb cannot see yet.
        </p>
      )}

      {onNextStep && (
        <button type="button" className="readiness-cta" onClick={onNextStep}>
          <span>{nextStepLabel ?? fallbackLabel}</span>
          <ArrowRight size={16} />
        </button>
      )}
    </section>
  );
}

function pickStrongestWatch(watch: GrowthStage[]): GrowthStage | undefined {
  if (watch.length === 0) return undefined;
  const rated = watch.filter((stage) => typeof stage.conversionRate === "number");
  if (rated.length === 0) return watch[0];
  return rated.reduce((worst, stage) =>
    (stage.conversionRate ?? 1) < (worst.conversionRate ?? 1) ? stage : worst,
  );
}

function formatRate(rate: number): string {
  const percent = rate <= 1 ? rate * 100 : rate;
  return `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
}
