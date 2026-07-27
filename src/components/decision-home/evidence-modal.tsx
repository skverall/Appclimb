"use me";
import React from "react";
import { X, ShieldCheck, Database, Calendar, Info, AlertTriangle, ArrowRight } from "lucide-react";
import type { DashboardSnapshot, Evidence } from "@/lib/contracts";

interface EvidenceModalProps {
  evidence: Evidence;
  snapshot: DashboardSnapshot;
  onClose: () => void;
  onOpenActionPlan?: () => void;
}

export function EvidenceModal({
  evidence,
  snapshot,
  onClose,
  onOpenActionPlan,
}: EvidenceModalProps) {
  const { title, finding, source, metricKeys, window, confidence, before, after } = evidence;

  const comparability = getComparabilityType(evidence.source);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Database className="h-4 w-4" />
            </span>
            <div>
              <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
                Diagnostic Evidence
              </span>
              <h3 className="text-base font-bold text-slate-100">{title}</h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-5">
          {/* Finding Banner */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <span className="text-xs font-medium text-slate-500">Key Finding</span>
            <p className="mt-1 text-sm font-semibold text-slate-200 leading-relaxed">
              {finding}
            </p>
          </div>

          {/* Metric Comparison */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <div>
              <span className="text-xs text-slate-500">Target / Baseline</span>
              <div className="mt-1 text-lg font-bold text-slate-300">
                {before.value || "Baseline"}
              </div>
              <span className="text-[11px] text-slate-500">{before.label}</span>
            </div>

            <div>
              <span className="text-xs text-slate-500">Observed Value</span>
              <div className="mt-1 text-lg font-bold text-rose-400">
                {after.value || "Observed"}
              </div>
              <span className="text-[11px] text-slate-500">{after.label}</span>
            </div>
          </div>

          {/* Source & Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800/80 bg-slate-950/30 p-3">
              <span className="text-slate-500">Data Source</span>
              <div className="mt-1 font-semibold text-teal-400 capitalize">{source}</div>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-slate-950/30 p-3">
              <span className="text-slate-500">Confidence</span>
              <div className="mt-1 flex items-center gap-1 font-semibold text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="capitalize">{confidence}</span>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-lg border border-slate-800/80 bg-slate-950/30 p-3">
              <span className="text-slate-500">Comparability</span>
              <div className="mt-1 font-semibold text-indigo-400">
                {comparability.label}
              </div>
            </div>
          </div>

          {/* Time Window & Metric Keys */}
          <div className="space-y-2 rounded-lg bg-slate-950/50 p-4 border border-slate-800 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Calendar className="h-3.5 w-3.5 text-teal-400" />
                Time Window
              </span>
              <span className="font-mono">
                {window.from.slice(0, 10)} to {window.to.slice(0, 10)}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-slate-300">
              <span className="text-slate-400">Evaluated Metric Keys</span>
              <span className="font-mono text-slate-300">{metricKeys.join(", ")}</span>
            </div>
          </div>

          {/* Comparability Explanation */}
          <div className="flex items-start gap-2.5 rounded-lg bg-slate-950/80 p-3.5 text-xs text-slate-400 border border-slate-800">
            <Info className="mt-0.5 h-4 w-4 text-blue-400 shrink-0" />
            <div>
              <strong className="text-slate-300">Comparability Note:</strong>{" "}
              {comparability.description}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/60 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            Close
          </button>

          {onOpenActionPlan && (
            <button
              onClick={() => {
                onClose();
                onOpenActionPlan();
              }}
              className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-teal-400"
            >
              <span>View Action Plan</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getComparabilityType(source: string) {
  switch (source) {
    case "app-store-connect":
    case "posthog":
      return {
        label: "Same-Source Funnel",
        description: "Metrics originate from verified first-party app events within the same collection boundary.",
      };

    case "revenuecat":
    case "superwall":
      return {
        label: "Cohort Funnel",
        description: "Monetization and paywall events are aligned by subscription cohort entry date.",
      };

    default:
      return {
        label: "Aggregate Directional",
        description: "Directional comparison derived from aggregated system metrics across providers.",
      };
  }
}
