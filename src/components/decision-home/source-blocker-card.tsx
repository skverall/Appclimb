"use client";

import { ArrowRight, Clock, ShieldAlert } from "lucide-react";

import type { SourceProvider } from "@/lib/contracts";

import { attentionCause, providerLabel } from "./readiness-copy";

interface SourceBlockerCardProps {
  provider: SourceProvider;
  errorCode: string;
  /** Last automatic check, ISO string, when the backend reports it. */
  lastCheckedAt?: string | null;
  /** Next automatic check, ISO string, when the backend reports it. */
  nextCheckAt?: string | null;
  onFix?: () => void;
  /** Overrides the CTA label when the caller routes somewhere more specific. */
  fixLabel?: string;
}

export function SourceBlockerCard({
  provider,
  errorCode,
  lastCheckedAt,
  nextCheckAt,
  onFix,
  fixLabel,
}: SourceBlockerCardProps) {
  const name = providerLabel(provider);
  const isProviderPending = errorCode === "no_data_in_window";

  const cause = isProviderPending
    ? {
        title:
          provider === "app-store-connect"
            ? "Apple is preparing your first Analytics Reports"
            : `${name} has not returned data for this window yet`,
        detail:
          provider === "app-store-connect"
            ? "Access is verified and the report request was accepted. Apple has not delivered the first files yet, so nothing is missing on your side."
            : `${name} is authorized but returned no rows for the selected window.`,
        ctaLabel: "Check status now",
      }
    : attentionCause(errorCode, provider);

  return (
    <section
      className={
        isProviderPending ? "blocker-card is-pending" : "blocker-card"
      }
      aria-label={`${name}: ${cause.title}`}
    >
      <span className="blocker-mark" aria-hidden="true">
        {isProviderPending ? <Clock size={17} /> : <ShieldAlert size={17} />}
      </span>

      <div className="blocker-copy">
        <span className="blocker-eyebrow">
          {isProviderPending ? "Provider pending" : "Attention required"} · {name}
        </span>
        <h3>{cause.title}</h3>
        <p>{cause.detail}</p>

        {(lastCheckedAt || nextCheckAt) && (
          <dl className="blocker-facts">
            {lastCheckedAt && (
              <div>
                <dt>Last checked</dt>
                <dd>{formatMoment(lastCheckedAt)}</dd>
              </div>
            )}
            {nextCheckAt && (
              <div>
                <dt>Next automatic check</dt>
                <dd>{formatMoment(nextCheckAt)}</dd>
              </div>
            )}
          </dl>
        )}

        <code className="blocker-code">{errorCode}</code>
      </div>

      {onFix && (
        <button type="button" className="blocker-cta" onClick={onFix}>
          <span>{fixLabel ?? cause.ctaLabel}</span>
          <ArrowRight size={15} />
        </button>
      )}
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
