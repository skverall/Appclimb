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

type DataHealth = "live" | "syncing" | "waiting" | "attention" | "empty" | "roadmap";

interface JourneyDefinition {
  provider: ConnectableProvider;
  stage: string;
  powers: string;
  outcome: string;
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
  if (source.provider === "appclimb-rank") return "roadmap";
  if (source.status === "not-connected") return "empty";
  if (
    source.syncStatus === "queued" ||
    source.syncStatus === "running" ||
    source.syncStatus === "retrying"
  ) {
    return "syncing";
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
      return `${source.metricCount ?? 0} metric points live`;
    case "syncing":
      return source.syncStatus === "retrying"
        ? `Retrying import · ${source.syncAttempt ?? 0}/${source.syncMaxAttempts ?? 0}`
        : source.syncStatus === "running"
          ? "Importing data now"
          : "Import queued";
    case "attention":
      return source.lastErrorCode === "provider_unavailable"
        ? "Provider could not be reached"
        : source.lastErrorCode === "no_data_in_window"
          ? "No matching data found"
          : "Import needs attention";
    case "waiting":
      return "Access saved · No data imported";
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
      return "The source returned no matching rows. Check the selected project and event names, or wait until those events exist.";
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
    const activationEvent = String(
      formData.get("activationEvent") ?? "app_activated",
    ).trim();
    const sessionEvent = String(
      formData.get("sessionEvent") ?? "$session_start",
    ).trim();
    if (!projectId || !activationEvent || !sessionEvent) {
      setConnectionState("error");
      setConnectionMessage("Choose a project and confirm both event names.");
      return;
    }
    setConnectionState("saving");
    setConnectionMessage("");
    try {
      const response = await fetch("/api/oauth/posthog/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, activationEvent, sessionEvent }),
      });
      if (!response.ok) throw new Error("oauth_connect_failed");
      await refreshSources();
      setConnectionState("success");
      setSetupOpen(false);
      setOauthState("idle");
      setOauthProjects([]);
    } catch {
      setConnectionState("error");
      setConnectionMessage("PostHog access could not be verified. Reauthorize and retry.");
    }
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
              <div className="source-beta-note">
                Keyword monitoring remains on the roadmap. No collector or
                credentials are enabled.
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
      type="button"
      onClick={onOpen}
    >
      <span className={`provider-logo provider-${source.provider}`}>
        <ProviderMark provider={source.provider} />
      </span>
      <span className="source-journey-copy">
        <span>
          <strong>{source.label}</strong>
          {recommended && <i>Recommended next</i>}
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
          : health === "syncing" || health === "waiting"
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
        <button className="primary-action" type="button" onClick={onSync} disabled={syncing}>
          <RefreshCw className={syncing ? "spin" : undefined} size={17} />
          {syncing
            ? "Checking import…"
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

function ConnectionSetup({
  source,
  oauthState,
  oauthProjects,
  connectionState,
  advancedOpen,
  onAdvancedChange,
  onConnect,
  onConnectPostHogOAuth,
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
        <form className="connection-form oauth-project-form" action={onConnectPostHogOAuth}>
          <label>
            Project
            <select name="projectId" required defaultValue="">
              <option value="" disabled>
                Choose a PostHog project
              </option>
              {oauthProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.organizationName} · {project.name}
                </option>
              ))}
            </select>
          </label>
          <div className="connection-inline-fields">
            <label>
              Activation event
              <input
                name="activationEvent"
                defaultValue="app_activated"
                required
                spellCheck={false}
              />
            </label>
            <label>
              Session event
              <input
                name="sessionEvent"
                defaultValue="$session_start"
                required
                spellCheck={false}
              />
            </label>
          </div>
          <p className="compact-field-help">
            Activation means the first event that proves a user reached value.{" "}
            <a
              href="https://posthog.com/docs/product-analytics/activation"
              target="_blank"
              rel="noreferrer"
            >
              Choose the right event <ExternalLink size={12} />
            </a>
          </p>
          <button
            className="primary-action"
            type="submit"
            disabled={connectionState === "saving"}
          >
            {connectionState === "saving" ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ShieldCheck size={17} />
            )}
            Connect selected project
          </button>
        </form>
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
          {(source.provider !== "posthog" || advancedOpen) && (
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
