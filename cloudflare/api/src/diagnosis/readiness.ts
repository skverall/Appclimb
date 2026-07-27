import type {
  CapabilityReadiness,
  SourceProvider,
  WorkspaceReadiness,
} from "@/lib/contracts";

export interface SourceStatusInfo {
  provider: SourceProvider;
  status: "connected" | "needs-attention" | "not-connected";
  lastErrorCode?: string | null;
  metricCount?: number;
  lastMetricAt?: string | null;
}

export interface AppInfo {
  id: string;
  name: string;
  platform: "iOS" | "Web";
  isPlaceholder?: boolean;
}

export interface WebPropertyInfo {
  id: string;
  domain: string;
  firstEventAt?: string | null;
  lastEventAt?: string | null;
  primaryConversionGoal?: string | null;
}

export function deriveWorkspaceReadiness(params: {
  app?: AppInfo | null;
  webProperty?: WebPropertyInfo | null;
  sources: SourceStatusInfo[];
  metricCount: number;
  completeDays: number;
  hasDiagnosisRun: boolean;
  hasConfirmedInsight: boolean;
  isDiagnosisRunning?: boolean;
}): WorkspaceReadiness {
  const {
    app,
    webProperty,
    sources,
    metricCount,
    completeDays,
    hasDiagnosisRun,
    hasConfirmedInsight,
    isDiagnosisRunning,
  } = params;

  // 1. Attention needed (revoked / error on connected source)
  const failingSource = sources.find(
    (s) => s.status === "needs-attention" && s.lastErrorCode !== "no_data_in_window",
  );
  if (failingSource) {
    return {
      state: "attention",
      progress: 40,
      primaryAction: {
        kind: "retry_source",
        provider: failingSource.provider,
        reasonCode: failingSource.lastErrorCode || "source_error",
      },
      capabilities: deriveCapabilities(sources, app?.platform, metricCount),
      blockers: [
        {
          code: `source_attention_${failingSource.provider}`,
          provider: failingSource.provider,
          required: true,
        },
      ],
    };
  }

  // 2. Product missing or placeholder
  if (!app || app.isPlaceholder) {
    return {
      state: "product_required",
      progress: 0,
      primaryAction: {
        kind: "add_product",
        reasonCode: "no_real_product",
      },
      capabilities: emptyCapabilities(),
      blockers: [{ code: "product_missing", required: true }],
    };
  }

  // 3. Web tracking script deployment required for Web SaaS
  if (app.platform === "Web") {
    if (!webProperty || !webProperty.firstEventAt) {
      return {
        state: "installation_required",
        progress: 20,
        primaryAction: {
          kind: "install_web_tracking",
          reasonCode: "script_not_verified",
        },
        capabilities: emptyCapabilities(),
        blockers: [{ code: "web_tracking_unverified", required: true }],
      };
    }
  }

  // 4. Required primary source missing (iOS app needs App Store Connect or RevenueCat/PostHog)
  if (app.platform === "iOS") {
    const ascSource = sources.find((s) => s.provider === "app-store-connect");
    if (!ascSource || ascSource.status === "not-connected") {
      return {
        state: "source_required",
        progress: 25,
        primaryAction: {
          kind: "connect_source",
          provider: "app-store-connect",
          reasonCode: "app_store_connect_required",
        },
        capabilities: deriveCapabilities(sources, app.platform, metricCount),
        blockers: [
          {
            code: "app_store_connect_missing",
            provider: "app-store-connect",
            required: true,
          },
        ],
      };
    }

    // 5. Source connected, but provider pending (e.g. Apple preparing reports)
    if (ascSource.lastErrorCode === "no_data_in_window" && metricCount === 0) {
      return {
        state: "source_pending",
        progress: 45,
        primaryAction: {
          kind: "connect_source",
          provider: "posthog",
          reasonCode: "apple_reports_pending",
        },
        capabilities: deriveCapabilities(sources, app.platform, metricCount),
        blockers: [
          {
            code: "apple_reports_pending",
            provider: "app-store-connect",
            required: false,
          },
        ],
      };
    }
  }

  // 6. Collecting baseline data
  if (metricCount === 0 || completeDays < 3) {
    return {
      state: "collecting",
      progress: 60,
      primaryAction: {
        kind: "wait",
        reasonCode: "building_baseline",
      },
      capabilities: deriveCapabilities(sources, app.platform, metricCount),
      blockers: [
        {
          code: "insufficient_baseline_days",
          required: true,
          current: completeDays,
          target: 3,
        },
      ],
    };
  }

  // 7. Diagnosis running
  if (isDiagnosisRunning) {
    return {
      state: "diagnosis_running",
      progress: 85,
      primaryAction: {
        kind: "wait",
        reasonCode: "diagnosis_in_progress",
      },
      capabilities: deriveCapabilities(sources, app.platform, metricCount),
      blockers: [],
    };
  }

  // 8. Diagnosis completed & confirmed bottleneck ready
  if (hasDiagnosisRun && hasConfirmedInsight) {
    return {
      state: "diagnosis_ready",
      progress: 100,
      primaryAction: {
        kind: "open_action_plan",
        reasonCode: "bottleneck_diagnosed",
      },
      capabilities: deriveCapabilities(sources, app.platform, metricCount),
      blockers: [],
    };
  }

  // 9. Diagnosis completed, but no confirmed bottleneck in current window
  if (hasDiagnosisRun && !hasConfirmedInsight) {
    return {
      state: "no_confirmed_issue",
      progress: 100,
      primaryAction: {
        kind: "open_diagnosis",
        reasonCode: "all_stages_healthy",
      },
      capabilities: deriveCapabilities(sources, app.platform, metricCount),
      blockers: [],
    };
  }

  // Fallback: ready for diagnosis run
  return {
    state: "collecting",
    progress: 75,
    primaryAction: {
      kind: "wait",
      reasonCode: "ready_for_diagnosis",
    },
    capabilities: deriveCapabilities(sources, app.platform, metricCount),
    blockers: [],
  };
}

