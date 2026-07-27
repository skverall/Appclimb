"use me";
import React from "react";
import { CheckCircle2, ShieldAlert, Target, StopCircle, ArrowUpRight } from "lucide-react";
import type { ActionPlan } from "@/lib/contracts";

interface ActionPlanPreviewProps {
  plan: ActionPlan;
  onCreateExperiment?: () => void;
}

export function ActionPlanPreview({ plan, onCreateExperiment }: ActionPlanPreviewProps) {
  const { problem, desiredOutcome, whyThisAction, steps, primaryMetric, guardrails, stopCondition } = plan;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-6 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
            Structured Action Plan
          </span>
          <h3 className="mt-1 text-lg font-bold text-slate-100">
            {desiredOutcome}
          </h3>
        </div>

        {onCreateExperiment && (
          <button
            onClick={onCreateExperiment}
            className="flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3.5 py-2 text-xs font-semibold text-teal-300 transition-all hover:bg-teal-500/20"
          >
            <span>Create Experiment</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Problem & Why */}
      <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-950/50 p-3 border border-slate-800">
          <span className="text-xs font-medium text-slate-500">Problem Identified</span>
          <p className="mt-1 font-medium text-slate-200">{problem}</p>
        </div>
        <div className="rounded-lg bg-slate-950/50 p-3 border border-slate-800">
          <span className="text-xs font-medium text-slate-500">Why This Action</span>
          <p className="mt-1 font-medium text-slate-200">{whyThisAction}</p>
        </div>
      </div>

      {/* Action Steps */}
      <div className="mt-5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Implementation Steps
        </h4>
        <div className="mt-3 space-y-2.5">
          {steps.map((step) => (
            <div
              key={step.order}
              className="flex items-start gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 p-3"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-xs font-bold text-teal-400 border border-teal-500/20">
                {step.order}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-sm font-semibold text-slate-200">{step.title}</h5>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      step.effort === "small"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : step.effort === "medium"
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {step.effort} effort
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">{step.instruction}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics & Guardrails */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <Target className="mt-0.5 h-4 w-4 text-teal-400" />
          <div>
            <span className="text-xs font-medium text-slate-400">Primary Metric</span>
            <p className="text-sm font-bold text-slate-100">{primaryMetric.label}</p>
            <span className="text-[11px] text-teal-400">
              Target Direction: {primaryMetric.targetDirection.toUpperCase()}
            </span>
          </div>
        </div>

        {guardrails.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-400" />
            <div>
              <span className="text-xs font-medium text-slate-400">Guardrail Metric</span>
              <p className="text-sm font-bold text-slate-100">{guardrails[0].label}</p>
              <span className="text-[11px] text-amber-400">
                Do not degrade during test
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Stop Condition */}
      {stopCondition && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-950/80 px-3.5 py-2 text-xs text-slate-400 border border-slate-800">
          <StopCircle className="h-4 w-4 text-slate-500 shrink-0" />
          <span><strong className="text-slate-300">Stop Condition:</strong> {stopCondition}</span>
        </div>
      )}
    </div>
  );
}
