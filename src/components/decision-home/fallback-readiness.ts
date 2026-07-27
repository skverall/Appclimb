import type {
  CapabilityReadiness,
  DashboardSnapshot,
  SourceProvider,
  WorkspaceReadiness,
} from "@/lib/contracts";

/**
 * Readiness the UI derives itself when the backend has not sent a `readiness`
 * block yet (older API build, or a snapshot assembled before the readiness
 * route shipped).
 *
 * It mirrors `cloudflare/api/src/diagnosis/readiness.ts` and is deliberately
 * pessimistic: capabilities are only "ready" when a source really is connected
 * and metrics really arrived. It never reports a green capability just because
 * the field is missing.
 */
export function readinessFor(snapshot: DashboardSnapshot): WorkspaceReadiness {
  if (snapshot.readiness) return snapshot.readiness;

  const platform = snapshot.app.platform;
  const capabilities = deriveCapabilities(snapshot);
  const failing = snapshot.sources.find(
    (source) =>
      source.status === "needs-attention" &&
      source.lastErrorCode !== "no_data_in_window",
  );

  if (failing) {
    return {
      state: "attention",
      progress: 40,
      primaryAction: {
        kind: "retry_source",
        provider: failing.provider,
        reasonCode: failing.lastErrorCode || "source_error",
      },
      capabilities,
      blockers: [
        {
          code: `source_attention_${failing.provider}`,
          provider: failing.provider,
          required: true,
        },
      ],
    };
  }

  if (!snapshot.app.id) {
    return {
      state: "product_required",
      progress: 0,
      primaryAction: { kind: "add_product", reasonCode: "no_real_product" },
      capabilities: blockedCapabilities("setup_required"),
      blockers: [{ code: "product_missing", required: true }],
    };
  }

  const status = snapshot.diagnosis?.status;

  if (status === "failed") {
    return {
      state: "attention",
      progress: 70,
      primaryAction: {
        kind: "retry_source",
        reasonCode: snapshot.diagnosis?.errorCode || "import_failed",
      },
      capabilities,
      blockers: [{ code: "diagnosis_failed", required: true }],
    };
  }

  if (status === "running" || status === "queued") {
    return {
      state: "diagnosis_running",
      progress: 85,
      primaryAction: { kind: "wait", reasonCode: "diagnosis_in_progress" },
      capabilities,
      blockers: [],
    };
  }

  if (status === "no_confirmed_issue") {
    return {
      state: "no_confirmed_issue",
      progress: 100,
      primaryAction: { kind: "open_diagnosis", reasonCode: "all_stages_healthy" },
      capabilities,
      blockers: [],
    };
  }

  if (status === "ready" || snapshot.insights.length > 0) {
    return {
      state: "diagnosis_ready",
      progress: 100,
      primaryAction: {
        kind: "open_action_plan",
        reasonCode: "bottleneck_diagnosed",
      },
      capabilities,
      blockers: [],
    };
  }

  const pendingApple = snapshot.sources.find(
    (source) =>
      source.provider === "app-store-connect" &&
      source.lastErrorCode === "no_data_in_window",
  );
  if (pendingApple) {
    return {
      state: "source_pending",
      progress: 45,
      primaryAction: {
        kind: "connect_source",
        provider: "posthog",
        reasonCode: "apple_reports_pending",
      },
      capabilities,
      blockers: [
        {
          code: "apple_reports_pending",
          provider: "app-store-connect",
          required: false,
        },
      ],
    };
  }

  const hasConnectedSource = snapshot.sources.some(
    (source) => source.status === "connected",
  );

  if (!hasConnectedSource) {
    return platform === "Web"
      ? {
          state: "installation_required",
          progress: 20,
          primaryAction: {
            kind: "install_web_tracking",
            reasonCode: "script_not_verified",
          },
          capabilities: blockedCapabilities("setup_required"),
          blockers: [{ code: "web_tracking_unverified", required: true }],
        }
      : {
          state: "source_required",
          progress: 25,
          primaryAction: {
            kind: "connect_source",
            provider: "app-store-connect",
            reasonCode: "app_store_connect_required",
          },
          capabilities,
          blockers: [
            {
              code: "app_store_connect_missing",
              provider: "app-store-connect",
              required: true,
            },
          ],
        };
  }

  return {
    state: "collecting",
    progress: 60,
    primaryAction: { kind: "wait", reasonCode: "building_baseline" },
    capabilities,
    blockers: [],
  };
}

function deriveCapabilities(snapshot: DashboardSnapshot): {
  acquisition: CapabilityReadiness;
  activation: CapabilityReadiness;
  monetization: CapabilityReadiness;
  retention: CapabilityReadiness;
} {
  const connected = (provider: SourceProvider) =>
    snapshot.sources.some(
      (source) => source.provider === provider && source.status === "connected",
    );

  const isWeb = snapshot.app.platform === "Web";
  const asc = connected("app-store-connect");
  const posthog = connected("posthog");
  const revenuecat = connected("revenuecat");
  const superwall = connected("superwall");
  const hasMetrics = snapshot.stages.some((stage) => stage.health !== "unknown");

  const resolve = (
    supported: boolean,
    reasonCode: string,
  ): CapabilityReadiness =>
    supported
      ? { status: hasMetrics ? "ready" : "collecting" }
      : { status: "blocked", reasonCode };

  return {
    acquisition: resolve(asc || isWeb, "connect_acquisition_source"),
    activation: resolve(posthog, "connect_posthog"),
    monetization: isWeb
      ? { status: "unsupported", reasonCode: "web_monetization_roadmap" }
      : resolve(revenuecat || superwall, "connect_revenuecat_or_superwall"),
    retention: resolve(revenuecat || posthog, "connect_retention_source"),
  };
}

function blockedCapabilities(reasonCode: string): {
  acquisition: CapabilityReadiness;
  activation: CapabilityReadiness;
  monetization: CapabilityReadiness;
  retention: CapabilityReadiness;
} {
  return {
    acquisition: { status: "blocked", reasonCode },
    activation: { status: "blocked", reasonCode },
    monetization: { status: "blocked", reasonCode },
    retention: { status: "blocked", reasonCode },
  };
}

/** Baseline blocker numbers, when the backend actually reported them. */
export function baselineProgress(readiness: WorkspaceReadiness): {
  completeDays?: number;
  minDaysRequired?: number;
  nextCheckAt?: string;
} {
  const blocker = readiness.blockers.find(
    (item) => item.code === "insufficient_baseline_days",
  );
  return {
    completeDays: blocker?.current,
    minDaysRequired: blocker?.target,
    nextCheckAt: blocker?.nextCheckAt,
  };
}
