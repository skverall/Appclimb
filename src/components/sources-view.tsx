"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Gauge,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Waypoints,
  X,
} from "lucide-react";

import { ModalDialog } from "@/components/modal-dialog";
import { ProviderMark } from "@/components/provider-mark";
import type {
  DashboardSnapshot,
  SourceConnection,
  SourceProvider,
} from "@/lib/contracts";
import {
  milestoneRoleLabel,
  type PostHogMapping,
} from "@/lib/posthog-events";
import {
  connectionFields,
  SOURCE_SETUP,
  type ConnectableProvider,
} from "@/lib/source-setup";

import "./sources-view.css";

type DataHealth =
  | "live"
  | "syncing"
  | "pending"
  | "waiting"
  | "attention"
  | "empty"
  | "roadmap";

interface JourneyDefinition {
  provider: ConnectableProvider;
  stage: string;
  powers: string;
  outcome: string;
}

interface PostHogEventOption {
  name: string;
  eventCount: number;
  uniqueUsers: number;
  lastSeenAt: string;
}

/**
 * Fields the API returns that `SourceConnection` in `src/lib/contracts.ts` does
 * not carry yet. Agent A owns the contract; this view reads them defensively so
 * it keeps working before and after the contract catches up.
 */
type SourceConnectionView = SourceConnection & {
  lastVerifiedAt?: string | null;
  nextCheckAt?: string | null;
  firstDataAt?: string | null;
  mapping?: PostHogMapping;
};

interface PostHogMappingPayload {
  events: PostHogEventOption[];
  activationEvent: string;
  sessionEvent: string;
  windowDays: number;
  // Absent when the backend has not built a mapping yet. Treated as "nothing
  // mapped", never as a confirmed mapping.
  mapping?: PostHogMapping;
  project: { id: string; label: string };
  boundApp: { id: string; name: string } | null;
  activationWindowDays: number;
  accessVerified: boolean;
}

function sourceView(source: SourceConnection): SourceConnectionView {
  return source as SourceConnectionView;
}

function formatMoment(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : null;
}

function confidenceLevel(confidence: number) {
  if (confidence >= 0.75) return "high" as const;
  if (confidence >= 0.5) return "medium" as const;
  if (confidence > 0) return "low" as const;
  return "none" as const;
}

function confidenceCopy(mapping: PostHogMapping) {
  const level = confidenceLevel(mapping.confidence);
  const percent = `${Math.round(mapping.confidence * 100)}%`;
  switch (level) {
    case "high":
      return `${percent} · High confidence`;
    case "medium":
      return `${percent} · Medium confidence — review before trusting it`;
    case "low":
      return `${percent} · Low confidence — check both events`;
    default:
      return "Not scored — AppClimb could not match a reliable pair";
  }
}

/**
 * Six explicit App Store Connect stages (Task P0.14). A source is never shown
 * as simply `Connected`: access and report readiness are separate facts.
 */
type AppleStageState = "complete" | "current" | "blocked" | "pending";

interface AppleStage {
  id: string;
  label: string;
  detail: string;
  state: AppleStageState;
}

function appleStages(
  source: SourceConnectionView,
  appleAppId: string,
): AppleStage[] {
  const connected = source.status !== "not-connected";
  const accessStatus = source.accessStatus ?? (connected ? "verified" : "not_connected");
  const dataStatus = source.dataStatus ?? "none";
  const errorCode = source.lastErrorCode ?? "";
  const hasReports = (source.metricCount ?? 0) > 0 || Boolean(source.firstDataAt);
  const requestMissing = errorCode === "apple_report_request_required";
  const preparing = errorCode === "apple_reports_pending";
  const accessVerified = accessStatus === "verified";

  const stage = (
    id: string,
    label: string,
    detail: string,
    state: AppleStageState,
  ): AppleStage => ({ id, label, detail, state });

  return [
    stage(
      "app",
      "App selected",
      appleAppId
        ? `Apple app ID ${appleAppId}`
        : "Add the Apple app ID for this product.",
      appleAppId ? "complete" : "current",
    ),
    stage(
      "access",
      "API access verified",
      accessStatus === "error"
        ? "Apple rejected this key. A Sales and Reports team key is required."
        : accessVerified
          ? `Verified ${formatMoment(source.lastVerifiedAt) ?? "on connect"}`
          : connected
            ? "Verifying the App Store Connect key."
            : "Not connected yet.",
      accessStatus === "error"
        ? "blocked"
        : accessVerified
          ? "complete"
          : connected
            ? "current"
            : "pending",
    ),
    stage(
      "request",
      "Analytics Reports request found",
      requestMissing
        ? "No active request exists. An Admin initializes ONGOING data once."
        : accessVerified
          ? "An active Analytics Reports request is attached to this app."
          : "Checked after access is verified.",
      requestMissing ? "blocked" : accessVerified ? "complete" : "pending",
    ),
    stage(
      "preparing",
      "Apple preparing files",
      hasReports
        ? "Apple has published downloadable report instances."
        : preparing
          ? "Apple accepted the request and is compiling the first daily files."
          : "Starts once the request is active.",
      hasReports ? "complete" : preparing ? "current" : "pending",
    ),
    stage(
      "imported",
      "First report imported",
      hasReports
        ? `${source.metricCount ?? 0} metric points imported${
            formatMoment(source.firstDataAt)
              ? ` · first data ${formatMoment(source.firstDataAt)}`
              : ""
          }`
        : "No Apple metric has arrived yet. Empty is not zero.",
      hasReports ? "complete" : "pending",
    ),
    stage(
      "diagnosis",
      "Diagnosis eligible",
      dataStatus === "ready"
        ? "Enough recent Apple data to support a store diagnosis."
        : dataStatus === "stale"
          ? "Imported data is older than 48 hours; a fresh import is needed."
          : "Needs imported Apple reports before a diagnosis can run.",
      dataStatus === "ready" ? "complete" : "pending",
    ),
  ];
}

const JOURNEY: JourneyDefinition[] = [
  {
    provider: "app-store-connect",
    stage: "Store acquisition",
    powers: "Growth River · Discover, Store, Install",
    outcome: "See where App Store demand becomes downloads.",
  },
  {
    provider: "posthog",
    stage: "Activation",
    powers: "Growth River · Activate",
    outcome: "See how many new users reach first product value.",
  },
  {
    provider: "superwall",
    stage: "Paywall",
    powers: "Growth River · Paywall",
    outcome: "Add paywall exposure and conversion context.",
  },
  {
    provider: "revenuecat",
    stage: "Revenue",
    powers: "Growth River · Trial, Paid, Renew",
    outcome: "Connect trials, paid starts, renewals and revenue.",
  },
];

const SOURCE_ORDER: ConnectableProvider[] = [
  "app-store-connect",
  "posthog",
  "revenuecat",
  "superwall",
];

function providerIsConnectable(
  provider: SourceProvider,
): provider is ConnectableProvider {
  return provider !== "appclimb-rank";
}

function sourceIsConnectable(
  source: SourceConnection,
): source is SourceConnection & { provider: ConnectableProvider } {
  return providerIsConnectable(source.provider);
}

function journeyFor(provider: SourceProvider) {
  return JOURNEY.find((item) => item.provider === provider);
}

function dataHealth(source: SourceConnection): DataHealth {
  if (source.provider === "appclimb-rank") {
    return (source.metricCount ?? 0) > 0 ? "live" : "waiting";
  }
  if (source.status === "not-connected") return "empty";
  if (
    source.syncStatus === "queued" ||
    source.syncStatus === "running" ||
    source.syncStatus === "retrying"
  ) {
    return "syncing";
  }
  if (source.lastErrorCode === "apple_reports_pending") {
    return "pending";
  }
  if (
    source.status === "needs-attention" ||
    source.syncStatus === "failed" ||
    Boolean(source.lastErrorCode)
  ) {
    return "attention";
  }
  if ((source.metricCount ?? 0) > 0) return "live";
  return "waiting";
}

