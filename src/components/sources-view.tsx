"use client";

import { useEffect, useMemo, useState } from "react";
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
  connectionFields,
  SOURCE_SETUP,
  type ConnectableProvider,
} from "@/lib/source-setup";

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
  onOpenGrowthRiver,
  onOpenAcquisitionAtlas,
}: {
  snapshot: DashboardSnapshot;
  authenticated: boolean;
  entitled: boolean;
  sources: SourceConnection[];
  onSourcesChange: (sources: SourceConnection[]) => void;
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
    } catch {
      setConnectionState("error");
      setConnectionMessage(
        "Access could not be verified. Check the values and read-only permissions.",
      );
    }
  };

  const connectPostHogOAuth = async (formData: FormData) => {
    const projectId = String(formData.get("projectId") ?? "").trim();
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
        body: JSON.stringify({ projectId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "oauth_connect_failed");
      }
      await refreshSources();
      setConnectionState("success");
      setSetupOpen(false);
      setOauthState("idle");
      setOauthProjects([]);
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

  const completePostHogEventSetup = async () => {
    await refreshSources();
    setConnectionState("success");
    setConnectionMessage("Events saved. A fresh PostHog import is starting.");
    setSetupOpen(false);
    await triggerSync("posthog");
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
                oauthState={oauthState}
                oauthProjects={oauthProjects}
                connectionState={connectionState}
                advancedOpen={advancedOpen}
                onAdvancedChange={setAdvancedOpen}
                onConnect={connectSource}
                onConnectPostHogOAuth={connectPostHogOAuth}
                onPostHogEventsSaved={completePostHogEventSetup}
                onRevoke={revokeSource}
              />
            ) : selectedConnectable ? (
              <SourceHealthView
                source={selectedConnectable}
                syncing={syncingProvider === selectedConnectable.provider}
                onSync={() => void triggerSync(selectedConnectable.provider)}
                onOpenGrowthRiver={onOpenGrowthRiver}
                onManage={() => setSetupOpen(true)}
                onConnect={() => setSetupOpen(true)}
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

function SourceHealthView({
  source,
  syncing,
  onSync,
  onOpenGrowthRiver,
  onManage,
  onConnect,
}: {
  source: SourceConnection & { provider: ConnectableProvider };
  syncing: boolean;
  onSync: () => void;
  onOpenGrowthRiver: () => void;
  onManage: () => void;
  onConnect: () => void;
}) {
  const health = dataHealth(source);
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
      <div className="source-health-track" aria-label="Connection and data status">
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

      {health === "pending" && (
        <div className="source-pending-note" role="status">
          <Clock3 size={18} />
          <div>
            <strong>Apple is preparing reports (1–2 days)</strong>
            <span>
              Apple accepted the request. As soon as files appear, AppClimb
              imports the one-time historical snapshot first, then keeps the
              ongoing daily reports up to date automatically.
            </span>
          </div>
        </div>
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

      <div className="source-health-actions">
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
              ? "Review PostHog pulse"
            : health === "pending"
              ? "Check import status"
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
      <span className="field-help">{help}</span>
    </label>
  );
}

function PostHogOAuthProjectForm({
  projects,
  connectionState,
  onConnect,
}: {
  projects: Array<{ id: string; name: string; organizationName: string }>;
  connectionState: "idle" | "saving" | "success" | "error";
  onConnect: (formData: FormData) => Promise<void>;
}) {
  const [projectId, setProjectId] = useState("");

  return (
    <form className="connection-form oauth-project-form" action={onConnect}>
      <label>
        Project
        <select
          name="projectId"
          required
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        >
          <option value="" disabled>
            Choose a PostHog project
          </option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.organizationName} · {project.name}
            </option>
          ))}
        </select>
      </label>

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

function ExistingPostHogEventSetup({
  onSaved,
  onChangeAuthorization,
}: {
  onSaved: () => Promise<void>;
  onChangeAuthorization: () => void;
}) {
  const [events, setEvents] = useState<PostHogEventOption[]>([]);
  const [activationEvent, setActivationEvent] = useState("");
  const [sessionEvent, setSessionEvent] = useState("");
  const [state, setState] = useState<
    "loading" | "ready" | "saving" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/connections/posthog/events", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("posthog_events_failed");
        return (await response.json()) as {
          data?: {
            events?: PostHogEventOption[];
            activationEvent?: string;
            sessionEvent?: string;
          };
        };
      })
      .then((payload) => {
        if (!active) return;
        const available = payload.data?.events ?? [];
        const names = new Set(available.map((event) => event.name));
        setEvents(available);
        setActivationEvent(
          names.has(payload.data?.activationEvent ?? "")
            ? payload.data?.activationEvent ?? ""
            : "",
        );
        setSessionEvent(
          names.has(payload.data?.sessionEvent ?? "")
            ? payload.data?.sessionEvent ?? ""
            : "",
        );
        setState("ready");
      })
      .catch(() => {
        if (!active) return;
        setState("error");
        setMessage("PostHog events could not be read. Retry or reauthorize.");
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const saveEvents = async (formData: FormData) => {
    const nextActivationEvent = String(
      formData.get("activationEvent") ?? "",
    ).trim();
    const nextSessionEvent = String(formData.get("sessionEvent") ?? "").trim();
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/connections/posthog/events", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activationEvent: nextActivationEvent,
          sessionEvent: nextSessionEvent,
        }),
      });
      if (!response.ok) throw new Error("posthog_events_save_failed");
      await onSaved();
    } catch {
      setState("error");
      setMessage(
        "Those events could not be saved. Refresh the list and choose events seen in the last 30 days.",
      );
    }
  };

  return (
    <div className="existing-posthog-setup">
      <div className="posthog-event-picker-intro">
        <Waypoints size={18} />
        <div>
          <strong>Map your real PostHog events</strong>
          <span>
            Access is already saved. Changing these events does not require
            authorization again.
          </span>
        </div>
      </div>
      {state === "loading" ? (
        <div className="posthog-event-state" role="status">
          <LoaderCircle className="spin" size={18} />
          <span>Reading the last 30 days of event names…</span>
        </div>
      ) : state === "error" ? (
        <div className="posthog-event-state is-error" role="alert">
          <CircleAlert size={18} />
          <span>{message}</span>
        </div>
      ) : events.length === 0 ? (
        <div className="posthog-event-state" role="status">
          <Clock3 size={18} />
          <span>
            No events were seen in this project during the last 30 days. Send a
            test event, then refresh this list.
          </span>
        </div>
      ) : (
        <form className="connection-form posthog-event-picker" action={saveEvents}>
          <EventSelect
            name="activationEvent"
            label="First value event"
            help="Choose the first event that proves a new user reached value."
            value={activationEvent}
            events={events}
            disabled={state === "saving"}
            onChange={setActivationEvent}
          />
          <EventSelect
            name="sessionEvent"
            label="Active use event"
            help="Choose a recurring event that represents real product use."
            value={sessionEvent}
            events={events}
            disabled={state === "saving"}
            onChange={setSessionEvent}
          />
          <button
            className="primary-action"
            type="submit"
            disabled={
              state === "saving" || !activationEvent || !sessionEvent
            }
          >
            {state === "saving" ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}
            Save events and import
          </button>
        </form>
      )}
      <div className="posthog-event-secondary-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={() => {
            setState("loading");
            setMessage("");
            setReloadKey((value) => value + 1);
          }}
          disabled={state === "loading" || state === "saving"}
        >
          <RefreshCw size={15} /> Refresh events
        </button>
        <button
          className="source-advanced-toggle"
          type="button"
          onClick={onChangeAuthorization}
        >
          Change project or authorization <ChevronDown size={16} />
        </button>
      </div>
    </div>
  );
}

