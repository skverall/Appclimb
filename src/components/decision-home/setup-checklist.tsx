"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
} from "lucide-react";

import type { SourceProvider, WorkspaceReadiness } from "@/lib/contracts";

type ActionKind = WorkspaceReadiness["primaryAction"]["kind"];

interface SetupStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  current: boolean;
  actionKind?: ActionKind;
  provider?: SourceProvider;
}

interface SetupChecklistProps {
  readiness: WorkspaceReadiness;
  platform?: "iOS" | "Web";
  onActionClick?: (kind: ActionKind, provider?: SourceProvider) => void;
}

/**
 * Task P0.12. While setup is unfinished the checklist stays open with completed
 * steps collapsed into a done row; once a diagnosis exists it degrades to a
 * compact status strip so the diagnosis keeps visual priority.
 */
export function SetupChecklist({
  readiness,
  platform = "iOS",
  onActionClick,
}: SetupChecklistProps) {
  const isSettled =
    readiness.state === "diagnosis_ready" ||
    readiness.state === "no_confirmed_issue";

  // The checklist follows readiness by default and only honours an explicit
  // toggle until readiness changes again — otherwise a workspace that falls
  // back out of `diagnosis_ready` would keep the collapsed strip and hide the
  // steps the user now has to complete.
  const [override, setOverride] = useState<boolean | null>(null);
  const [settledAtRender, setSettledAtRender] = useState(isSettled);
  if (settledAtRender !== isSettled) {
    setSettledAtRender(isSettled);
    setOverride(null);
  }
  const expanded = override ?? !isSettled;
  const setExpanded = (next: boolean) => setOverride(next);

  const steps = buildSteps(readiness, platform);
  const completed = steps.filter((step) => step.completed);
  const remaining = steps.filter((step) => !step.completed);

  if (isSettled && !expanded) {
    return (
      <section className="setup-checklist is-strip" aria-label="Setup status">
        <span className="setup-strip-state">
          <CheckCircle2 size={15} />
          Setup complete
        </span>
        <span className="setup-strip-dots" aria-hidden="true">
          {steps.map((step) => (
            <span
              key={step.id}
              className={step.completed ? "setup-strip-dot is-done" : "setup-strip-dot"}
            />
          ))}
        </span>
        <span className="setup-strip-count">
          {completed.length}/{steps.length} steps
        </span>
        <button
          type="button"
          className="setup-toggle"
          onClick={() => setExpanded(true)}
        >
          Show setup
          <ChevronDown size={14} />
        </button>
      </section>
    );
  }

  return (
    <section className="setup-checklist" aria-label="Setup checklist">
      <div className="setup-checklist-head">
        <div>
          <span className="setup-eyebrow">Data setup</span>
          <strong className="setup-count">
            {completed.length} of {steps.length} steps done
          </strong>
        </div>
        <button
          type="button"
          className="setup-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Collapse" : "Show steps"}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {expanded && (
        <>
          {completed.length > 0 && (
            <ul className="setup-done-row" aria-label="Completed steps">
              {completed.map((step) => (
                <li className="setup-done-chip" key={step.id}>
                  <Check size={12} />
                  {step.title}
                </li>
              ))}
            </ul>
          )}

          <ol className="setup-steps">
            {remaining.map((step) => (
              <li
                key={step.id}
                className={step.current ? "setup-step is-current" : "setup-step"}
              >
                <span className="setup-step-mark" aria-hidden="true">
                  <Circle size={14} />
                </span>
                <div className="setup-step-copy">
                  <strong>{step.title}</strong>
                  <small>{step.description}</small>
                </div>
                {step.current && step.actionKind && step.actionKind !== "wait" && (
                  <button
                    type="button"
                    className="setup-step-action"
                    onClick={() => onActionClick?.(step.actionKind!, step.provider)}
                  >
                    Continue
                    <ArrowRight size={13} />
                  </button>
                )}
              </li>
            ))}
          </ol>

          {remaining.length === 0 && (
            <p className="setup-all-done">
              Every setup step is complete. New data keeps flowing in on the
              normal sync schedule.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function buildSteps(
  readiness: WorkspaceReadiness,
  platform: "iOS" | "Web",
): SetupStep[] {
  const { state } = readiness;

  const productDone = state !== "product_required";
  const connectionDone =
    productDone &&
    state !== "installation_required" &&
    state !== "source_required";
  const signalDone = connectionDone && state !== "source_pending";
  const baselineDone = signalDone && state !== "collecting";
  const diagnosisDone =
    state === "diagnosis_ready" || state === "no_confirmed_issue";

  const connectionStep: SetupStep =
    platform === "Web"
      ? {
          id: "install",
          title: "Install web tracking",
          description: "Deploy the AppClimb snippet on the domain you added.",
          completed: connectionDone,
          current: state === "installation_required",
          actionKind: "install_web_tracking",
        }
      : {
          id: "connect",
          title: "Connect App Store Connect",
          description: "Read-only API key with access to Analytics Reports.",
          completed: connectionDone,
          current: state === "source_required",
          actionKind: "connect_source",
          provider: "app-store-connect",
        };

  return [
    {
      id: "product",
      title: platform === "Web" ? "Add your website" : "Add your iOS app",
      description:
        platform === "Web"
          ? "The domain you want to improve."
          : "The App Store product you want to improve.",
      completed: productDone,
      current: state === "product_required",
      actionKind: "add_product",
    },
    connectionStep,
    {
      id: "first-event",
      title: "Accept the first real event",
      description:
        platform === "Web"
          ? "AppClimb marks the site connected only after a real visit arrives."
          : "Apple has to deliver the first Analytics Report files.",
      completed: signalDone,
      current: state === "source_pending",
      actionKind: "connect_source",
      provider: "posthog",
    },
    {
      id: "baseline",
      title: "Collect a baseline",
      description: "Enough complete days to compare against your own history.",
      completed: baselineDone,
      current: state === "collecting",
    },
    {
      id: "diagnosis",
      title: "Unlock the first diagnosis",
      description: "One confirmed bottleneck with evidence and an action plan.",
      completed: diagnosisDone,
      current: state === "diagnosis_running",
      actionKind: "open_diagnosis",
    },
  ];
}