function dataHealthLabel(source: SourceConnection) {
  switch (dataHealth(source)) {
    case "live":
      return source.provider === "appclimb-rank"
        ? `${source.metricCount ?? 0} keywords tracked`
        : `${source.metricCount ?? 0} metric points live`;
    case "syncing":
      return source.syncStatus === "retrying"
        ? `Retrying import · ${source.syncAttempt ?? 0}/${source.syncMaxAttempts ?? 0}`
        : source.syncStatus === "running"
          ? "Importing data now"
          : "Import queued";
    case "pending":
      return "Apple is preparing reports";
    case "attention":
      return source.lastErrorCode === "provider_unavailable"
        ? "Provider could not be reached"
        : source.lastErrorCode === "apple_report_request_required"
          ? "One-time Apple setup required"
          : source.lastErrorCode === "apple_reports_role_required"
            ? "Apple reports access required"
        : source.lastErrorCode === "no_data_in_window"
          ? source.provider === "posthog"
            ? "No recent events yet"
            : "No rows in the latest window"
          : "Import needs attention";
    case "waiting":
      return source.provider === "appclimb-rank"
        ? "Ready · Add your first keyword"
        : "Access saved · No data imported";
    case "roadmap":
      return "Roadmap";
    default:
      return "Not connected";
  }
}

function errorGuidance(source: SourceConnection) {
  switch (source.lastErrorCode) {
    case "provider_unavailable":
      return "AppClimb could not reach PostHog during the last import. Your saved access is still encrypted; retry after connectivity is restored.";
    case "no_data_in_window":
      if (source.provider === "app-store-connect") {
        return "Apple returned no supported rows for this window. New Analytics Reports normally take 24–48 hours, and low-volume metrics may remain empty.";
      }
      if (source.provider === "posthog") {
        return "PostHog access works. AppClimb will auto-map the project again on the next import; if the project is new, Pulse starts after its first event.";
      }
      return "The source returned no matching rows. Check the selected project and event names, or wait until those events exist.";
    case "apple_report_request_required":
      return "This app has no active Analytics Reports request. An App Store Connect Admin must initialize one once; keep this Sales and Reports key for ongoing read-only imports.";
    case "apple_reports_pending":
      return "Apple accepted the Analytics Reports request but has not published the first downloadable instance yet. This normally takes 1–2 days; AppClimb will keep checking.";
    case "apple_reports_role_required":
      return "Apple denied access to Analytics Reports. Use a team key with the Sales and Reports role, then reconnect.";
    case "provider_query_failed":
      return "The provider rejected the import query. Reconnect to refresh access and verify the selected project.";
    case "posthog_oauth_refresh_failed":
      return "PostHog could not refresh this authorization. Reauthorize the connection.";
    default:
      return "The last import did not finish. Retry first; reconnect only if the problem continues.";
  }
}

function postHogOAuthErrorMessage(reason: string | null) {
  switch (reason) {
    case "provider_denied":
      return "PostHog access was declined. Nothing was saved.";
    case "missing_start":
    case "start_expired":
      return "The PostHog sign-in expired. Start again in this browser.";
    case "state_mismatch":
      return "The PostHog return could not be verified. Try again in this browser.";
    case "token_exchange":
    case "token_incomplete":
      return "PostHog approved access, but the secure token exchange did not finish.";
    case "host_unresolved":
      return "PostHog authorized AppClimb, but no readable US or EU project was found.";
    default:
      return "PostHog authorization did not finish. Nothing was saved.";
  }
}

