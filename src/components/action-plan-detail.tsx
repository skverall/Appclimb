"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  FlaskConical,
  Gauge,
  ListChecks,
  MapPin,
  ShieldAlert,
  ShieldCheck,
  StopCircle,
  Target,
} from "lucide-react";

import type {
  ActionPlan,
  ActionProposal,
  Evidence,
  Insight,
} from "@/lib/contracts";
import {
  FEEDBACK_REASON_REQUIRED,
  INSIGHT_FEEDBACK_LABELS,
  type InsightFeedbackAction,
} from "@/lib/experiments";

const SOURCE_LABELS: Record<string, string> = {
  "app-store-connect": "App Store Connect",
  revenuecat: "RevenueCat",
  posthog: "PostHog",
  superwall: "Superwall",
  "appclimb-rank": "AppClimb Rank",
};

function formatPercent(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return null;
  return value > 0 && value <= 1
    ? `${(value * 100).toFixed(1)}%`
    : value.toLocaleString("en-US");
}

/**
 * The action-plan detail surface (plan task P0.8 consumer).
 *
 * Commit 2e66804 added the structured `ActionPlan` type, the `structured_plan`
 * column and the deterministic playbooks, but the only reader was a preview
 * card, so a founder could never see the full plan or turn it into an
 * experiment. This panel answers the six questions the plan requires — what to
 * change, where, why this action, how to measure, when the result is valid, and
 * when to stop or roll back — and refuses to render a generic recommendation
 * when the diagnosis has not produced a structured plan.
 */
