"use me";
import React from "react";
import { CheckCircle2, ShieldCheck, HelpCircle } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/contracts";

interface NoConfirmedIssueCardProps {
  snapshot: DashboardSnapshot;
}

export function NoConfirmedIssueCard({ snapshot }: NoConfirmedIssueCardProps) {
  const healthyStages = snapshot.stages.filter((s) => s.health === "healthy");
  const watchStages = snapshot.stages.filter((s) => s.health === "watch");

  return (
    <div className="rounded-xl border border-teal-500/20 bg-slate-900/90 p-6 shadow-lg backdrop-blur-md">
      <div className="flex items-start gap-3 border-b border-slate-800 pb-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-400">
            Diagnosis Complete
          </span>
          <h3 className="mt-0.5 text-lg font-bold text-slate-100">
            No confirmed bottleneck in the current window
          </h3>
          <p className="mt-1 text-sm text-slate-400 leading-relaxed">
            AppClimb evaluated all covered growth stages against your baseline. No stage shows critical deterioration.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-950/50 p-4 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-400">
            <ShieldCheck className="h-4 w-4" />
            <span>Healthy Stages ({healthyStages.length})</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {healthyStages.length > 0 ? (
              healthyStages.map((s) => (
                <span
                  key={s.id}
                  className="rounded-md bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-300 border border-teal-500/20"
                >
                  {s.label} ({s.formattedValue})
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">Stages operating normally</span>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-slate-950/50 p-4 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
            <HelpCircle className="h-4 w-4" />
            <span>Watch Signals ({watchStages.length})</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {watchStages.length > 0 ? (
              watchStages.map((s) => (
                <span
                  key={s.id}
                  className="rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300 border border-amber-500/20"
                >
                  {s.label} (Watch)
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">No watch stage alerts</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
