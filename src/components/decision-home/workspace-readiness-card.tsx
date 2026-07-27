"use me";
import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  PlusCircle,
  Code,
  Link2,
} from "lucide-react";
import type { WorkspaceReadiness } from "@/lib/contracts";

interface WorkspaceReadinessCardProps {
  readiness: WorkspaceReadiness;
  onActionClick?: (kind: string, provider?: string) => void;
}

export function WorkspaceReadinessCard({
  readiness,
  onActionClick,
}: WorkspaceReadinessCardProps) {
  const { state, progress, primaryAction, capabilities, blockers } = readiness;

  const stateDetails = getStateDetails(state, primaryAction.provider);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-lg backdrop-blur-md">
      {/* Header & Status Indicator */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stateDetails.iconBg}`}>
            {stateDetails.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold uppercase tracking-wider ${stateDetails.badgeColor}`}>
                {stateDetails.badgeText}
              </span>
              <span className="text-xs text-slate-500">• {progress}% Complete</span>
            </div>
            <h2 className="mt-1 text-lg font-bold text-slate-100 sm:text-xl">
              {stateDetails.headline}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {stateDetails.description}
            </p>
          </div>
        </div>

        {/* Primary Action Button */}
        {primaryAction && (
          <button
            onClick={() => onActionClick?.(primaryAction.kind, primaryAction.provider)}
            className="group flex shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:bg-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
          >
            <span>{stateDetails.ctaLabel}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full transition-all duration-500 ${stateDetails.progressBg}`}
          style={{ width: `${Math.max(5, progress)}%` }}
        />
      </div>

      {/* Capabilities Strip */}
      <div className="mt-4 grid grid-cols-2 gap-2 pt-3 border-t border-slate-800/80 sm:grid-cols-4">
        <CapabilityPill label="Acquisition" readiness={capabilities.acquisition} />
        <CapabilityPill label="Activation" readiness={capabilities.activation} />
        <CapabilityPill label="Monetization" readiness={capabilities.monetization} />
        <CapabilityPill label="Retention" readiness={capabilities.retention} />
      </div>

      {/* Blockers / Reason list if present */}
      {blockers.length > 0 && state !== "diagnosis_ready" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {blockers.map((blocker, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 border border-slate-700/50"
            >
              <AlertCircle className="h-3 w-3 text-amber-400" />
              <span>{formatBlockerCode(blocker.code)}</span>
              {blocker.current !== undefined && blocker.target !== undefined && (
                <span className="text-slate-400">({blocker.current}/{blocker.target} days)</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CapabilityPill({
  label,
  readiness,
}: {
  label: string;
  readiness: { status: string; reasonCode?: string };
}) {
  const isReady = readiness.status === "ready";
  const isCollecting = readiness.status === "collecting";

  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2 border border-slate-800">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <span className="flex items-center gap-1 text-xs">
        {isReady ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-teal-400" />
        ) : isCollecting ? (
          <Clock className="h-3.5 w-3.5 text-blue-400" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-slate-600" />
        )}
        <span
          className={
            isReady
              ? "text-teal-400 font-semibold"
              : isCollecting
                ? "text-blue-400"
                : "text-slate-500"
          }
        >
          {isReady ? "Ready" : isCollecting ? "Collecting" : "Blocked"}
        </span>
      </span>
    </div>
  );
}

function getStateDetails(state: WorkspaceReadiness["state"], provider?: string) {
  switch (state) {
    case "product_required":
      return {
        badgeText: "Setup Required",
        badgeColor: "text-amber-400",
        iconBg: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        icon: <PlusCircle className="h-5 w-5" />,
        headline: "Add the product you want to improve",
        description: "Connect an iOS app or website to unlock your visual growth system.",
        ctaLabel: "Add product",
        progressBg: "bg-amber-500",
      };

    case "installation_required":
      return {
        badgeText: "Action Required",
        badgeColor: "text-cyan-400",
        iconBg: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
        icon: <Code className="h-5 w-5" />,
        headline: "Install web tracking to capture your first event",
        description: "Deploy the small tracking snippet to verify site installation.",
        ctaLabel: "Install web tracking",
        progressBg: "bg-cyan-500",
      };

    case "source_required":
      return {
        badgeText: "Connect Source",
        badgeColor: "text-violet-400",
        iconBg: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
        icon: <Link2 className="h-5 w-5" />,
        headline: `Connect ${provider || "data sources"} to unlock diagnosis`,
        description: "AppClimb requires verified data sources to calculate bottlenecks.",
        ctaLabel: `Connect ${provider || "source"}`,
        progressBg: "bg-violet-500",
      };

    case "source_pending":
      return {
        badgeText: "Provider Pending",
        badgeColor: "text-blue-400",
        iconBg: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
        icon: <Clock className="h-5 w-5 animate-pulse" />,
        headline: "Apple is preparing your first Analytics Reports",
        description: "Access verified. While Apple prepares initial files, connect PostHog.",
        ctaLabel: "Connect PostHog while waiting",
        progressBg: "bg-blue-500",
      };

    case "collecting":
      return {
        badgeText: "Building Baseline",
        badgeColor: "text-indigo-400",
        iconBg: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
        icon: <RefreshCw className="h-5 w-5 animate-spin text-indigo-400" />,
        headline: "Data is live; AppClimb is building a trustworthy baseline",
        description: "Gathering minimum sample volume for reliable bottleneck diagnosis.",
        ctaLabel: "View baseline progress",
        progressBg: "bg-indigo-500",
      };

    case "diagnosis_running":
      return {
        badgeText: "Diagnosing",
        badgeColor: "text-teal-400",
        iconBg: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
        icon: <Sparkles className="h-5 w-5 animate-bounce text-teal-400" />,
        headline: "Running deterministic growth diagnosis",
        description: "Evaluating stage healths and identifying earliest valid constraints.",
        ctaLabel: "Diagnosing...",
        progressBg: "bg-teal-500",
      };

    case "diagnosis_ready":
      return {
        badgeText: "Diagnosis Ready",
        badgeColor: "text-emerald-400",
        iconBg: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        icon: <Sparkles className="h-5 w-5" />,
        headline: "Confirmed constraint diagnosed",
        description: "Review evidence, structured action plan, and target experiment.",
        ctaLabel: "Open action plan",
        progressBg: "bg-emerald-500",
      };

    case "no_confirmed_issue":
      return {
        badgeText: "Stages Healthy",
        badgeColor: "text-teal-400",
        iconBg: "bg-teal-500/10 text-teal-400 border border-teal-500/20",
        icon: <CheckCircle2 className="h-5 w-5" />,
        headline: "No confirmed bottleneck in the current window",
        description: "All covered stages are converting within expected thresholds.",
        ctaLabel: "View stage details",
        progressBg: "bg-teal-500",
      };

    case "attention":
    default:
      return {
        badgeText: "Attention Required",
        badgeColor: "text-rose-400",
        iconBg: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
        icon: <AlertCircle className="h-5 w-5" />,
        headline: "Source error requires attention",
        description: "Check credentials or provider connection permissions.",
        ctaLabel: "Fix source error",
        progressBg: "bg-rose-500",
      };
  }
}

function formatBlockerCode(code: string): string {
  switch (code) {
    case "product_missing":
      return "No real product added";
    case "web_tracking_unverified":
      return "Tracking script not verified";
    case "app_store_connect_missing":
      return "App Store Connect missing";
    case "apple_reports_pending":
      return "Apple report processing";
    case "insufficient_baseline_days":
      return "Collecting minimum days baseline";
    default:
      return code.replace(/_/gu, " ");
  }
}
