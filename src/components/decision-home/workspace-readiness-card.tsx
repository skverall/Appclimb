"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code,
  Link2,
  PlusCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";

import type {
  CapabilityReadiness,
  SourceProvider,
  WorkspaceReadiness,
} from "@/lib/contracts";

import {
  attentionCause,
  blockerLabel,
  capabilityReason,
  providerLabel,
} from "./readiness-copy";

interface WorkspaceReadinessCardProps {
  readiness: WorkspaceReadiness;
  onActionClick?: (
    kind: WorkspaceReadiness["primaryAction"]["kind"],
    provider?: SourceProvider,
  ) => void;
}

interface StateCopy {
  tone: "amber" | "blue" | "violet" | "teal" | "green" | "coral";
  badge: string;
  headline: string;
  description: string;
  ctaLabel: string;
  icon: ReactNode;
  /** `wait` renders as a status line rather than a button. */
  ctaIsAction: boolean;
}

export function WorkspaceReadinessCard({
  readiness,
  onActionClick,
}: WorkspaceReadinessCardProps) {
  const { state, progress, primaryAction, capabilities, blockers } = readiness;
  const copy = stateCopy(readiness);
  const clampedProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const visibleBlockers = state === "diagnosis_ready" ? [] : blockers;

  return (
    <section
      className={`readiness-card tone-${copy.tone}`}
      aria-label={`Workspace readiness: ${copy.headline}`}
    >
      <div className="readiness-head">
        <span className="readiness-mark" aria-hidden="true">
          {copy.icon}
        </span>
        <div className="readiness-copy">
          <div className="readiness-eyebrow">
            <span className="readiness-badge">{copy.badge}</span>
            <span className="readiness-progress-label">
              {clampedProgress}% complete
            </span>
          </div>
          <h2 className="readiness-headline">{copy.headline}</h2>
          <p className="readiness-description">{copy.description}</p>
        </div>

        {copy.ctaIsAction ? (
          <button
            type="button"
            className="readiness-cta"
            onClick={() =>
              onActionClick?.(primaryAction.kind, primaryAction.provider)
            }
          >
            <span>{copy.ctaLabel}</span>
            <ArrowRight size={16} />
          </button>
        ) : (
          <span className="readiness-waiting">
            <Clock size={15} />
            {copy.ctaLabel}
          </span>
        )}
      </div>

      <div
        className="readiness-meter"
        role="progressbar"
        aria-valuenow={clampedProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Setup progress"
      >
        <span style={{ width: `${Math.max(3, clampedProgress)}%` }} />
      </div>

      <ul className="capability-strip">
        <CapabilityPill label="Acquisition" capability={capabilities.acquisition} />
        <CapabilityPill label="Activation" capability={capabilities.activation} />
        <CapabilityPill
          label="Monetization"
          capability={capabilities.monetization}
        />
        <CapabilityPill label="Retention" capability={capabilities.retention} />
      </ul>

      {visibleBlockers.length > 0 && (
        <ul className="readiness-blockers">
          {visibleBlockers.map((blocker) => (
            <li className="readiness-blocker" key={`${blocker.code}-${blocker.provider ?? ""}`}>
              <AlertCircle size={13} />
              <span>{blockerLabel(blocker.code)}</span>
              {typeof blocker.current === "number" &&
                typeof blocker.target === "number" && (
                  <strong>
                    {blocker.current}/{blocker.target}
                  </strong>
                )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CapabilityPill({
  label,
  capability,
}: {
  label: string;
  capability: CapabilityReadiness;
}) {
  const status = capability.status;
  const stateLabel =
    status === "ready"
      ? "Ready"
      : status === "collecting"
        ? "Collecting"
        : status === "unsupported"
          ? "Not applicable"
          : "Blocked";
  const reason = capabilityReason(capability.reasonCode);

  return (
    <li className={`capability-pill status-${status}`}>
      <span className="capability-label">{label}</span>
      <span className="capability-state">
        {status === "ready" ? (
          <CheckCircle2 size={13} />
        ) : status === "collecting" ? (
          <Clock size={13} />
        ) : (
          <span className="capability-dot" aria-hidden="true" />
        )}
        {stateLabel}
      </span>
      {reason && status !== "ready" && (
        <small className="capability-reason">{reason}</small>
      )}
    </li>
  );
}

function stateCopy(readiness: WorkspaceReadiness): StateCopy {
  const { state, primaryAction, blockers } = readiness;
  const provider = providerLabel(primaryAction.provider);

  switch (state) {
    case "product_required":
      return {
        tone: "amber",
        badge: "Product required",
        headline: "Add the product you want to improve",
        description:
          "AppClimb diagnoses one product at a time. Add an iOS app or a website to start.",
        ctaLabel: "Add iOS app or website",
        icon: <PlusCircle size={18} />,
        ctaIsAction: true,
      };

    case "installation_required":
      return {
        tone: "blue",
        badge: "Setup required",
        headline: "Install web tracking to unlock your first diagnosis",
        description:
          "This domain is not connected yet. AppClimb only calls it connected after it accepts a real event from your site.",
        ctaLabel: "Open install wizard",
        icon: <Code size={18} />,
        ctaIsAction: true,
      };

    case "source_required":
      return {
        tone: "violet",
        badge: "Setup required",
        headline: "Complete data setup to unlock your first diagnosis",
        description: provider
          ? `${provider} is the next required source. AppClimb will not guess a bottleneck without it.`
          : "Connect the next required data source. AppClimb will not guess a bottleneck without it.",
        ctaLabel: provider ? `Connect ${provider}` : "Connect data source",
        icon: <Link2 size={18} />,
        ctaIsAction: true,
      };

    case "source_pending": {
      const pending = blockers.find((b) => b.code === "apple_reports_pending");
      const applePending =
        pending !== undefined || primaryAction.reasonCode === "apple_reports_pending";
      return {
        tone: "blue",
        badge: "Provider pending",
        headline: applePending
          ? "Apple is preparing your first Analytics Reports"
          : `${provider || "The provider"} is preparing your first report files`,
        description:
          "Access is verified and the report request was accepted. The first files have not arrived yet — AppClimb checks again automatically.",
        ctaLabel: provider
          ? `Connect ${provider} while you wait`
          : "Connect another source while you wait",
        icon: <Clock size={18} />,
        ctaIsAction: primaryAction.kind !== "wait",
      };
    }

    case "collecting":
      return {
        tone: "teal",
        badge: "Collecting baseline",
        headline: "Data is live; AppClimb is building a trustworthy baseline",
        description:
          "Metrics are arriving. AppClimb will not name a bottleneck until it has enough complete days to compare against your own history.",
        ctaLabel: "Collecting — no action needed",
        icon: <RefreshCw size={18} />,
        ctaIsAction: primaryAction.kind !== "wait",
      };

    case "diagnosis_running":
      return {
        tone: "teal",
        badge: "Diagnosis running",
        headline: "Running your growth diagnosis",
        description:
          "AppClimb is scoring each stage against your own baseline and picking the earliest confirmed constraint.",
        ctaLabel: "Running — results appear here",
        icon: <Sparkles size={18} />,
        ctaIsAction: primaryAction.kind !== "wait",
      };

    case "diagnosis_ready":
      return {
        tone: "green",
        badge: "Diagnosis ready",
        headline: "Your first confirmed bottleneck is ready",
        description:
          "Every claim below carries its evidence, sample size and time window.",
        ctaLabel: "Open action plan",
        icon: <Sparkles size={18} />,
        ctaIsAction: true,
      };

    case "no_confirmed_issue":
      return {
        tone: "green",
        badge: "No confirmed bottleneck",
        headline: "No confirmed bottleneck in the current window",
        description:
          "Every covered stage stayed inside its own baseline. The stages AppClimb cannot see yet are listed below.",
        ctaLabel: "Review stage coverage",
        icon: <CheckCircle2 size={18} />,
        ctaIsAction: primaryAction.kind !== "wait",
      };

    case "attention":
    default: {
      const cause = attentionCause(
        primaryAction.reasonCode,
        primaryAction.provider,
      );
      return {
        tone: "coral",
        badge: "Attention required",
        headline: cause.title,
        description: cause.detail,
        ctaLabel: cause.ctaLabel,
        icon: <AlertCircle size={18} />,
        ctaIsAction: true,
      };
    }
  }
}