export function ActionPlanDetail({
  plan,
  insight,
  proposal,
  evidence,
  experimentExists,
  busy,
  onCreateExperiment,
  onFeedback,
  feedbackState,
  feedbackError,
}: {
  plan?: ActionPlan;
  insight: Insight;
  proposal?: ActionProposal;
  evidence: Evidence[];
  experimentExists: boolean;
  busy?: boolean;
  onCreateExperiment: () => void;
  onFeedback?: (action: InsightFeedbackAction, reason: string) => void;
  feedbackState?: string;
  feedbackError?: string;
}) {
  const [reasonFor, setReasonFor] = useState<InsightFeedbackAction | null>(null);
  const [reason, setReason] = useState("");

  const planEvidenceIds = plan?.evidenceIds?.length
    ? plan.evidenceIds
    : insight.evidenceIds;
  const linkedEvidence = evidence.filter((item) =>
    planEvidenceIds.includes(item.id),
  );

  if (!plan) {
    return (
      <section className="action-plan-panel" aria-labelledby="action-plan-title">
        <div className="action-plan-empty">
          <AlertTriangle size={22} aria-hidden="true" />
          <h3 id="action-plan-title">No structured action plan yet</h3>
          <p>
            This insight has no deterministic plan attached, so AppClimb will
            not invent one. A plan appears once a diagnosis run produces the
            stage playbook, the primary metric and the evidence IDs it must
            trace to.
          </p>
          {proposal && (
            <p className="action-plan-empty-proposal">
              Recorded proposal: <strong>{proposal.title}</strong> —{" "}
              {proposal.rationale}
            </p>
          )}
        </div>
      </section>
    );
  }

  const submitFeedback = (action: InsightFeedbackAction) => {
    if (!onFeedback) return;
    if (FEEDBACK_REASON_REQUIRED.includes(action)) {
      if (reasonFor !== action) {
        setReasonFor(action);
        setReason("");
        return;
      }
      if (!reason.trim()) return;
      onFeedback(action, reason.trim());
      setReasonFor(null);
      setReason("");
      return;
    }
    onFeedback(action, "");
  };

  return (
    <section className="action-plan-panel" aria-labelledby="action-plan-title">
      <header className="action-plan-header">
        <span className="proposal-large-icon">
          <ClipboardList size={20} aria-hidden="true" />
        </span>
        <div>
          <span className="eyebrow">Structured action plan</span>
          <h3 id="action-plan-title">{plan.desiredOutcome}</h3>
          <p>{plan.problem}</p>
        </div>
        <button
          className="primary-action"
          type="button"
          onClick={onCreateExperiment}
          disabled={busy}
        >
          <FlaskConical size={16} aria-hidden="true" />
          {experimentExists
            ? "Open saved experiment"
            : busy
              ? "Saving…"
              : "Create experiment"}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </header>

      <div className="action-plan-section">
        <h4>
          <ListChecks size={15} aria-hidden="true" /> What to change, and where
        </h4>
        {plan.steps.length ? (
          <ol className="action-plan-steps">
            {plan.steps.map((step) => (
              <li key={`${step.order}-${step.title}`}>
                <span className="action-plan-step-order">{step.order}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.instruction}</p>
                  <small>{step.effort} effort</small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="action-plan-missing">
            This plan records no steps. AppClimb will not fill the gap with a
            generic recommendation.
          </p>
        )}
        {plan.prerequisites.length > 0 && (
          <div className="action-plan-chiprow">
            <MapPin size={14} aria-hidden="true" />
            <span>Needs first:</span>
            {plan.prerequisites.map((item) => (
              <i key={item}>{item}</i>
            ))}
          </div>
        )}
        {plan.sourceProviders?.length ? (
          <div className="action-plan-chiprow">
            <Gauge size={14} aria-hidden="true" />
            <span>Systems involved:</span>
            {plan.sourceProviders.map((provider) => (
              <i key={provider}>{SOURCE_LABELS[provider] ?? provider}</i>
            ))}
          </div>
        ) : null}
      </div>

      <div className="action-plan-section">
        <h4>
          <Target size={15} aria-hidden="true" /> Why this action
        </h4>
        <p>{plan.whyThisAction}</p>
        {linkedEvidence.length > 0 && (
          <ul className="action-plan-evidence">
            {linkedEvidence.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.finding}</span>
                <code>{item.id}</code>
              </li>
            ))}
          </ul>
        )}
        <p className="action-plan-trace">
          Traced to evidence {planEvidenceIds.join(" · ") || "—"} · insight{" "}
          {insight.id}
        </p>
      </div>

      <div className="action-plan-grid">
        <div className="action-plan-section">
          <h4>
            <Gauge size={15} aria-hidden="true" /> How to measure
          </h4>
          <div className="action-plan-metric">
            <small>Primary metric</small>
            <strong>{plan.primaryMetric.label}</strong>
            <span>
              Move it {plan.primaryMetric.targetDirection}
              {plan.primaryMetric.current !== undefined
                ? ` from ${formatPercent(plan.primaryMetric.current)}`
                : ""}
              {plan.primaryMetric.successThreshold !== undefined
                ? ` · success at ${formatPercent(plan.primaryMetric.successThreshold)}`
                : ""}
            </span>
          </div>
          {plan.instrumentation.length > 0 && (
            <div className="action-plan-chiprow">
              <span>Instrumentation:</span>
              {plan.instrumentation.map((item) => (
                <i key={item}>{item}</i>
              ))}
            </div>
          )}
        </div>

        <div className="action-plan-section">
          <h4>
            <ShieldAlert size={15} aria-hidden="true" /> When the result is valid
          </h4>
          <ul className="action-plan-conditions">
            <li>
              <span>Segment</span>
              <strong>{plan.segment ?? "All users in the diagnosis window"}</strong>
            </li>
            <li>
              <span>Minimum sample</span>
              <strong>
                {plan.minimumSample
                  ? plan.minimumSample.toLocaleString("en-US")
                  : "Not specified by this playbook"}
              </strong>
            </li>
            <li>
              <span>Complete days</span>
              <strong>
                {plan.minimumCompleteDays
                  ? `${plan.minimumCompleteDays} complete UTC days`
                  : "Not specified by this playbook"}
              </strong>
            </li>
          </ul>
        </div>
      </div>

      <div className="action-plan-section action-plan-stop">
        <h4>
          <StopCircle size={15} aria-hidden="true" /> When to stop or roll back
        </h4>
        <p>
          <strong>Stop:</strong> {plan.stopCondition}
        </p>
        {plan.rollbackCondition && (
          <p>
            <strong>Roll back:</strong> {plan.rollbackCondition}
          </p>
        )}
        {plan.guardrails.length > 0 && (
          <ul className="action-plan-guardrails">
            {plan.guardrails.map((guardrail) => (
              <li key={guardrail.key}>
                <ShieldCheck size={14} aria-hidden="true" />
                <strong>{guardrail.label}</strong>
                {guardrail.failureThreshold !== undefined && (
                  <span>
                    fails below {formatPercent(guardrail.failureThreshold)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {proposal && onFeedback && (
        <div className="insight-feedback">
          <div>
            <strong>Is this the right call?</strong>
            <p>
              Feedback is stored with a reason and an audit event. It never
              changes anything in App Store Connect, PostHog, RevenueCat or
              Superwall.
            </p>
          </div>
          <div className="insight-feedback-actions">
            {(
              [
                "accept",
                "dismiss",
                "not_relevant",
                "mapping_wrong",
              ] as InsightFeedbackAction[]
            ).map((action) => (
              <button
                key={action}
                type="button"
                className={
                  reasonFor === action
                    ? "insight-feedback-button active"
                    : "insight-feedback-button"
                }
                onClick={() => submitFeedback(action)}
                disabled={busy}
              >
                {INSIGHT_FEEDBACK_LABELS[action]}
              </button>
            ))}
          </div>
          {reasonFor && (
            <div className="insight-feedback-reason">
              <label htmlFor="insight-feedback-reason-input">
                Why is it wrong? This is stored with the decision.
              </label>
              <textarea
                id="insight-feedback-reason-input"
                value={reason}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. activation is mapped to the wrong PostHog event"
              />
              <div>
                <button
                  type="button"
                  className="primary-action"
                  disabled={!reason.trim() || busy}
                  onClick={() => submitFeedback(reasonFor)}
                >
                  Save feedback
                </button>
                <button
                  type="button"
                  className="insight-feedback-button"
                  onClick={() => {
                    setReasonFor(null);
                    setReason("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {feedbackState && (
            <p className="insight-feedback-state" role="status">
              {feedbackState}
            </p>
          )}
          {feedbackError && (
            <p className="insight-feedback-state is-error" role="alert">
              {feedbackError}
            </p>
          )}
        </div>
      )}

      <p className="proof-strip">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>
          Proposal only. AppClimb never edits your App Store listing, paywall,
          product or analytics configuration.
        </span>
      </p>
    </section>
  );
}
