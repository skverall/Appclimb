"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, FlaskConical, ShieldAlert, Target, X } from "lucide-react";

import type {
  ActionPlan,
  Experiment,
  SourceProvider,
  StageId,
} from "@/lib/contracts";

import { providerLabel } from "./readiness-copy";

interface ExperimentCreationModalProps {
  plan: ActionPlan;
  /** Stage the experiment belongs to when the plan does not name one. */
  stageId?: StageId;
  /** Source that will measure the experiment when the plan does not name one. */
  source?: SourceProvider;
  onClose: () => void;
  onCreateExperiment: (experiment: Partial<Experiment>) => void;
}

const DURATIONS = [
  { days: 7, label: "7 days — quick directional signal" },
  { days: 14, label: "14 days — recommended" },
  { days: 30, label: "30 days — full monthly cohort" },
];

export function ExperimentCreationModal({
  plan,
  stageId,
  source,
  onClose,
  onCreateExperiment,
}: ExperimentCreationModalProps) {
  const [title, setTitle] = useState(plan.desiredOutcome);
  const [hypothesis, setHypothesis] = useState(plan.whyThisAction);
  const [durationDays, setDurationDays] = useState(14);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const effectiveStageId = plan.targetStageId ?? stageId;
  const effectiveSource = plan.sourceProviders?.[0] ?? source;
  const canSubmit = Boolean(effectiveStageId && effectiveSource);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!effectiveStageId || !effectiveSource) return;

    const startedAt = new Date();
    const endedAt = new Date(
      startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000,
    );

    onCreateExperiment({
      title,
      hypothesis,
      stageId: effectiveStageId,
      primaryMetric: plan.primaryMetric.label,
      guardrailMetric: plan.guardrails[0]?.label ?? "",
      status: "draft",
      source: effectiveSource,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      evidenceIds: plan.evidenceIds,
    });
    onClose();
  };

  return (
    <div
      className="decision-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Create experiment"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="decision-dialog experiment-dialog">
        <div className="decision-dialog-head">
          <span className="decision-dialog-mark" aria-hidden="true">
            <FlaskConical size={16} />
          </span>
          <div>
            <span className="decision-dialog-eyebrow">Lab</span>
            <h3>Create new experiment</h3>
          </div>
          <button
            type="button"
            className="decision-dialog-close"
            onClick={onClose}
            aria-label="Close experiment form"
          >
            <X size={17} />
          </button>
        </div>

        <form className="decision-dialog-body" onSubmit={handleSubmit}>
          <label className="decision-field">
            <span>Experiment title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>

          <label className="decision-field">
            <span>Hypothesis</span>
            <textarea
              rows={3}
              value={hypothesis}
              onChange={(event) => setHypothesis(event.target.value)}
              required
            />
          </label>

          <div className="experiment-fixed">
            <div>
              <span>
                <Target size={13} /> Primary metric
              </span>
              <strong>{plan.primaryMetric.label}</strong>
              <small>
                {effectiveStageId
                  ? `${effectiveStageId} stage · should move ${plan.primaryMetric.targetDirection}`
                  : `Should move ${plan.primaryMetric.targetDirection}`}
              </small>
            </div>
            <div>
              <span>
                <ShieldAlert size={13} /> Guardrail
              </span>
              <strong>
                {plan.guardrails[0]?.label ?? (
                  <span className="fact-unreported">None defined</span>
                )}
              </strong>
              <small>
                {effectiveSource
                  ? `Measured with ${providerLabel(effectiveSource)}`
                  : "No measuring source attached"}
              </small>
            </div>
          </div>

          <label className="decision-field">
            <span>Planned duration</span>
            <select
              value={durationDays}
              onChange={(event) => setDurationDays(Number(event.target.value))}
            >
              {DURATIONS.map((option) => (
                <option key={option.days} value={option.days}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {plan.stopCondition && (
            <p className="experiment-stop">
              <strong>Stop condition:</strong> {plan.stopCondition}
            </p>
          )}

          {!canSubmit && (
            <p className="experiment-blocked">
              This plan is not attached to a stage and a measuring source yet, so
              AppClimb cannot save an experiment that it could actually measure.
            </p>
          )}

          <div className="decision-dialog-foot">
            <button
              type="button"
              className="decision-dialog-dismiss"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="readiness-cta" disabled={!canSubmit}>
              <span>Save draft experiment</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