function deriveCapabilities(
  sources: SourceStatusInfo[],
  platform?: "iOS" | "Web",
  metricCount = 0,
): {
  acquisition: CapabilityReadiness;
  activation: CapabilityReadiness;
  monetization: CapabilityReadiness;
  retention: CapabilityReadiness;
} {
  const isConnected = (provider: SourceProvider) =>
    sources.some((s) => s.provider === provider && s.status === "connected");

  const asc = isConnected("app-store-connect");
  const posthog = isConnected("posthog");
  const revenuecat = isConnected("revenuecat");
  const superwall = isConnected("superwall");

  return {
    acquisition: {
      status: asc || platform === "Web" ? (metricCount > 0 ? "ready" : "collecting") : "blocked",
      reasonCode: asc || platform === "Web" ? undefined : "connect_acquisition_source",
    },
    activation: {
      status: posthog ? (metricCount > 0 ? "ready" : "collecting") : "blocked",
      reasonCode: posthog ? undefined : "connect_posthog",
    },
    monetization: {
      status: revenuecat || superwall ? (metricCount > 0 ? "ready" : "collecting") : "blocked",
      reasonCode: revenuecat || superwall ? undefined : "connect_revenuecat_or_superwall",
    },
    retention: {
      status: revenuecat || posthog ? (metricCount > 0 ? "ready" : "collecting") : "blocked",
      reasonCode: revenuecat || posthog ? undefined : "connect_retention_source",
    },
  };
}

function emptyCapabilities(): {
  acquisition: CapabilityReadiness;
  activation: CapabilityReadiness;
  monetization: CapabilityReadiness;
  retention: CapabilityReadiness;
} {
  return {
    acquisition: { status: "blocked", reasonCode: "setup_required" },
    activation: { status: "blocked", reasonCode: "setup_required" },
    monetization: { status: "blocked", reasonCode: "setup_required" },
    retention: { status: "blocked", reasonCode: "setup_required" },
  };
}