function AutomaticPostHogSetup({
  source,
  onReviewMapping,
  onChangeAuthorization,
}: {
  source: SourceConnection;
  onReviewMapping: () => void;
  onChangeAuthorization: () => void;
}) {
  const hasMetrics = (source.metricCount ?? 0) > 0;
  const isPreparing =
    source.syncStatus === "queued" ||
    source.syncStatus === "running" ||
    source.syncStatus === "retrying";
  return (
    <div className="existing-posthog-setup posthog-automatic-setup">
      <div className="posthog-auto-map-note">
        <Waypoints size={18} />
        <div>
          <strong>Product Pulse is mapped automatically</strong>
          <span>
            {hasMetrics
              ? `${source.metricCount} daily metric points are live. AppClimb refreshes them with one bounded aggregate query.`
              : isPreparing
                ? "The first bounded import is running. You can close this window; Pulse will fill in automatically."
                : "The connection is ready. If this project has no recent events yet, Pulse will begin after the first event arrives."}
          </span>
        </div>
      </div>
      <div className="posthog-automatic-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={onReviewMapping}
        >
          <SlidersHorizontal size={15} /> Review mapping
        </button>
        <button
          className="source-advanced-toggle"
          type="button"
          onClick={onChangeAuthorization}
        >
          Change project or authorization <ChevronDown size={16} />
        </button>
      </div>
    </div>
  );
}

function ConnectionSetup({
  source,
  oauthState,
  oauthProjects,
  connectionState,
  advancedOpen,
  onAdvancedChange,
  onConnect,
  onConnectPostHogOAuth,
  onPostHogEventsSaved,
  onRevoke,
}: {
  source: SourceConnection & { provider: ConnectableProvider };
  oauthState: "idle" | "loading" | "ready" | "error";
  oauthProjects: Array<{ id: string; name: string; organizationName: string }>;
  connectionState: "idle" | "saving" | "success" | "error";
  advancedOpen: boolean;
  onAdvancedChange: (open: boolean) => void;
  onConnect: (formData: FormData) => Promise<void>;
  onConnectPostHogOAuth: (formData: FormData) => Promise<void>;
  onPostHogEventsSaved: () => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const setup = SOURCE_SETUP[source.provider];
  const alreadyConfigured = source.status !== "not-connected";
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
          connectionState={connectionState}
          onConnect={onConnectPostHogOAuth}
        />
      ) : source.provider === "posthog" &&
        alreadyConfigured &&
        !advancedOpen ? (
        <AutomaticPostHogSetup
          source={source}
          onReviewMapping={() => onAdvancedChange(true)}
          onChangeAuthorization={() => onAdvancedChange(true)}
        />
      ) : (
        <>
          {source.provider === "posthog" && (
            <>
              {alreadyConfigured && advancedOpen && (
                <ExistingPostHogEventSetup
                  onSaved={onPostHogEventsSaved}
                  onChangeAuthorization={() => onAdvancedChange(false)}
                />
              )}
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
                Connect manually with an API key
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
                <div className="connection-field-grid">
                  {connectionFields(source.provider).map((field) => (
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
