"use me";
import React from "react";
import { Sparkles, ArrowRight, ShieldCheck, FileText } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/contracts";

interface PrimaryDiagnosisCardProps {
  snapshot: DashboardSnapshot;
  onOpenActionPlan?: () => void;
  onOpenEvidence?: () => void;
}

export function PrimaryDiagnosisCard({
  snapshot,
  onOpenActionPlan,
  onOpenEvidence,
}: PrimaryDiagnosisCardProps) {
  const primaryInsight = snapshot.insights.find((i) => i.rank === 1) || snapshot.insights[0];
  const primaryProposal = snapshot.actionProposals.find(
    (ap) => ap.insightId === primaryInsight?.id,
  ) || snapshot.actionProposals[0];
  const primaryEvidence = snapshot.evidence.find((e) =>
    primaryInsight?.evidenceIds.includes(e.id),
  );

  if (!primaryInsight) return null;

  const stage = snapshot.stages.find((s) => s.id === primaryInsight.stageId);

  return (
    <div className="relative overflow-hidden rounded-xl border border-teal-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950/40 p-6 shadow-xl backdrop-blur-md">
      {/* Background Accent Glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />

      {/* Header Badge & Confidence */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-400 border border-teal-500/20">
            <Sparkles className="h-3.5 w-3.5" />
            Primary Constraint: {stage?.label || primaryInsight.stageId}
          </span>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs text-slate-400">
            Impact: {primaryInsight.impact.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>{snapshot.confidence.score}% Confidence</span>
          <span className="text-slate-600">•</span>
          <span>Window: {primaryEvidence?.window ? `${primaryEvidence.window.from.slice(0, 10)} to ${primaryEvidence.window.to.slice(0, 10)}` : "Last 30 days"}</span>
        </div>
      </div>

      {/* Main Insight Title & Rationale */}
      <div className="mt-4">
        <h3 className="text-xl font-bold text-slate-100 sm:text-2xl">
          {primaryInsight.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {primaryInsight.summary}
        </p>
      </div>

      {/* Metric comparison box */}
      {primaryEvidence && (
        <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4 sm:grid-cols-3">
          <div>
            <span className="text-xs text-slate-500">Target / Baseline</span>
            <div className="mt-1 text-lg font-semibold text-slate-300">
              {primaryEvidence.before.value || "Baseline"}
            </div>
          </div>
          <div>
            <span className="text-xs text-slate-500">Observed Value</span>
            <div className="mt-1 text-lg font-bold text-rose-400">
              {primaryEvidence.after.value || stage?.formattedValue || "Observed"}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-xs text-slate-500">Evidence Source</span>
            <div className="mt-1 text-sm font-medium text-teal-400">
              {primaryEvidence.source}
            </div>
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={onOpenActionPlan}
          className="group flex items-center gap-2 rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
        >
          <span>{primaryProposal ? primaryProposal.title : "Open Action Plan"}</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>

        <button
          onClick={onOpenEvidence}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-200 transition-all hover:border-slate-600 hover:bg-slate-800"
        >
          <FileText className="h-4 w-4 text-slate-400" />
          <span>See evidence</span>
        </button>
      </div>
    </div>
  );
}
