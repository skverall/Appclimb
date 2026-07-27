"use me";
import React from "react";
import { AlertTriangle, RefreshCw, KeyRound, ShieldAlert } from "lucide-react";
import type { SourceProvider } from "@/lib/contracts";

interface SourceBlockerCardProps {
  provider: SourceProvider;
  errorCode: string;
  onFix?: () => void;
}

export function SourceBlockerCard({
  provider,
  errorCode,
  onFix,
}: SourceBlockerCardProps) {
  const isApplePending = provider === "app-store-connect" && errorCode === "no_data_in_window";

  return (
    <div className={`rounded-xl border p-5 shadow-lg backdrop-blur-md ${
      isApplePending
        ? "border-blue-500/30 bg-slate-900/90"
        : "border-rose-500/30 bg-slate-900/90"
    }`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            isApplePending
              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
          }`}>
            {isApplePending ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <ShieldAlert className="h-5 w-5" />
            )}
          </div>
          <div>
            <span className={`text-xs font-semibold uppercase tracking-wider ${
              isApplePending ? "text-blue-400" : "text-rose-400"
            }`}>
              {isApplePending ? "Reports Preparing" : "Attention Required"}
            </span>
            <h3 className="mt-0.5 text-base font-bold text-slate-100 sm:text-lg">
              {isApplePending
                ? "Apple is preparing your first Analytics Reports"
                : `${providerLabel(provider)} connection error`}
            </h3>
            <p className="mt-1 text-xs text-slate-400 leading-relaxed">
              {isApplePending
                ? "App Store Connect API access is verified. Apple usually takes 24–48 hours to generate initial report files."
                : `Error code: ${errorCode}. Re-verify your connection credentials.`}
            </p>
          </div>
        </div>

        {onFix && (
          <button
            onClick={onFix}
            className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-800 border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-700"
          >
            <KeyRound className="h-3.5 w-3.5 text-slate-400" />
            <span>{isApplePending ? "Check Status" : "Re-connect Source"}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function providerLabel(provider: SourceProvider): string {
  switch (provider) {
    case "app-store-connect":
      return "App Store Connect";
    case "revenuecat":
      return "RevenueCat";
    case "posthog":
      return "PostHog";
    case "superwall":
      return "Superwall";
    case "appclimb-rank":
      return "Keyword Monitor";
    default:
      return provider;
  }
}
