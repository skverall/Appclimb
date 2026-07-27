"use me";
import React, { useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import type { WorkspaceReadiness } from "@/lib/contracts";

interface SetupChecklistProps {
  readiness: WorkspaceReadiness;
  platform?: "iOS" | "Web";
  onActionClick?: (kind: string, provider?: string) => void;
}

export function SetupChecklist({
  readiness,
  platform = "iOS",
  onActionClick,
}: SetupChecklistProps) {
  const isReady = readiness.state === "diagnosis_ready" || readiness.state === "no_confirmed_issue";
  const [collapsed, setCollapsed] = useState(isReady);

  const steps = getSetupSteps(readiness, platform);
  const completedCount = steps.filter((s) => s.completed).length;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Setup Checklist
          </span>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-400">
            {completedCount} / {steps.length} steps
          </span>
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
        >
          <span>{collapsed ? "Show steps" : "Collapse"}</span>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-2.5 border-t border-slate-800/80 pt-3">
          {steps.map((step, idx) => (
            <div
              key={idx}
              className={`flex items-center justify-between rounded-lg p-2.5 transition-all ${
                step.current
                  ? "bg-teal-500/10 border border-teal-500/30"
                  : step.completed
                    ? "bg-slate-950/40 border border-slate-800/50"
                    : "bg-slate-950/20 border border-transparent opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                {step.completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-400" />
                ) : (
                  <Circle className={`h-4 w-4 shrink-0 ${step.current ? "text-teal-400 animate-pulse" : "text-slate-600"}`} />
                )}
                <div>
                  <h4 className={`text-xs font-semibold ${step.completed ? "text-slate-300 line-through" : step.current ? "text-teal-300" : "text-slate-400"}`}>
                    {step.title}
                  </h4>
                  <p className="text-[11px] text-slate-500">{step.description}</p>
                </div>
              </div>

              {step.current && step.actionKind && (
                <button
                  onClick={() => onActionClick?.(step.actionKind!, step.provider)}
                  className="flex items-center gap-1 rounded bg-teal-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-teal-400"
                >
                  <span>Action</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function getSetupSteps(readiness: WorkspaceReadiness, platform: "iOS" | "Web") {
  const { state } = readiness;

  const isProductDone = state !== "product_required";
  const isConnectDone = state !== "product_required" && state !== "installation_required" && state !== "source_required";
  const isSignalDone = isConnectDone && state !== "source_pending";
  const isBaselineDone = isSignalDone && state !== "collecting";
  const isDiagnosisDone = state === "diagnosis_ready" || state === "no_confirmed_issue";

  return [
    {
      title: "Add Product",
      description: platform === "Web" ? "Domain registered" : "iOS App added",
      completed: isProductDone,
      current: state === "product_required",
      actionKind: "add_product",
    },
    {
      title: platform === "Web" ? "Install Web Tracking" : "Connect Primary Data Source",
      description: platform === "Web" ? "Deploy JS tracker on domain" : "App Store Connect or PostHog",
      completed: isConnectDone,
      current: state === "installation_required" || state === "source_required",
      actionKind: platform === "Web" ? "install_web_tracking" : "connect_source",
      provider: "app-store-connect",
    },
    {
      title: "Verify Real Data Signal",
      description: "First real event accepted",
      completed: isSignalDone,
      current: state === "source_pending",
      actionKind: "connect_source",
      provider: "posthog",
    },
    {
      title: "Build 30-Day Baseline",
      description: "Sufficient sample volume collected",
      completed: isBaselineDone,
      current: state === "collecting",
    },
    {
      title: "Unlock Growth Diagnosis",
      description: "Earliest bottleneck & action plan ready",
      completed: isDiagnosisDone,
      current: state === "diagnosis_running",
      actionKind: "open_action_plan",
    },
  ];
}
