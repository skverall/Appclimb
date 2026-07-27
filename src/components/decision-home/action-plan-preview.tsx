"use client";

import { ArrowUpRight, ShieldAlert, StopCircle, Target } from "lucide-react";

import type { ActionPlan } from "@/lib/contracts";

interface ActionPlanPreviewProps {
  plan: ActionPlan;
  onCreateExperiment?: () => void;
}

export function ActionPlanPreview({
  plan,
  onCreateExperiment,
}: ActionPlanPreviewProps) {
  const {
    problem,
    desiredOutcome,
    whyThisAction,
    steps,
    primaryMetric,
    guardrails,
    stopCondition,
    prerequisites,
  } = plan;

  return (
    <article className="plan-card" aria-label="Structured action plan">
      <div className="plan-card-head">
        <div>
          <span className="plan-eyebrow">Action plan</span>
          <h3 className="plan-title">{desiredOutcome}</h3>
        </div>
        {onCreateExperiment && (
          <button
            type="button"
            className="plan-secondary-cta"
            onClick={onCreateExperiment}
          >
            Create experiment
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>

      <div className="plan-context">
        <div className="plan-context-cell">
          <span>Problem</span>
          <p>{problem}</p>
        </div>
        <div className="plan-context-cell">
          <span>Why this action</span>
          <p>{whyThisAction}</p>
        </div>
      </div>

      {prerequisites.length > 0 && (
        <div className="plan-prereqs">
          <span>Before you start</span>
          <ul>
            {prerequisites.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {steps.length > 0 && (
        <>
          <span className="plan-steps-heading">Steps</span>
          <ol className="plan-steps">
            {steps.map((step) => (
              <li className="plan-step" key={step.order}>
                <span className="plan-step-order">{step.order}</span>
                <div className="plan-step-body">
                  <div className="plan-step-title">
                    <strong>{step.title}</strong>
                    <span className={`plan-step-effort effort-${step.effort}`}>
                      {step.effort} effort
                    </span>
                  </div>
                  <p>{step.instruction}</p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="plan-metrics">
        <div className="plan-metric">
          <Target size={15} />
          <div>
            <span>Primary metric</span>
            <strong>{primaryMetric.label}</strong>
            <small>
              Should move {primaryMetric.targetDirection}
              {typeof primaryMetric.successThreshold === "number"
                ? ` · success at ${primaryMetric.successThreshold}`
                : ""}
            </small>
          </div>
        </div>

        {guardrails.length > 0 && (
          <div className="plan-metric is-guardrail">
            <ShieldAlert size={15} />
            <div>
              <span>
                {guardrails.length > 1 ? "Guardrail metrics" : "Guardrail metric"}
              </span>
              <strong>{guardrails.map((item) => item.label).join(", ")}</strong>
              <small>Must not degrade while the test runs</small>
            </div>
          </div>
        )}
      </div>

      {stopCondition && (
        <p className="plan-stop">
          <StopCircle size={15} />
          <span>
            <strong>Stop condition:</strong> {stopCondition}
          </span>
        </p>
      )}
    </article>
  );
}
