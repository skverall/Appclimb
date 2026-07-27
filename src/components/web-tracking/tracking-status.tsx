"use client";

/**
 * Canonical website install status surfaces (Task P0.24).
 *
 * Every place that shows "is this website connected?" renders one of these so
 * the wording cannot drift. A saved domain never reads as a connected source.
 */

import {
  CircleAlert,
  Clock3,
  Globe,
  Radio,
  ShieldCheck,
  Signal,
} from "lucide-react";

import type { WebInstallState, WebInstallStatus } from "./web-install-state";

export interface VerifiedEventDetails {
  /** When the collector accepted the event. */
  acceptedAt: string;
  hostname: string;
  path: string;
  kind: string;
  /** Always "browser" for a real page view; crawler hits never verify. */
  source: string;
  collectorStatus: string;
}

const STATUS_ICON: Record<WebInstallStatus, typeof Globe> = {
  domain_saved: Globe,
  awaiting_deploy: Clock3,
  listening: Radio,
  first_event_verified: ShieldCheck,
  collecting: Signal,
  ready: ShieldCheck,
  stale: CircleAlert,
  error: CircleAlert,
};

export function TrackingStatusPill({
  state,
  showLive = true,
}: {
  state: WebInstallState;
  showLive?: boolean;
}) {
  const Icon = STATUS_ICON[state.status];
  return (
    <span className="wt-status-group">
      <span
        className={`wt-status-pill wt-status-${state.status}`}
        title={state.description}
      >
        <Icon size={13} aria-hidden="true" />
        {state.label}
      </span>
      {showLive && state.live && (
        <span className="wt-status-pill wt-status-live" title="A real event arrived recently">
          <span className="wt-live-dot" aria-hidden="true" />
          Live
        </span>
      )}
    </span>
  );
}

export function TrackingStatusSummary({
  state,
  domain,
  event,
}: {
  state: WebInstallState;
  domain: string;
  event?: VerifiedEventDetails | null;
}) {
  return (
    <div className="wt-status-summary" aria-live="polite">
      <div className="wt-status-summary-head">
        <div>
          <strong>{domain || "No domain yet"}</strong>
          <p>{state.description}</p>
        </div>
        <TrackingStatusPill state={state} />
      </div>

      {event ? (
        <dl className="wt-event-facts">
          <div>
            <dt>Accepted at</dt>
            <dd>{formatTimestamp(event.acceptedAt)}</dd>
          </div>
          <div>
            <dt>Hostname</dt>
            <dd>{event.hostname}</dd>
          </div>
          <div>
            <dt>Path</dt>
            <dd>{event.path}</dd>
          </div>
          <div>
            <dt>Event kind</dt>
            <dd>{event.kind}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{event.source}</dd>
          </div>
          <div>
            <dt>Collector</dt>
            <dd>{event.collectorStatus}</dd>
          </div>
        </dl>
      ) : (
        state.trackingInstalled && (
          <p className="wt-note">
            The first accepted event is recorded, but its details are not
            available in this view.
          </p>
        )
      )}
    </div>
  );
}

export function BaselineProgress({ state }: { state: WebInstallState }) {
  const { baseline } = state;
  if (baseline.progress === null) {
    return (
      <div className="wt-baseline">
        <p className="wt-note">
          Sample size has not been measured yet. AppClimb will not report a
          number it has not counted.
        </p>
      </div>
    );
  }
  const percent = Math.round(baseline.progress * 100);
  return (
    <div className="wt-baseline">
      <div
        className="wt-baseline-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Baseline collection progress"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <ul className="wt-baseline-facts">
        <li>
          <strong>{baseline.sessions ?? 0}</strong>
          <span>of {baseline.targetSessions} sessions</span>
        </li>
        <li>
          <strong>{baseline.days ?? 0}</strong>
          <span>of {baseline.targetDays} days with events</span>
        </li>
        <li>
          <strong>{percent}%</strong>
          <span>toward a usable baseline</span>
        </li>
      </ul>
      <p className="wt-note">
        {state.readyForDiagnosis
          ? "Enough real traffic has been collected to run a web diagnosis."
          : "Acquisition data is already being collected. AppClimb will not claim a bottleneck before the sample supports it."}
      </p>
    </div>
  );
}

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}
