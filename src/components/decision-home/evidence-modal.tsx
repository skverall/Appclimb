"use client";

import { useEffect } from "react";
import { ArrowRight, Calendar, Database, Info, ShieldCheck, X } from "lucide-react";

import type { ComparisonType, Evidence } from "@/lib/contracts";

import { providerLabel } from "./readiness-copy";

interface EvidenceModalProps {
  evidence: Evidence;
  /**
   * Comparison basis for the stage this evidence belongs to. Omitted when the
   * backend has not classified it — the modal then says so instead of implying
   * a same-source funnel.
   */
  comparisonType?: ComparisonType;
  /** Sample behind the evidence, when the backend reports it. */
  sampleSize?: number;
  onClose: () => void;
  onOpenActionPlan?: () => void;
}

const COMPARISON_COPY: Record<
  ComparisonType,
  { label: string; description: string }
> = {
  same_source_funnel: {
    label: "Same-source funnel",
    description:
      "Both values come from one provider inside one collection boundary, so the ratio between them is a real conversion rate.",
  },
  cohort: {
    label: "Cohort comparison",
    description:
      "Values are aligned by the date a user entered the cohort, not by calendar day, so late conversions are attributed to the right group.",
  },
  time_baseline: {
    label: "Own time baseline",
    description:
      "The observed value is compared against this product's own earlier window. No external benchmark is involved.",
  },
  aggregate_directional: {
    label: "Aggregate, directional only",
    description:
      "The two values come from different providers aligned only by UTC day. Treat the gap as a direction to investigate, not as a conversion rate.",
  },
  not_comparable: {
    label: "Not directly comparable",
    description:
      "These values do not share a population or a time alignment. AppClimb reports them side by side but draws no ratio between them.",
  },
};

export function EvidenceModal({
  evidence,
  comparisonType,
  sampleSize,
  onClose,
  onOpenActionPlan,
}: EvidenceModalProps) {
  const { title, finding, source, metricKeys, window: evidenceWindow, confidence, before, after } =
    evidence;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const comparison = comparisonType ? COMPARISON_COPY[comparisonType] : undefined;

  return (
    <div
      className="decision-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence: ${title}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="decision-dialog evidence-dialog">
        <div className="decision-dialog-head">
          <span className="decision-dialog-mark" aria-hidden="true">
            <Database size={16} />
          </span>
          <div>
            <span className="decision-dialog-eyebrow">Evidence</span>
            <h3>{title}</h3>
          </div>
          <button
            type="button"
            className="decision-dialog-close"
            onClick={onClose}
            aria-label="Close evidence"
          >
            <X size={17} />
          </button>
        </div>

        <div className="decision-dialog-body">
          <p className="evidence-finding">{finding}</p>

          <div className="evidence-comparison-pair">
            <div>
              <span>{before.label}</span>
              <strong>{before.value}</strong>
            </div>
            <div className="is-observed">
              <span>{after.label}</span>
              <strong>{after.value}</strong>
            </div>
          </div>

          <dl className="evidence-meta">
            <div>
              <dt>Source</dt>
              <dd>{providerLabel(source)}</dd>
            </div>
            <div>
              <dt>
                <ShieldCheck size={13} /> Confidence
              </dt>
              <dd>{confidence}</dd>
            </div>
            <div>
              <dt>Sample size</dt>
              <dd>
                {typeof sampleSize === "number" ? (
                  sampleSize.toLocaleString("en-US")
                ) : (
                  <span className="fact-unreported">Not reported</span>
                )}
              </dd>
            </div>
            <div>
              <dt>
                <Calendar size={13} /> Window
              </dt>
              <dd>
                {evidenceWindow.from.slice(0, 10)} → {evidenceWindow.to.slice(0, 10)}
              </dd>
            </div>
            <div className="is-wide">
              <dt>Metric keys</dt>
              <dd className="evidence-keys">{metricKeys.join(", ")}</dd>
            </div>
          </dl>

          <p className="evidence-note">
            <Info size={14} />
            <span>
              <strong>Comparison basis:</strong>{" "}
              {comparison
                ? `${comparison.label}. ${comparison.description}`
                : "Not classified by the diagnosis run. AppClimb is showing both values without claiming a conversion rate between them."}
            </span>
          </p>
        </div>

        <div className="decision-dialog-foot">
          <button type="button" className="decision-dialog-dismiss" onClick={onClose}>
            Close
          </button>
          {onOpenActionPlan && (
            <button
              type="button"
              className="readiness-cta"
              onClick={() => {
                onClose();
                onOpenActionPlan();
              }}
            >
              <span>Open action plan</span>
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
