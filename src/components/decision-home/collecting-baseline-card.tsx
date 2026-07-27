"use me";
import React from "react";
import { RefreshCw, Database, Calendar } from "lucide-react";

interface CollectingBaselineCardProps {
  sampleSize: number;
  completeDays: number;
  minDaysRequired?: number;
}

export function CollectingBaselineCard({
  sampleSize,
  completeDays,
  minDaysRequired = 3,
}: CollectingBaselineCardProps) {
  const dayProgress = Math.min(100, Math.round((completeDays / minDaysRequired) * 100));

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-slate-900/90 p-5 shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-100">
            Building Baseline Data
          </h3>
          <p className="text-xs text-slate-400">
            Collecting complete daily data points to establish a trustworthy baseline.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="h-3.5 w-3.5 text-indigo-400" />
            <span>Complete Days</span>
          </div>
          <div className="mt-1 text-xl font-bold text-slate-100">
            {completeDays} / {minDaysRequired}
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${dayProgress}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-slate-950/60 p-3 border border-slate-800">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Database className="h-3.5 w-3.5 text-teal-400" />
            <span>Collected Metrics</span>
          </div>
          <div className="mt-1 text-xl font-bold text-teal-400">
            {sampleSize.toLocaleString()}
          </div>
          <span className="mt-1 block text-[11px] text-slate-500">
            Sample volume building up
          </span>
        </div>
      </div>
    </div>
  );
}