export function SourcesView({
  snapshot,
  authenticated,
  entitled,
  sources,
  onSourcesChange,
  onRefreshSnapshot,
  onOpenGrowthRiver,
  onOpenAcquisitionAtlas,
}: {
  snapshot: DashboardSnapshot;
  authenticated: boolean;
  entitled: boolean;
  sources: SourceConnection[];
  onSourcesChange: (sources: SourceConnection[]) => void;
  onRefreshSnapshot?: () => void;
  onOpenGrowthRiver: () => void;
  onOpenAcquisitionAtlas: () => void;
}) {
  const isDemo = snapshot.mode === "demo";
  const accessRestricted = !isDemo && !entitled;
  const [selectedProvider, setSelectedProvider] = useState<SourceProvider | null>(
    null,
  );
  const [setupOpen, setSetupOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [syncingProvider, setSyncingProvider] =
    useState<ConnectableProvider | null>(null);
  const [connectionState, setConnectionState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [oauthProjects, setOauthProjects] = useState<
    Array<{ id: string; name: string; organizationName: string }>
  >([]);
  const [oauthState, setOauthState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [workspaceApps, setWorkspaceApps] = useState<
    Array<{ id: string; name: string; storefront: string; iconUrl?: string }>
  >([]);

  useEffect(() => {
    if (isDemo || !setupOpen) return;
    fetch("/api/apps", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as {
          data?: Array<{ id: string; name: string; storefront: string; iconUrl?: string }>;
        };
        setWorkspaceApps(data.data ?? []);
      })
      .catch(() => setWorkspaceApps([]));
  }, [isDemo, setupOpen]);

  useEffect(() => {
    if (isDemo || !setupOpen || selectedProvider !== "posthog" || oauthState !== "idle") return;
    fetch("/api/oauth/posthog/projects")
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          data?: {
            projects?: Array<{
              id: string;
              name: string;
              organizationName: string;
            }>;
          };
        };
        const projects = payload.data?.projects ?? [];
        if (projects.length > 0) {
          setOauthProjects(projects);
          setOauthState("ready");
        }
      })
      .catch(() => undefined);
  }, [isDemo, setupOpen, selectedProvider, oauthState]);

  const selected = useMemo(
    () => sources.find((source) => source.provider === selectedProvider),
    [selectedProvider, sources],
  );
  const selectedConnectable =
    selected && sourceIsConnectable(selected) ? selected : null;
  const connectableSources = useMemo(
    () =>
      SOURCE_ORDER.map((provider) =>
        sources.find((source) => source.provider === provider),
      ).filter((source): source is SourceConnection => Boolean(source)),
    [sources],
  );
  const importedCount = connectableSources.filter(
    (source) => dataHealth(source) === "live",
  ).length;
  const configuredCount = connectableSources.filter(
    (source) => source.status !== "not-connected",
  ).length;
  const recommended = useMemo(() => {
    const configuredGap = connectableSources.find((source) =>
      ["attention", "syncing", "waiting"].includes(dataHealth(source)),
    );
    return (
      configuredGap ??
      connectableSources.find(
        (source) => source.provider === "app-store-connect" && dataHealth(source) === "empty",
      ) ??
      connectableSources.find((source) => dataHealth(source) === "empty")
    );
  }, [connectableSources]);
  const readyCount = isDemo ? configuredCount : importedCount;

  const refreshSources = async () => {
    const response = await fetch("/api/sources", { cache: "no-store" });
    if (!response.ok) throw new Error("source_refresh_failed");
    const payload = (await response.json()) as { data?: SourceConnection[] };
    if (!Array.isArray(payload.data)) throw new Error("source_refresh_failed");
    onSourcesChange(payload.data);
    return payload.data;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedProvider = params.get("source");
    const oauthResult = params.get("oauth");
    const oauthReason = params.get("oauth_reason");
    const applyReturn = window.setTimeout(() => {
      if (
        requestedProvider &&
        sources.some((source) => source.provider === requestedProvider)
      ) {
        setSelectedProvider(requestedProvider as SourceProvider);
        setSetupOpen(
          requestedProvider !== "appclimb-rank" &&
            sources.find((source) => source.provider === requestedProvider)?.status ===
              "not-connected",
        );
      }
      if (oauthResult === "error") {
        setSelectedProvider("posthog");
        setSetupOpen(true);
        setConnectionState("error");
        setConnectionMessage(postHogOAuthErrorMessage(oauthReason));
        setOauthState("error");
      }
      if (oauthResult === "ready") {
        setSelectedProvider("posthog");
        setSetupOpen(true);
        setOauthState("loading");
        fetch("/api/oauth/posthog/projects")
          .then(async (response) => {
            if (!response.ok) throw new Error("oauth_projects_failed");
            return (await response.json()) as {
              data?: {
                projects?: Array<{
                  id: string;
                  name: string;
                  organizationName: string;
                }>;
              };
            };
          })
          .then((payload) => {
            const projects = payload.data?.projects ?? [];
            if (projects.length === 0) throw new Error("oauth_projects_empty");
            setOauthProjects(projects);
            setOauthState("ready");
          })
          .catch(() => {
            setOauthState("error");
            setConnectionState("error");
            setConnectionMessage(
              "PostHog authorized AppClimb, but no readable project was found.",
            );
          });
      }
      if (requestedProvider || oauthResult || oauthReason) {
        params.delete("source");
        params.delete("oauth");
        params.delete("oauth_reason");
        const query = params.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}`,
        );
      }
    }, 0);
    return () => window.clearTimeout(applyReturn);
    // The initial URL return is intentionally consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requireAccount = () => {
    if (authenticated) return true;
    window.location.assign("/login");
    return false;
  };

  const openSource = (source: SourceConnection) => {
    setSelectedProvider(source.provider);
    setSetupOpen(
      !isDemo &&
        source.provider !== "appclimb-rank" &&
        source.status === "not-connected",
    );
    setAdvancedOpen(false);
    setConnectionState("idle");
    setConnectionMessage("");
    setOauthState("idle");
    setOauthProjects([]);
  };

  const triggerSync = async (provider: ConnectableProvider) => {
    if (!requireAccount()) return;
    if (accessRestricted) {
      setConnectionState("error");
      setConnectionMessage("An active trial or plan is required to import data.");
      return;
    }
    setSyncingProvider(provider);
    setConnectionState("idle");
    setConnectionMessage("");
    try {
      const response = await fetch(`/api/connections/${provider}/sync`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("sync_failed");
      setConnectionMessage("Import queued. Status will update here automatically.");
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        const latest = await refreshSources();
        const source = latest.find((item) => item.provider === provider);
        if (
          source &&
          source.syncStatus !== "queued" &&
          source.syncStatus !== "running"
        ) {
          onRefreshSnapshot?.();
          break;
        }
      }
    } catch {
      setConnectionState("error");
      setConnectionMessage("The import could not be queued. Try again.");
    } finally {
      setSyncingProvider(null);
    }
  };

  const connectSource = async (formData: FormData) => {
    if (!selected || !providerIsConnectable(selected.provider)) return;
    if (!requireAccount()) return;
    setConnectionState("saving");
    setConnectionMessage("");
    const credentials = Object.fromEntries(
      connectionFields(selected.provider).map(({ name }) => [
        name,
        String(formData.get(name) ?? "").trim(),
      ]),
    );
    try {
      const response = await fetch(`/api/connections/${selected.provider}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: selected.provider, credentials }),
      });
      if (!response.ok) throw new Error("connection_failed");
      await refreshSources();
      setConnectionState("success");
      setSetupOpen(false);
      onRefreshSnapshot?.();
    } catch {
      setConnectionState("error");
      setConnectionMessage(
        "Access could not be verified. Check the values and read-only permissions.",
      );
    }
  };

  const connectPostHogOAuth = async (formData: FormData) => {
    const projectId = String(formData.get("projectId") ?? "").trim();
    const appId = String(formData.get("appId") ?? "").trim();
    if (!projectId) {
      setConnectionState("error");
      setConnectionMessage("Choose a PostHog project.");
      return;
    }
    setConnectionState("saving");
    setConnectionMessage("");
    try {
      const response = await fetch("/api/oauth/posthog/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, appId: appId || undefined }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "oauth_connect_failed");
      }
      await refreshSources();
      // The flow must not close silently (Task P0.18): keep the setup open so
      // the connection result and its mapping can be reviewed and confirmed.
      // No import runs until the mapping is confirmed.
      setConnectionState("idle");
      setConnectionMessage("");
      setSetupOpen(true);
      setAdvancedOpen(false);
      setOauthState("idle");
      setOauthProjects([]);
      onRefreshSnapshot?.();
    } catch (error) {
      setConnectionState("error");
      setConnectionMessage(
        error instanceof Error &&
          error.message ===
            "Choose events seen in this project during the last 30 days"
          ? error.message
          : "PostHog access could not be verified. Reauthorize and retry.",
      );
    }
  };

  /**
   * A confirmed mapping immediately re-imports the PostHog window so metrics
   * collected under the previous mapping are replaced rather than mixed in,
   * and the resulting snapshot carries a fresh evidence version.
   */
  const completePostHogMapping = async (mapping: PostHogMapping) => {
    await refreshSources();
    setConnectionState("success");
    setConnectionMessage(
      mapping.mode === "manual"
        ? "Mapping saved. A fresh PostHog import is replacing the previous window."
        : "Mapping confirmed. AppClimb is building the activation baseline.",
    );
    await triggerSync("posthog");
    onRefreshSnapshot?.();
  };

  const openPostHogSetup = () => {
    const postHog = sources.find((item) => item.provider === "posthog");
    if (!postHog) return;
    setSelectedProvider("posthog");
    setSetupOpen(true);
    setAdvancedOpen(false);
    setConnectionState("idle");
    setConnectionMessage("");
  };

  const revokeSource = async () => {
    if (
      !selected ||
      !providerIsConnectable(selected.provider) ||
      !window.confirm(`Revoke ${selected.label} and delete its saved access?`)
    ) {
      return;
    }
    setConnectionState("saving");
    try {
      const response = await fetch(`/api/connections/${selected.provider}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("revoke_failed");
      await refreshSources();
      setSelectedProvider(null);
    } catch {
      setConnectionState("error");
      setConnectionMessage("The connection could not be revoked.");
    }
  };

  return (
    <section className="workspace-page sources-experience">
      <div className="sources-intro">
        <span className="eyebrow">Sources</span>
        <h2>
          {isDemo
            ? "See how each system fills the Growth River."
            : "Build your first trustworthy Growth River."}
        </h2>
        <p>
          Connect in stages. AppClimb shows where every signal appears and never
          fills missing data with samples.
        </p>
      </div>

      {accessRestricted && (
        <div className="source-attention-note source-access-note" role="status">
          <strong>Imports paused</strong>
          <span>Review and revoke access here; a plan is required to resume imports.</span>
        </div>
      )}

      <section className="source-journey-card" aria-labelledby="source-journey-title">
        <div className="source-journey-heading">
          <div>
            <span className="eyebrow">Your data path</span>
            <h3 id="source-journey-title">
              {isDemo
                ? `${configuredCount} sample systems illustrated`
                : `${readyCount} of ${connectableSources.length} systems have live data`}
            </h3>
          </div>
          <span className="journey-configured">
            <ShieldCheck size={15} />{" "}
            {isDemo
              ? "No credentials in demo"
              : `${configuredCount} access ${
                  configuredCount === 1 ? "connection" : "connections"
                } saved`}
          </span>
        </div>
        <div
          className="source-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={connectableSources.length}
          aria-valuenow={readyCount}
        >
          <span
            style={{
              width: `${(readyCount / Math.max(connectableSources.length, 1)) * 100}%`,
            }}
          />
        </div>
        <div className="source-journey-rail">
          {JOURNEY.map((item) => {
            const source = sources.find((candidate) => candidate.provider === item.provider);
            const health = isDemo ? "live" : source ? dataHealth(source) : "empty";
            return (
              <button
                type="button"
                key={item.provider}
                className={`journey-stop journey-${health}`}
                onClick={() => source && openSource(source)}
              >
                <i>
                  {health === "live" ? (
                    <Check size={13} />
                  ) : health === "syncing" ? (
                    <RefreshCw className="spin" size={13} />
                  ) : health === "pending" ? (
                    <Clock3 size={13} />
                  ) : (
                    <span />
                  )}
                </i>
                <strong>{item.stage}</strong>
                <small>
                  {isDemo
                    ? "Sample coverage"
                    : source
                      ? dataHealthLabel(source)
                      : "Not connected"}
                </small>
              </button>
            );
          })}
        </div>
        {!isDemo && recommended && (
          <button
            className="recommended-next"
            type="button"
            onClick={() => openSource(recommended)}
          >
            <span>
              <Sparkles size={17} />
              <span>
                <small>Recommended next</small>
                <strong>
                  {dataHealth(recommended) === "empty"
                    ? `Connect ${recommended.label}`
                    : dataHealth(recommended) === "syncing"
                      ? `Check ${recommended.label} import`
                      : `Finish ${recommended.label}`}
                </strong>
              </span>
            </span>
            <ArrowRight size={17} />
          </button>
        )}
      </section>

      <div className="source-list-heading">
        <div>
          <h3>Growth River coverage</h3>
          <p>Each source owns a specific part of the journey.</p>
        </div>
        <span>
          <LockKeyhole size={15} />{" "}
          {isDemo ? "No credentials in demo" : "Read-only · encrypted"}
        </span>
      </div>

      <div className="source-priority-list">
        {connectableSources.map((source) => (
          <SourceJourneyCard
            key={source.provider}
            source={source}
            isDemo={isDemo}
            recommended={!isDemo && recommended?.provider === source.provider}
            onOpen={() => openSource(source)}
          />
        ))}
      </div>

      <section className="atlas-source-strip">
        <span className="atlas-source-icon">
          <Waypoints size={20} />
        </span>
        <div>
          <span className="eyebrow">Separate first-party source</span>
          <strong>Acquisition Atlas uses AppClimb tracking — not PostHog.</strong>
          <p>
            Human referrals, campaigns and crawler requests appear in Acquisition
            Atlas. A PostHog URL there is only a referral.
          </p>
        </div>
        <button type="button" onClick={onOpenAcquisitionAtlas}>
          Open Acquisition Atlas <ArrowRight size={16} />
        </button>
      </section>

      {selected && (
        <ModalDialog
          labelledBy="source-modal-title"
          onClose={() => {
            setSelectedProvider(null);
            setSetupOpen(false);
            setAdvancedOpen(false);
            setConnectionState("idle");
            setConnectionMessage("");
            if (oauthState !== "idle") {
              void fetch("/api/oauth/posthog/connect", { method: "DELETE" });
            }
          }}
          dialogClassName="settings-dialog source-modal-dialog source-journey-dialog"
          closeLabel="Close source"
        >
          <div className="source-detail">
            <div className="source-detail-header">
              <div className={`provider-logo provider-${selected.provider}`}>
                <ProviderMark provider={selected.provider} />
              </div>
              <span className={`data-health-pill health-${dataHealth(selected)}`}>
                {(isDemo || dataHealth(selected) === "live") && <Check size={13} />}
                {isDemo ? "Sample profile" : dataHealthLabel(selected)}
              </span>
            </div>
            <h3 id="source-modal-title">{selected.label}</h3>
            <p className="source-outcome">
              {journeyFor(selected.provider)?.outcome ??
                "This source is visible in the product model but not enabled yet."}
            </p>

            {isDemo ? (
              <div className="source-health-view source-connect-intro">
                <div className="source-destination-card">
                  <Gauge size={22} />
                  <div>
                    <small>This sample source appears in</small>
                    <strong>{journeyFor(selected.provider)?.powers}</strong>
                  </div>
                </div>
                <div className="source-waiting-note" role="note">
                  <Sparkles size={17} />
                  <span>
                    Illustrative coverage only. No credentials, connection or
                    background import exists in the demo.
                  </span>
                </div>
                <button
                  className="primary-action"
                  type="button"
                  onClick={() => window.location.assign("/login")}
                >
                  Connect your own data <ArrowRight size={17} />
                </button>
              </div>
            ) : selected.provider === "appclimb-rank" ? (
              <div className="source-health-view source-connect-intro">
                <div className="source-destination-card">
                  <Gauge size={22} />
                  <div>
                    <small>Built into AppClimb Pulse</small>
                    <strong>
                      {(selected.metricCount ?? 0) > 0
                        ? `${selected.metricCount} keywords tracked`
                        : "Ready for your first keyword"}
                    </strong>
                  </div>
                </div>
                <div className="source-waiting-note" role="note">
                  <Sparkles size={17} />
                  <span>
                    Observed App Store positions and 14-check trends require no
                    additional credentials. Apple Ads is only needed for
                    official search popularity.
                  </span>
                </div>
                <button
                  className="primary-action"
                  type="button"
                  onClick={onOpenGrowthRiver}
                >
                  Open Keyword Terrain <ArrowRight size={17} />
                </button>
              </div>
            ) : setupOpen && selectedConnectable ? (
              <ConnectionSetup
                source={selectedConnectable}
                snapshot={snapshot}
                oauthState={oauthState}
                oauthProjects={oauthProjects}
                apps={workspaceApps}
                currentAppId={snapshot?.app?.id}
                connectionState={connectionState}
                advancedOpen={advancedOpen}
                onAdvancedChange={setAdvancedOpen}
                onConnect={connectSource}
                onConnectPostHogOAuth={connectPostHogOAuth}
                onPostHogMappingConfirmed={completePostHogMapping}
                onRevoke={revokeSource}
              />
            ) : selectedConnectable ? (
              <SourceHealthView
                source={selectedConnectable}
                snapshot={snapshot}
                syncing={syncingProvider === selectedConnectable.provider}
                onSync={() => void triggerSync(selectedConnectable.provider)}
                onOpenGrowthRiver={onOpenGrowthRiver}
                onManage={() => setSetupOpen(true)}
                onConnect={() => setSetupOpen(true)}
                onConnectPostHog={
                  selectedConnectable.provider === "app-store-connect"
                    ? openPostHogSetup
                    : undefined
                }
              />
            ) : null}

            {connectionState === "success" && (
              <div className="connection-message success" role="status">
                <CheckCircle2 size={15} /> Access verified and saved. Start an
                import to confirm data.
              </div>
            )}
            {connectionMessage && (
              <p
                className={
                  connectionState === "error"
                    ? "connection-message error"
                    : "connection-message"
                }
                role={connectionState === "error" ? "alert" : "status"}
              >
                {connectionMessage}
              </p>
            )}
          </div>
        </ModalDialog>
      )}
    </section>
  );
}

function SourceJourneyCard({
  source,
  isDemo,
  recommended,
  onOpen,
}: {
  source: SourceConnection;
  isDemo: boolean;
  recommended: boolean;
  onOpen: () => void;
}) {
  const definition = journeyFor(source.provider);
  const health = isDemo ? "live" : dataHealth(source);
  return (
    <button
      className="source-journey-row source-card"
      data-provider={source.provider}
      /**
       * The "Recommended next" wording lives on the single call to action in
       * the data-path card above. Repeating it as a badge here gave the same
       * instruction twice on one screen, so the row only carries the accent
       * that ties it back to that action.
       */
      data-recommended={recommended ? "true" : undefined}
      type="button"
      onClick={onOpen}
    >
      <span className={`provider-logo provider-${source.provider}`}>
        <ProviderMark provider={source.provider} />
      </span>
      <span className="source-journey-copy">
        <span>
          <strong>{source.label}</strong>
        </span>
        <small>{definition?.powers}</small>
      </span>
      <span className={`data-health-block health-${health}`}>
        <small>
          {isDemo
            ? "Coverage"
            : source.status === "not-connected"
              ? "Access"
              : "Data"}
        </small>
        <strong>{isDemo ? "Sample coverage" : dataHealthLabel(source)}</strong>
      </span>
      <span className="source-row-action">
        {isDemo
          ? "View model"
          : health === "attention"
          ? "Fix"
          : health === "syncing" || health === "waiting" || health === "pending"
            ? "View status"
            : health === "live"
              ? "View"
              : "Connect"}
        <ChevronRight size={16} />
      </span>
    </button>
  );
}

/** Six-stage App Store Connect progress (Task P0.14). */
function AppleStageList({
  source,
  appleAppId,
}: {
  source: SourceConnectionView;
  appleAppId: string;
}) {
  const stages = appleStages(source, appleAppId);
  return (
    <ol className="source-stage-list" aria-label="App Store Connect readiness">
      {stages.map((stage, index) => (
        <li className="source-stage" key={stage.id} data-state={stage.state}>
          <span className="source-stage-marker" aria-hidden="true">
            {stage.state === "complete" ? (
              <Check size={12} />
            ) : stage.state === "current" ? (
              <Clock3 size={12} />
            ) : stage.state === "blocked" ? (
              <CircleAlert size={12} />
            ) : (
              index + 1
            )}
          </span>
          <span className="source-stage-copy">
            <strong>
              {stage.label}
              <span className="sr-only">
                {stage.state === "complete"
                  ? " — done"
                  : stage.state === "current"
                    ? " — in progress"
                    : stage.state === "blocked"
                      ? " — blocked"
                      : " — not started"}
              </span>
            </strong>
            <small>{stage.detail}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Apple pending timeline (Task P0.15). Every value here is observed: a missing
 * check time is shown as unknown rather than guessed.
 */
function ApplePendingTimeline({
  source,
  onConnectPostHog,
  onCheckNow,
  syncing,
}: {
  source: SourceConnectionView;
  onConnectPostHog?: () => void;
  onCheckNow: () => void;
  syncing: boolean;
}) {
  const requestUnconfirmed =
    source.lastErrorCode === "apple_report_request_required";
  const lastCheckedAt = formatMoment(source.lastSyncAt);
  const nextCheckAt = formatMoment(source.nextCheckAt ?? source.nextSyncAt);
  const retryState =
    source.syncStatus === "retrying"
      ? `Retrying · attempt ${source.syncAttempt ?? 0} of ${source.syncMaxAttempts ?? 0}`
      : source.syncStatus === "running"
        ? "Checking Apple now"
        : source.syncStatus === "queued"
          ? "Check queued"
          : source.syncStatus === "failed"
            ? "Last check failed; the schedule continues"
            : "Scheduled background check";

  return (
    <div className="source-pending-note" role="status">
      <Clock3 size={18} />
      <div style={{ width: "100%" }}>
        <strong>
          {requestUnconfirmed
            ? "Apple has no active Analytics Reports request"
            : "Apple is preparing your first reports"}
        </strong>
        <p
          style={{
            margin: "0.3rem 0 0.5rem 0",
            fontSize: "0.85rem",
            lineHeight: 1.45,
          }}
        >
          {requestUnconfirmed
            ? "An App Store Connect Admin must initialize ONGOING Analytics Reports once for this app. AppClimb cannot create it for you and never changes anything in your Apple account."
            : "AppClimb confirmed the Analytics Reports request through the App Store Connect API. Apple compiles the first daily files itself; nothing else is required from you."}
        </p>
        <dl className="source-fact-grid">
          <div>
            <dt>Request accepted</dt>
            <dd>{requestUnconfirmed ? "Not confirmed" : "Yes"}</dd>
          </div>
          <div>
            <dt>Last checked at</dt>
            <dd>{lastCheckedAt ?? "Not checked yet"}</dd>
          </div>
          <div>
            <dt>Next automatic check at</dt>
            <dd>{nextCheckAt ?? "Scheduling"}</dd>
          </div>
          <div>
            <dt>Expected provider delay</dt>
            <dd>24–48 hours</dd>
          </div>
          <div>
            <dt>Background retry state</dt>
            <dd>{retryState}</dd>
          </div>
          {requestUnconfirmed && (
            <div>
              <dt>Required role</dt>
              <dd>Admin initializes reports; key needs Sales and Reports</dd>
            </div>
          )}
        </dl>
        <div className="source-health-actions" style={{ marginTop: "0.75rem" }}>
          {onConnectPostHog && (
            <button
              className="primary-action"
              type="button"
              onClick={onConnectPostHog}
            >
              <Waypoints size={17} /> Connect PostHog while Apple prepares
            </button>
          )}
          <button
            className="secondary-action"
            type="button"
            onClick={onCheckNow}
            disabled={syncing}
          >
            <RefreshCw className={syncing ? "spin" : undefined} size={15} />
            {syncing ? "Checking Apple…" : "Check Apple reports now"}
          </button>
        </div>
        <a
          href="https://appstoreconnect.apple.com/apps/analytics"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            marginTop: "0.6rem",
            fontSize: "0.85rem",
            textDecoration: "underline",
          }}
        >
          Open App Store Connect Analytics <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}

function subscribeToStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/**
 * Persistent first-data confirmation (Task P0.17).
 *
 * The banner survives reloads until it is dismissed. Dismissal is keyed by the
 * exact first-data timestamp, so a later source delivering its own first data
 * gets its own banner.
 */
function FirstDataBanner({
  source,
  onOpenGrowthRiver,
}: {
  source: SourceConnectionView;
  onOpenGrowthRiver: () => void;
}) {
  const storageKey = `appclimb.first-data.${source.provider}.${source.firstDataAt ?? ""}`;
  const stored = useSyncExternalStore(
    subscribeToStorage,
    () => {
      try {
        return window.localStorage.getItem(storageKey) ?? "";
      } catch {
        return "";
      }
    },
    () => "1",
  );
  const [dismissedNow, setDismissedNow] = useState(false);
  const dismissed = dismissedNow || stored === "1";

  if (!source.firstDataAt || dismissed) return null;
  return (
    <div className="source-first-data-banner" role="status">
      <CheckCircle2 size={18} />
      <div>
        <strong>First {source.label} data received</strong>
        <span>
          The first real metric arrived{" "}
          {formatMoment(source.firstDataAt) ?? "recently"}. This source now
          contributes evidence instead of an empty stage.
        </span>
        <button
          type="button"
          onClick={onOpenGrowthRiver}
          style={{ marginTop: "0.45rem" }}
        >
          Open Growth River
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissedNow(true);
          try {
            window.localStorage.setItem(storageKey, "1");
          } catch {
            // A blocked storage write only means the banner returns later.
          }
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

function SourceHealthView({
  source,
  snapshot,
  syncing,
  onSync,
  onOpenGrowthRiver,
  onManage,
  onConnect,
  onConnectPostHog,
}: {
  source: SourceConnection & { provider: ConnectableProvider };
  snapshot?: DashboardSnapshot;
  syncing: boolean;
  onSync: () => void;
  onOpenGrowthRiver: () => void;
  onManage: () => void;
  onConnect: () => void;
  onConnectPostHog?: () => void;
}) {
  const health = dataHealth(source);
  const view = sourceView(source);
  const isApple = source.provider === "app-store-connect";
  const appleAppId = snapshot?.app?.appStoreId ?? "";
  const applePendingTimelineShown =
    isApple &&
    (health === "pending" ||
      source.lastErrorCode === "apple_report_request_required");

  if (source.status === "not-connected") {
    return (
      <div className="source-health-view source-connect-intro">
        <div className="source-destination-card">
          <Gauge size={22} />
          <div>
            <small>This source appears in</small>
            <strong>{journeyFor(source.provider)?.powers}</strong>
          </div>
        </div>
        <button className="primary-action" type="button" onClick={onConnect}>
          Connect {source.label} <ArrowRight size={17} />
        </button>
      </div>
    );
  }
  return (
    <div className="source-health-view">
      <FirstDataBanner source={view} onOpenGrowthRiver={onOpenGrowthRiver} />

      {isApple ? (
        <AppleStageList source={view} appleAppId={appleAppId} />
      ) : (
        <div
          className="source-health-track"
          aria-label="Connection and data status"
        >
          <div className="complete">
            <span>
              <Check size={16} />
            </span>
            <strong>Access</strong>
            <small>Saved securely</small>
          </div>
          <i />
          <div className={health === "live" ? "complete" : `health-${health}`}>
            <span>
              {health === "live" ? (
                <Check size={16} />
              ) : health === "syncing" ? (
                <RefreshCw className="spin" size={16} />
              ) : health === "pending" ? (
                <Clock3 size={16} />
              ) : (
                "2"
              )}
            </span>
            <strong>Data</strong>
            <small>{dataHealthLabel(source)}</small>
          </div>
        </div>
      )}

      <div className="source-destination-card">
        <Gauge size={23} />
        <div>
          <small>Your {source.label} data appears in</small>
          <strong>{journeyFor(source.provider)?.powers}</strong>
          {source.provider === "posthog" && (
            <span>Diagnose · activation evidence</span>
          )}
        </div>
      </div>

      {source.provider === "posthog" && source.accountLabel && (
        <div className="posthog-auto-map-note" style={{ marginBottom: "0.5rem" }}>
          <Waypoints size={18} />
          <div>
            <strong>Linked to PostHog Project: {source.accountLabel}</strong>
            <span>
              Connected to app: {snapshot?.app?.name ?? "Current App"}. Product events are mapped automatically.
            </span>
          </div>
        </div>
      )}

      {isApple &&
        (health === "pending" ||
          source.lastErrorCode === "apple_report_request_required") && (
          <ApplePendingTimeline
            source={view}
            onConnectPostHog={onConnectPostHog}
            onCheckNow={onSync}
            syncing={syncing}
          />
        )}

      {health === "attention" && (
        <div className="source-attention-note" role="status">
          <CircleAlert size={17} />
          <div>
            <strong>{dataHealthLabel(source)}</strong>
            <span>{errorGuidance(source)}</span>
          </div>
        </div>
      )}

      {health === "waiting" && (
        <div className="source-waiting-note" role="status">
          <Clock3 size={17} />
          <span>
            Access is valid, but Growth River stays empty until a supported metric
            arrives.
          </span>
        </div>
      )}

      {/*
        While Apple is pending, the timeline above already carries the primary
        CTA. Repeating it here would put two competing primary actions on one
        screen, which section 4.3 of the plan forbids.
      */}
      <div className="source-health-actions">
        {!applePendingTimelineShown && (
          <button
            className="primary-action"
            type="button"
            onClick={
              source.provider === "posthog" &&
              source.lastErrorCode === "no_data_in_window"
                ? onManage
                : onSync
            }
            disabled={syncing}
          >
            {source.provider === "posthog" &&
            source.lastErrorCode === "no_data_in_window" ? (
              <Waypoints size={17} />
            ) : (
              <RefreshCw className={syncing ? "spin" : undefined} size={17} />
            )}
            {syncing
              ? "Checking import…"
              : source.provider === "posthog" &&
                  source.lastErrorCode === "no_data_in_window"
                ? "Review PostHog mapping"
                : health === "attention"
                  ? "Retry import"
                  : health === "syncing"
                    ? source.syncStatus === "retrying"
                      ? "Retry import now"
                      : "Refresh import status"
                    : health === "live"
                      ? "Sync now"
                      : "Start first import"}
          </button>
        )}
        <button className="secondary-action" type="button" onClick={onOpenGrowthRiver}>
          Open Growth River
        </button>
      </div>
      <button className="source-advanced-toggle" type="button" onClick={onManage}>
        Advanced connection settings <ChevronDown size={16} />
      </button>
    </div>
  );
}


function formatEventVolume(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatLastSeen(value?: string) {
  const moment = formatMoment(value);
  return moment ? `last seen ${moment}` : "last seen unknown";
}

function EventSelect({
  name,
  label,
  help,
  value,
  events,
  disabled,
  onChange,
}: {
  name: "activationEvent" | "sessionEvent";
  label: string;
  help: string;
  value: string;
  events: PostHogEventOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const selected = events.find((event) => event.name === value);
  return (
    <label>
      {label}
      <select
        name={name}
        required
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="" disabled>
          Choose an event
        </option>
        {events.map((event) => (
          <option key={event.name} value={event.name}>
            {event.name} · {formatEventVolume(event.eventCount)} events ·{" "}
            {formatEventVolume(event.uniqueUsers)} users
          </option>
        ))}
      </select>
      <span className="field-help">
        {help}
        {selected ? ` · ${formatLastSeen(selected.lastSeenAt)}` : ""}
      </span>
    </label>
  );
}

/** One mapped role with the volume and recency behind it. */
function MappedRole({
  role,
  event,
  option,
}: {
  role: string;
  event?: string;
  option?: PostHogEventOption;
}) {
  return (
    <div className="posthog-mapping-role" data-missing={event ? undefined : "true"}>
      <div>
        <small>{role}</small>
        <strong>{event || "Not mapped"}</strong>
      </div>
      <span>
        {option
          ? `${formatEventVolume(option.uniqueUsers)} users · ${formatEventVolume(
              option.eventCount,
            )} events · ${formatLastSeen(option.lastSeenAt)}`
          : "No volume observed"}
      </span>
    </div>
  );
}

/**
 * Milestone reach (Task P0.21).
 *
 * Each row is the unique reach of one event. Rows are not nested cohorts, so
 * the difference between two rows is NOT a drop-off. A real ordered funnel
 * needs a sequence query, which is tracked as a separate follow-up.
 */
function MilestoneReach({
  milestones,
  events,
}: {
  milestones: PostHogMapping["milestoneEvents"];
  events: PostHogEventOption[];
}) {
  if (!milestones.length) return null;
  return (
    <section className="posthog-milestone-reach">
      <header>
        <strong>Milestone reach</strong>
        <small>
          Unique reach per event — not an ordered funnel. Differences between
          rows are not conversion rates.
        </small>
      </header>
      <ul>
        {milestones.map((milestone) => {
          const option = events.find((event) => event.name === milestone.event);
          return (
            <li key={milestone.event}>
              <span style={{ color: "var(--ink)" }}>
                {milestone.label} · {milestoneRoleLabel(milestone.role)}
              </span>
              <span>
                {option
                  ? `${formatEventVolume(option.uniqueUsers)} users`
                  : "no volume observed"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PostHogOAuthProjectForm({
  projects,
  apps = [],
  currentAppId = "",
  connectionState,
  onConnect,
}: {
  projects: Array<{ id: string; name: string; organizationName: string }>;
  apps?: Array<{ id: string; name: string; storefront: string; iconUrl?: string }>;
  currentAppId?: string;
  connectionState: "idle" | "saving" | "success" | "error";
  onConnect: (formData: FormData) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [selectedAppId, setSelectedAppId] = useState(currentAppId || apps[0]?.id || "");

  return (
    <form className="connection-form oauth-project-form" action={onConnect}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="appId" value={selectedAppId} />

      {/* Target App Picker */}
      <div className="custom-picker-section" style={{ marginBottom: "1.25rem" }}>
        <label className="picker-label" style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "0.4rem" }}>
          Target App / Workspace Property
        </label>
        {apps.length === 0 ? (
          <div className="source-attention-note" style={{ marginBottom: 0 }}>
            <CircleAlert size={16} />
            <span>PostHog will be connected to your active workspace app.</span>
          </div>
        ) : (
          <div className="custom-app-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.5rem" }}>
            {apps.map((app) => {
              const isSelected = app.id === selectedAppId;
              const initials = app.name.split(/\s+/u).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
              return (
                <div
                  key={app.id}
                  className={`custom-picker-card ${isSelected ? "selected" : ""}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "8px",
                    border: isSelected ? "2px solid var(--teal-dark, #0d9488)" : "1px solid var(--line)",
                    background: isSelected ? "var(--teal-25, rgba(20, 184, 166, 0.06))" : "var(--card)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onClick={() => setSelectedAppId(app.id)}
                >
                  <span className="mini-app-icon" style={{ width: "26px", height: "26px", flexShrink: 0, borderRadius: "5px", overflow: "hidden", display: "grid", placeItems: "center", background: "var(--teal-100)", fontSize: "0.75rem" }}>
                    {app.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={app.iconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      initials
                    )}
                  </span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {app.name}
                  </span>
                  {isSelected && <Check size={14} style={{ color: "var(--teal-dark, #0d9488)", flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PostHog Project Picker */}
      <div className="custom-picker-section" style={{ marginBottom: "1.25rem" }}>
        <label className="picker-label" style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "0.4rem" }}>
          PostHog Project
        </label>
        <div className="custom-project-cards" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {projects.map((project) => {
            const isSelected = project.id === projectId;
            return (
              <div
                key={project.id}
                className={`custom-picker-card ${isSelected ? "selected" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: isSelected ? "2px solid var(--teal-dark, #0d9488)" : "1px solid var(--line)",
                  background: isSelected ? "var(--teal-25, rgba(20, 184, 166, 0.06))" : "var(--card)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onClick={() => setProjectId(project.id)}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "0.875rem", color: "var(--ink)" }}>{project.name}</strong>
                  <small style={{ color: "var(--ink-muted)", fontSize: "0.75rem" }}>{project.organizationName}</small>
                </div>
                {isSelected && <Check size={16} style={{ color: "var(--teal-dark, #0d9488)", flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="posthog-auto-map-note">
        <Waypoints size={18} />
        <div>
          <strong>AppClimb maps the product flow automatically</strong>
          <span>
            One bounded query reads the last 30 days, identifies useful
            milestones, and builds your Pulse. You can review the mapping later.
          </span>
        </div>
      </div>
      <button
        className="primary-action"
        type="submit"
        disabled={connectionState === "saving" || !projectId}
      >
        {connectionState === "saving" ? (
          <LoaderCircle className="spin" size={17} />
        ) : (
          <ShieldCheck size={17} />
        )}
        Build my product pulse
      </button>
    </form>
  );
}

/**
 * PostHog connection result and mapping review (Tasks P0.18, P0.19, P0.22).
 *
 * One panel covers three moments that used to be silent: the screen right
 * after OAuth and project selection, the review screen for an existing
 * connection, and the honest "this project has no events yet" state. Access is
 * never reported as failed just because a project is empty.
 */
function PostHogMappingPanel({
  source,
  fallbackAppName,
  onConfirmed,
  onChangeAuthorization,
}: {
  source: SourceConnection;
  fallbackAppName?: string;
  onConfirmed: (mapping: PostHogMapping) => Promise<void>;
  onChangeAuthorization: () => void;
}) {
  const [payload, setPayload] = useState<PostHogMappingPayload | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "saving" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [activationEvent, setActivationEvent] = useState("");
  const [sessionEvent, setSessionEvent] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/connections/posthog/events", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("posthog_events_failed");
        return (await response.json()) as { data?: PostHogMappingPayload };
      })
      .then((body) => {
        if (!active) return;
        const data = body.data;
        if (!data) throw new Error("posthog_events_empty");
        setPayload(data);
        const names = new Set((data.events ?? []).map((event) => event.name));
        setActivationEvent(
          names.has(data.activationEvent) ? data.activationEvent : "",
        );
        setSessionEvent(names.has(data.sessionEvent) ? data.sessionEvent : "");
        setEditing(data.mapping?.status === "invalid");
        setState("ready");
      })
      .catch(() => {
        if (!active) return;
        setState("error");
        setMessage(
          "PostHog events could not be read right now. Your saved access was not changed.",
        );
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const refresh = () => {
    setMessage("");
    setState("loading");
    setReloadKey((value) => value + 1);
  };

  const saveMapping = async (nextActivation: string, nextSession: string) => {
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/connections/posthog/events", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activationEvent: nextActivation,
          sessionEvent: nextSession,
        }),
      });
      if (!response.ok) throw new Error("posthog_events_save_failed");
      const body = (await response.json()) as {
        data?: { mapping?: PostHogMapping };
      };
      await onConfirmed(
        body.data?.mapping ?? {
          mode: "manual",
          status: "confirmed",
          confidence: 0,
          milestoneEvents: [],
          detectedEventCount: payload?.mapping?.detectedEventCount ?? 0,
        },
      );
    } catch {
      setState("ready");
      setMessage(
        "Those events could not be saved. Refresh the list and choose events seen in the last 30 days.",
      );
    }
  };

  if (state === "loading") {
    return (
      <div className="posthog-event-state" role="status">
        <LoaderCircle className="spin" size={18} />
        <span>Reading this PostHog project…</span>
      </div>
    );
  }

  if (state === "error" || !payload) {
    return (
      <div className="existing-posthog-setup">
        <div className="posthog-event-state is-error" role="alert">
          <CircleAlert size={18} />
          <span>{message || "PostHog events could not be read."}</span>
        </div>
        <div className="posthog-mapping-actions">
          <button className="secondary-action" type="button" onClick={refresh}>
            <RefreshCw size={15} /> Refresh events
          </button>
          <button
            className="source-advanced-toggle"
            type="button"
            onClick={onChangeAuthorization}
          >
            Choose another project <ChevronDown size={16} />
          </button>
        </div>
      </div>
    );
  }

  const mapping = payload.mapping;
  const events = payload.events ?? [];
  const projectLabel = payload.project?.label || payload.project?.id || "";
  const boundAppName = payload.boundApp?.name || fallbackAppName || "this product";
  const busy = state === "saving";
  const noEvents = events.length === 0 || mapping?.status === "insufficient_events";

  if (noEvents) {
    return (
      <div className="existing-posthog-setup">
        <div className="posthog-no-events" role="status">
          <strong>No events in {projectLabel} during the last 30 days</strong>
          <p>
            Access is verified: AppClimb can read <strong>{projectLabel}</strong>{" "}
            and it is bound to <strong>{boundAppName}</strong>. This project has
            simply not received a product event yet, so there is nothing to map.
            The connection is kept, not failed, and no metric is treated as zero.
          </p>
          <a
            className="secondary-action"
            href={`https://posthog.com/docs/getting-started/send-events`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ justifyContent: "center" }}
          >
            Send or open one real product event <ExternalLink size={14} />
          </a>
        </div>
        <div className="posthog-mapping-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={refresh}
            disabled={busy}
          >
            <RefreshCw size={15} /> Refresh events
          </button>
          <button
            className="source-advanced-toggle"
            type="button"
            onClick={onChangeAuthorization}
          >
            Choose another project <ChevronDown size={16} />
          </button>
        </div>
        {message && (
          <p className="connection-message" role="status">
            {message}
          </p>
        )}
      </div>
    );
  }

  // Events exist but the backend sent no mapping record: the auto-map has been
  // proposed and never confirmed. Represent that literally — unconfirmed, with
  // no confidence claimed — rather than inventing a settled mapping.
  const resolvedMapping: PostHogMapping = mapping ?? {
    mode: "automatic",
    status: "automatic_unconfirmed",
    confidence: 0,
    sessionEvent: payload.sessionEvent,
    activationEvent: payload.activationEvent,
    milestoneEvents: [],
    detectedEventCount: events.length,
  };

  const sessionOption = events.find(
    (event) => event.name === resolvedMapping.sessionEvent,
  );
  const activationOption = events.find(
    (event) => event.name === resolvedMapping.activationEvent,
  );
  const confirmed = resolvedMapping.status === "confirmed";
  const level = confidenceLevel(resolvedMapping.confidence);

  return (
    <div className="existing-posthog-setup">
      <div className="posthog-auto-map-note">
        <Waypoints size={18} />
        <div>
          <strong>
            {confirmed
              ? `Mapping confirmed for ${projectLabel}`
              : `Review the automatic map for ${projectLabel}`}
          </strong>
          <span>
            {resolvedMapping.detectedEventCount} events discovered in the last{" "}
            {payload.windowDays} days. Bound to {boundAppName}.{" "}
            {confirmed
              ? resolvedMapping.mode === "manual"
                ? "You chose these events."
                : "You confirmed AppClimb's suggestion."
              : "Nothing is trusted for a diagnosis until you confirm it."}
          </span>
        </div>
      </div>

      <p style={{ margin: "0 0 0.75rem" }}>
        <span className="posthog-confidence" data-level={level}>
          <Gauge size={13} /> {confidenceCopy(resolvedMapping)}
        </span>
      </p>

      {resolvedMapping.status === "invalid" && (
        <div className="source-attention-note" role="alert">
          <strong>A mapped event is missing from this project</strong>
          <span>
            One of the chosen events no longer appears in the last{" "}
            {payload.windowDays} days. Replace it below; AppClimb will not
            report the missing event as zero.
          </span>
        </div>
      )}

      {editing ? (
        <form
          className="connection-form posthog-event-picker"
          action={(formData: FormData) =>
            saveMapping(
              String(formData.get("activationEvent") ?? "").trim(),
              String(formData.get("sessionEvent") ?? "").trim(),
            )
          }
        >
          <EventSelect
            name="activationEvent"
            label="First value event"
            help="The first event that proves a new user reached value."
            value={activationEvent}
            events={events}
            disabled={busy}
            onChange={setActivationEvent}
          />
          <EventSelect
            name="sessionEvent"
            label="Active use event"
            help="A recurring event that represents real product use."
            value={sessionEvent}
            events={events}
            disabled={busy}
            onChange={setSessionEvent}
          />
          <button
            className="primary-action"
            type="submit"
            disabled={
              busy ||
              !activationEvent ||
              !sessionEvent ||
              activationEvent === sessionEvent
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}
            Save mapping and re-import
          </button>
        </form>
      ) : (
        <>
          <div className="posthog-result-summary">
            <MappedRole
              role="Active use event"
              event={resolvedMapping.sessionEvent}
              option={sessionOption}
            />
            <MappedRole
              role="First value event"
              event={resolvedMapping.activationEvent}
              option={activationOption}
            />
          </div>

          <MilestoneReach
            milestones={resolvedMapping.milestoneEvents}
            events={events}
          />

          <ul className="posthog-outcome-list">
            <li>
              <Check size={14} />
              <span>
                <strong>Activation baseline</strong> — distinct new users who
                reach first value within {payload.activationWindowDays} days,
                over the distinct new-user cohort.
              </span>
            </li>
            <li>
              <Check size={14} />
              <span>
                <strong>Active user trend</strong> — daily unique users of the
                active-use event, kept separate from the activation rate.
              </span>
            </li>
            <li>
              <Check size={14} />
              <span>
                <strong>Milestone reach</strong> — unique reach per milestone,
                explicitly not an ordered funnel.
              </span>
            </li>
          </ul>

          <button
            className="primary-action"
            type="button"
            disabled={busy || !resolvedMapping.sessionEvent || !resolvedMapping.activationEvent}
            onClick={() =>
              void saveMapping(
                resolvedMapping.activationEvent ?? "",
                resolvedMapping.sessionEvent ?? "",
              )
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ShieldCheck size={17} />
            )}
            {confirmed
              ? "Re-confirm mapping and re-import"
              : "Confirm mapping and build activation baseline"}
          </button>
        </>
      )}

      <div className="posthog-mapping-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={() => setEditing((value) => !value)}
          disabled={busy}
        >
          <SlidersHorizontal size={15} />
          {editing ? "Back to mapping summary" : "Replace an event"}
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={refresh}
          disabled={busy}
        >
          <RefreshCw size={15} /> Refresh events
        </button>
        <button
          className="source-advanced-toggle"
          type="button"
          onClick={onChangeAuthorization}
        >
          Choose another project <ChevronDown size={16} />
        </button>
      </div>

      {message && (
        <p className="connection-message error" role="alert">
          {message}
        </p>
      )}
      {source.lastErrorCode === "no_data_in_window" && !message && (
        <p className="connection-message" role="status">
          The last import returned no rows for the mapped events. That is an
          empty window, not zero activation.
        </p>
      )}
    </div>
  );
}

/**
 * Apple app ID reuse (Task P0.16).
 *
 * When the iOS product was added from the App Store the numeric ID is already
 * known, so the field is locked to it and the connection binds to that product.
 * Overriding is possible but never silent: a different value is called out as a
 * mismatch before it is saved.
 */
function AppleAppIdField({
  appleAppId,
  appName,
}: {
  appleAppId: string;
  appName?: string;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [value, setValue] = useState(appleAppId);
  const mismatch = unlocked && value.trim() !== appleAppId;

  if (!unlocked) {
    return (
      <div className="source-locked-field">
        <small>Apple app ID · taken from your added product</small>
        <strong>
          {appleAppId}
          {appName ? ` · ${appName}` : ""}
        </strong>
        <input type="hidden" name="appId" value={appleAppId} />
        <button type="button" onClick={() => setUnlocked(true)}>
          Use a different Apple app ID
        </button>
      </div>
    );
  }

  return (
    <div className="source-locked-field">
      <small>Apple app ID</small>
      <input
        name="appId"
        type="text"
        value={value}
        required
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
      />
      {mismatch && (
        <span role="alert" style={{ color: "var(--coral-800)" }}>
          This does not match {appleAppId}, the ID of{" "}
          {appName ?? "the product in this workspace"}. Apple reports imported
          with a different ID will not line up with that product.
        </span>
      )}
      <button type="button" onClick={() => { setUnlocked(false); setValue(appleAppId); }}>
        Use {appleAppId} instead
      </button>
    </div>
  );
}

function ConnectionSetup({
  source,
  snapshot,
  oauthState,
  oauthProjects,
  apps = [],
  currentAppId = "",
  connectionState,
  advancedOpen,
  onAdvancedChange,
  onConnect,
  onConnectPostHogOAuth,
  onPostHogMappingConfirmed,
  onRevoke,
}: {
  source: SourceConnection & { provider: ConnectableProvider };
  snapshot?: DashboardSnapshot;
  oauthState: "idle" | "loading" | "ready" | "error";
  oauthProjects: Array<{ id: string; name: string; organizationName: string }>;
  apps?: Array<{ id: string; name: string; storefront: string; iconUrl?: string }>;
  currentAppId?: string;
  connectionState: "idle" | "saving" | "success" | "error";
  advancedOpen: boolean;
  onAdvancedChange: (open: boolean) => void;
  onConnect: (formData: FormData) => Promise<void>;
  onConnectPostHogOAuth: (formData: FormData) => Promise<void>;
  onPostHogMappingConfirmed: (mapping: PostHogMapping) => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const setup = SOURCE_SETUP[source.provider];
  const alreadyConfigured = source.status !== "not-connected";
  const knownAppleAppId =
    source.provider === "app-store-connect"
      ? (snapshot?.app?.appStoreId ?? "")
      : "";
  return (
    <div className="connection-setup modern-connection-setup">
      <div className="setup-value-map">
        <span className="provider-logo provider-appclimb-rank">
          <Gauge size={18} />
        </span>
        <div>
          <small>After a successful import</small>
          <strong>{journeyFor(source.provider)?.powers}</strong>
        </div>
      </div>

      {source.provider === "posthog" && oauthState === "loading" ? (
        <div className="oauth-loading" role="status">
          <LoaderCircle className="spin" size={22} />
          <div>
            <strong>Loading your PostHog projects…</strong>
            <span>Authorization is complete; choose where activation lives.</span>
          </div>
        </div>
      ) : source.provider === "posthog" && oauthState === "ready" ? (
        <PostHogOAuthProjectForm
          projects={oauthProjects}
          apps={apps}
          currentAppId={currentAppId}
          connectionState={connectionState}
          onConnect={onConnectPostHogOAuth}
        />
      ) : source.provider === "posthog" &&
        alreadyConfigured &&
        !advancedOpen ? (
        <PostHogMappingPanel
          source={source}
          fallbackAppName={snapshot?.app?.name}
          onConfirmed={onPostHogMappingConfirmed}
          onChangeAuthorization={() => onAdvancedChange(true)}
        />
      ) : (
        <>
          {source.provider === "posthog" && (
            <>
              <a className="oauth-connect-button" href="/api/oauth/posthog/start">
                <ProviderMark provider="posthog" />
                <span>
                  <strong>Continue with PostHog</strong>
                  <small>Recommended · scoped read-only access</small>
                </span>
                <ArrowRight size={16} />
              </a>
              <button
                className="source-advanced-toggle setup-advanced-toggle"
                type="button"
                aria-expanded={advancedOpen}
                onClick={() => onAdvancedChange(!advancedOpen)}
              >
                {alreadyConfigured && advancedOpen
                  ? "Back to mapping review"
                  : "Connect manually with an API key"}
                <ChevronDown size={16} />
              </button>
            </>
          )}
          {source.provider === "revenuecat" && (
            <div className="oauth-coming-note">
              <BadgeCheck size={17} />
              <p>
                <strong>Read-only chart access</strong>
                RevenueCat OAuth will replace manual keys after provider approval.
              </p>
            </div>
          )}
          {(source.provider !== "posthog" ||
            (advancedOpen && !alreadyConfigured)) && (
            <>
              <ol className="setup-visual-steps">
                {setup.steps.map((step, index) => (
                  <li key={step}>
                    <span>{index + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>
              <form className="connection-form compact-connection-form" action={onConnect}>
                {knownAppleAppId && (
                  <AppleAppIdField
                    appleAppId={knownAppleAppId}
                    appName={snapshot?.app?.name}
                  />
                )}
                <div className="connection-field-grid">
                  {connectionFields(source.provider)
                    .filter(
                      (field) =>
                        // The Apple app ID is already known from the added iOS
                        // product; asking again invites a silent mismatch.
                        !(field.name === "appId" && knownAppleAppId),
                    )
                    .map((field) => (
                    <label
                      key={field.name}
                      className={field.multiline ? "connection-field-wide" : ""}
                    >
                      {field.label}
                      {field.multiline ? (
                        <textarea
                          name={field.name}
                          placeholder={field.placeholder}
                          required
                          spellCheck={false}
                        />
                      ) : (
                        <input
                          name={field.name}
                          type={field.secret ? "password" : "text"}
                          placeholder={field.placeholder}
                          defaultValue={field.defaultValue}
                          required
                          spellCheck={false}
                        />
                      )}
                      <span className="field-help">
                        {field.help}{" "}
                        <a href={field.helpUrl} target="_blank" rel="noreferrer">
                          {field.helpLabel} <ExternalLink size={12} />
                        </a>
                      </span>
                    </label>
                  ))}
                </div>
                <div className="connection-security-note">
                  <ShieldCheck size={16} />
                  <span>Encrypted server-side · read-only · never shown again</span>
                </div>
                <button
                  className="primary-action"
                  type="submit"
                  disabled={connectionState === "saving"}
                >
                  {connectionState === "saving" ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <KeyRound size={17} />
                  )}
                  {alreadyConfigured ? "Verify new access" : "Verify & connect"}
                </button>
              </form>
            </>
          )}
        </>
      )}
      {alreadyConfigured && (
        <button className="danger-action" type="button" onClick={() => void onRevoke()}>
          <X size={15} /> Revoke connection
        </button>
      )}
    </div>
  );
}
