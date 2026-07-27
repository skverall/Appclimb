"use me";
import React, { useState } from "react";
import { X, FlaskConical, Target, ShieldAlert, ArrowRight } from "lucide-react";
import type { ActionPlan, Experiment, StageId } from "@/lib/contracts";

interface ExperimentCreationModalProps {
  plan: ActionPlan;
  onClose: () => void;
  onCreateExperiment: (experiment: Partial<Experiment>) => void;
}

export function ExperimentCreationModal({
  plan,
  onClose,
  onCreateExperiment,
}: ExperimentCreationModalProps) {
  const [title, setTitle] = useState(plan.desiredOutcome);
  const [hypothesis, setHypothesis] = useState(plan.whyThisAction);
  const [durationDays, setDurationDays] = useState(14);
  const [variantA, setVariantA] = useState("Control (Current baseline)");
  const [variantB, setVariantB] = useState(plan.steps[0]?.title || "Proposed Optimization");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newExperiment: Partial<Experiment> = {
      title,
      hypothesis,
      stageId: (plan.targetStageId || "store") as StageId,
      primaryMetric: plan.primaryMetric.label,
      guardrailMetric: plan.guardrails[0]?.label || "Downstream retention",
      status: "draft",
      source: "appclimb-rank",
      startedAt: new Date().toISOString(),
    };

    onCreateExperiment(newExperiment);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <FlaskConical className="h-4 w-4" />
            </span>
            <div>
              <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
                Growth Experimentation
              </span>
              <h3 className="text-base font-bold text-slate-100">Create New Experiment</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-h-[75vh] overflow-y-auto p-6 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">
              Experiment Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-teal-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">
              Core Hypothesis
            </label>
            <textarea
              rows={2}
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <span className="text-slate-500 flex items-center gap-1">
                <Target className="h-3.5 w-3.5 text-teal-400" /> Target Stage & Metric
              </span>
              <div className="mt-1 font-semibold text-slate-200">
                {(plan.targetStageId || "store").toUpperCase()} • {plan.primaryMetric.label}
              </div>
              <span className="mt-0.5 block text-[11px] text-teal-400">
                Target: {plan.primaryMetric.targetDirection.toUpperCase()}
              </span>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <span className="text-slate-500 flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-400" /> Guardrail Metric
              </span>
              <div className="mt-1 font-semibold text-slate-200">
                {plan.guardrails[0]?.label || "Do not degrade downstream conversion"}
              </div>
              <span className="mt-0.5 block text-[11px] text-amber-400">
                Must stay within 5% baseline
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Control (Variant A)
              </label>
              <input
                type="text"
                value={variantA}
                onChange={(e) => setVariantA(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Treatment (Variant B)
              </label>
              <input
                type="text"
                value={variantB}
                onChange={(e) => setVariantB(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">
              Test Duration (Days)
            </label>
            <select
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
            >
              <option value={7}>7 days (Quick signal)</option>
              <option value={14}>14 days (Recommended baseline)</option>
              <option value={30}>30 days (Full monthly cohort)</option>
            </select>
          </div>

          {/* Footer CTAs */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400"
            >
              <span>Launch Experiment</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
