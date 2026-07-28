"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Copy,
  KeyRound,
  Link2,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import type { GrowthCiSnapshot } from "@/components/growth-ci/growth-ci-workspace";

type VersionCandidate = {
  key: string;
  score: number;
  reasons: string[];
  sampleValues: string[];
  distinctCount: number;
  presentOnSessionEvent: boolean;
};

type EventOption = {
  name: string;
  eventCount: number;
  uniqueUsers: number;
  lastSeenAt?: string;
};

/**
 * Self-contained Growth CI setup. Founder should not need Pulse/Sources detours.
 */
export function GrowthCiSettings(props: {
  appId: string;
  snapshot: GrowthCiSnapshot | null;
  onRefresh: () => void;
  onOpenLegacySources?: () => void;
}) {
  const { appId, snapshot, onRefresh } = props;
  const [localSnapshot, setLocalSnapshot] = useState(snapshot);
  const [candidates, setCandidates] = useState<VersionCandidate[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [sessionEvent, setSessionEvent] = useState("");
  const [activationEvent, setActivationEvent] = useState("");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [buildProperty, setBuildProperty] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rcApiKey, setRcApiKey] = useState("");
  const [rcProjectId, setRcProjectId] = useState("");
  const [phKey, setPhKey] = useState("");
  const [phProjectId, setPhProjectId] = useState("");
  const [phHost, setPhHost] = useState("https://us.posthog.com");
  const [tokens, setTokens] = useState<
    Array<{
      id: string;
      name: string;
      prefix: string;
      revokedAt: string | null;
      createdAt: string;
    }>
  >([]);
  const [newToken, setNewToken] = useState<string | null>(null);

  const data = localSnapshot ?? snapshot;
  const access = data?.access;
  const readiness = data?.readiness;
  const sources = data?.sources ?? [];
  const rc = sources.find((s) => s.provider === "revenuecat");
  const ph = sources.find((s) => s.provider === "posthog");

  const refreshAll = useCallback(async () => {
    if (!appId) return;
    try {
      const response = await fetch(
        `/api/growth-ci?appId=${encodeURIComponent(appId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as { data?: GrowthCiSnapshot };
      if (payload.data) {
        setLocalSnapshot(payload.data);
      }
    } catch {
      // ignore
    }
    onRefresh();
  }, [appId, onRefresh]);

  const loadTokens = useCallback(async () => {
    if (!appId) return;
    try {
      const response = await fetch(
        `/api/agent-tokens?appId=${encodeURIComponent(appId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        data?: Array<{
          id: string;
          name: string;
          prefix: string;
          revokedAt: string | null;
          createdAt: string;
        }>;
      };
      if (response.ok) setTokens(payload.data ?? []);
    } catch {
      // ignore
    }
  }, [appId]);

  const loadEvents = useCallback(async () => {
    if (!ph) return;
    setLoadingEvents(true);
    setError("");
    try {
      const response = await fetch("/api/connections/posthog/events", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        data?: {
          events?: EventOption[];
          sessionEvent?: string;
          activationEvent?: string;
          mapping?: { sessionEvent?: string; activationEvent?: string };
        };
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Could not load PostHog events");
        return;
      }
      const list = payload.data?.events ?? [];
      setEvents(list);
      const nextSession =
        payload.data?.sessionEvent ||
        payload.data?.mapping?.sessionEvent ||
        data?.mapping?.sessionEvent ||
        "";
      const nextActivation =
        payload.data?.activationEvent ||
        payload.data?.mapping?.activationEvent ||
        data?.mapping?.activationEvent ||
        "";
      setSessionEvent(nextSession);
      setActivationEvent(nextActivation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "events_failed");
    } finally {
      setLoadingEvents(false);
    }
  }, [ph, data?.mapping?.sessionEvent, data?.mapping?.activationEvent]);

  useEffect(() => {
    setLocalSnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    setSelectedVersion(data?.mapping?.versionProperty ?? "");
    setBuildProperty(data?.mapping?.buildProperty ?? "");
    setSessionEvent(data?.mapping?.sessionEvent ?? "");
    setActivationEvent(data?.mapping?.activationEvent ?? "");
    const cached = data?.mapping?.versionCandidates;
    if (Array.isArray(cached) && cached.length) {
      setCandidates(cached as VersionCandidate[]);
    }
  }, [data]);

  useEffect(() => {
    if (!snapshot && appId) void refreshAll();
  }, [appId, snapshot, refreshAll]);

  useEffect(() => {
    if (ph) void loadEvents();
  }, [ph, loadEvents]);

  const sortedEvents = useMemo(
    () =>
      [...events].sort(
        (a, b) => b.uniqueUsers - a.uniqueUsers || b.eventCount - a.eventCount,
      ),
    [events],
  );

  async function connectRevenueCat() {
    setBusy("rc");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/connections/revenuecat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "revenuecat",
          credentials: {
            apiKey: rcApiKey.trim(),
            projectId: rcProjectId.trim(),
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "revenuecat_connect_failed");
        return;
      }
      setMessage("RevenueCat connected. Importing charts…");
      setRcApiKey("");
      await fetch("/api/connections/revenuecat/sync", { method: "POST" });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "revenuecat_connect_failed");
    } finally {
      setBusy("");
    }
  }

  async function connectPostHogKey() {
    setBusy("ph");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/connections/posthog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "posthog",
          credentials: {
            personalApiKey: phKey.trim(),
            projectId: phProjectId.trim(),
            host: phHost.trim() || "https://us.posthog.com",
          },
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "posthog_connect_failed");
        return;
      }
      setMessage("PostHog connected. Loading events…");
      setPhKey("");
      await refreshAll();
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "posthog_connect_failed");
    } finally {
      setBusy("");
    }
  }

  async function confirmEvents() {
    if (!sessionEvent || !activationEvent) {
      setError("Pick both session and activation events.");
      return;
    }
    if (sessionEvent === activationEvent) {
      setError("Session and activation must be different events.");
      return;
    }
    setBusy("events");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/connections/posthog/events", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionEvent, activationEvent }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "event_confirm_failed");
        return;
      }
      setMessage(
        "Session + activation confirmed. Syncing PostHog aggregates…",
      );
      await fetch("/api/connections/posthog/sync", { method: "POST" });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "event_confirm_failed");
    } finally {
      setBusy("");
    }
  }

  async function discoverVersions() {
    setDiscovering(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/growth-ci/version-candidates?appId=${encodeURIComponent(appId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        data?: {
          candidates?: VersionCandidate[];
          suggestion?: VersionCandidate | null;
          sessionEvent?: string;
        };
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "discovery_failed");
        return;
      }
      const list = payload.data?.candidates ?? [];
      setCandidates(list);
      if (!selectedVersion && payload.data?.suggestion?.key) {
        setSelectedVersion(payload.data.suggestion.key);
      }
      setMessage(
        list.length
          ? `Found ${list.length} version property candidates on session events.`
          : "No version-like properties found yet. Instrument $app_version (or similar) on your session event, then rediscover.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "discovery_failed");
    } finally {
      setDiscovering(false);
    }
  }

  async function confirmVersion(confirm: boolean) {
    if (!selectedVersion.trim()) {
      setError("Select or enter a version property first.");
      return;
    }
    setBusy("version");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/growth-ci/mapping/version", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId,
          versionProperty: selectedVersion.trim(),
          buildProperty: buildProperty.trim(),
          confirm,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "confirm_failed");
        return;
      }
      setMessage(
        confirm
          ? "Version property confirmed. Syncing PostHog for release cohorts…"
          : "Version property saved unconfirmed.",
      );
      if (confirm) {
        await fetch("/api/connections/posthog/sync", { method: "POST" });
      }
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "confirm_failed");
    } finally {
      setBusy("");
    }
  }

  async function syncProvider(provider: "revenuecat" | "posthog") {
    setBusy(`sync-${provider}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/connections/${provider}/sync`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "sync_failed");
        return;
      }
      setMessage(
        `${provider === "revenuecat" ? "RevenueCat" : "PostHog"} import queued. Refresh in a minute.`,
      );
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "sync_failed");
    } finally {
      setBusy("");
    }
  }

  async function createToken() {
    setBusy("token");
    setError("");
    setNewToken(null);
    try {
      const response = await fetch("/api/agent-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appId, name: "Coding agent" }),
      });
      const payload = (await response.json()) as {
        data?: { token?: string };
        error?: string;
      };
      if (!response.ok) {
        setError(
          payload.error === "agent_bridge_requires_pro"
            ? "Agent Bridge needs Pro (or active trial)."
            : (payload.error ?? "token_create_failed"),
        );
        return;
      }
      setNewToken(payload.data?.token ?? null);
      await loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "token_create_failed");
    } finally {
      setBusy("");
    }
  }

  async function revokeToken(id: string) {
    setBusy("token");
    try {
      await fetch(`/api/agent-tokens/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await loadTokens();
    } finally {
      setBusy("");
    }
  }

  const step = !rc
    ? 1
    : !ph
      ? 2
      : data?.mapping?.status !== "confirmed" &&
          data?.mapping?.status !== "manual"
        ? 3
        : data?.mapping?.versionPropertyStatus !== "confirmed"
          ? 4
          : 5;

  return (
    <div className="growth-ci-workspace growth-ci-settings">
      <header className="growth-ci-header">
        <div>
          <h1>Get to your first release verdict</h1>
          <p className="growth-ci-subtle">
            Step {Math.min(step, 4)} of 4 — connect money + behavior, confirm
            events and version, import data.
          </p>
        </div>
        <button
          type="button"
          className="growth-ci-icon-btn"
          onClick={() => void refreshAll()}
          aria-label="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </header>

      {error ? (
        <div className="growth-ci-banner growth-ci-banner--error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="growth-ci-banner growth-ci-banner--ok" role="status">
          {message}
        </div>
      ) : null}

      {readiness ? (
        <section className="growth-ci-card">
          <h3>
            <PlugZap size={16} /> Readiness
          </h3>
          <ul className="growth-ci-readiness-list">
            {[readiness.money, readiness.activation, readiness.version].map(
              (item) => (
                <li key={item.label} data-status={item.status}>
                  <strong>{item.label}</strong>
                  <span className="growth-ci-pill">{item.status}</span>
                  <p className="growth-ci-subtle">{item.detail}</p>
                </li>
              ),
            )}
          </ul>
          <p>
            <strong>Next:</strong> {readiness.nextAction}
          </p>
        </section>
      ) : null}

      {/* Step 1 — RevenueCat */}
      <section className="growth-ci-card" data-step="1">
        <h3>
          <Link2 size={16} /> 1. RevenueCat (money)
        </h3>
        {rc ? (
          <>
            <p>
              Connected · <strong>{rc.status}</strong>
              {rc.lastSuccessAt
                ? ` · last sync ${new Date(rc.lastSuccessAt).toLocaleString()}`
                : ""}
            </p>
            <button
              type="button"
              className="growth-ci-btn"
              disabled={busy === "sync-revenuecat"}
              onClick={() => void syncProvider("revenuecat")}
            >
              {busy === "sync-revenuecat" ? "Queueing…" : "Import RevenueCat now"}
            </button>
          </>
        ) : (
          <>
            <p className="growth-ci-subtle">
              Create a v2 secret key with Charts read access. Paste API key +
              Project ID.
            </p>
            <label className="growth-ci-add-label">
              V2 secret API key
              <input
                type="password"
                value={rcApiKey}
                onChange={(e) => setRcApiKey(e.target.value)}
                placeholder="sk_…"
                autoComplete="off"
              />
            </label>
            <label className="growth-ci-add-label">
              Project ID
              <input
                value={rcProjectId}
                onChange={(e) => setRcProjectId(e.target.value)}
                placeholder="proj…"
              />
            </label>
            <button
              type="button"
              className="growth-ci-btn"
              disabled={busy === "rc" || !rcApiKey || !rcProjectId}
              onClick={() => void connectRevenueCat()}
            >
              {busy === "rc" ? (
                <>
                  <LoaderCircle size={16} className="spin" /> Connecting…
                </>
              ) : (
                "Connect RevenueCat"
              )}
            </button>
          </>
        )}
      </section>

      {/* Step 2 — PostHog */}
      <section className="growth-ci-card" data-step="2">
        <h3>
          <Link2 size={16} /> 2. PostHog (behavior)
        </h3>
        {ph ? (
          <>
            <p>
              Connected · <strong>{ph.status}</strong>
              {ph.lastSuccessAt
                ? ` · last sync ${new Date(ph.lastSuccessAt).toLocaleString()}`
                : ""}
            </p>
            <div className="growth-ci-actions">
              <button
                type="button"
                className="growth-ci-btn"
                disabled={busy === "sync-posthog"}
                onClick={() => void syncProvider("posthog")}
              >
                {busy === "sync-posthog" ? "Queueing…" : "Import PostHog now"}
              </button>
              <button
                type="button"
                className="growth-ci-btn growth-ci-btn--ghost"
                disabled={loadingEvents}
                onClick={() => void loadEvents()}
              >
                {loadingEvents ? "Loading events…" : "Reload events"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="growth-ci-subtle">
              Prefer OAuth (recommended). Or paste a personal API key with project
              + query read access.
            </p>
            <a className="growth-ci-btn" href="/api/oauth/posthog/start">
              Continue with PostHog OAuth
            </a>
            <p className="growth-ci-subtle" style={{ marginTop: "1rem" }}>
              Or connect with a personal API key:
            </p>
            <label className="growth-ci-add-label">
              Personal API key
              <input
                type="password"
                value={phKey}
                onChange={(e) => setPhKey(e.target.value)}
                placeholder="phx_…"
                autoComplete="off"
              />
            </label>
            <label className="growth-ci-add-label">
              Project ID
              <input
                value={phProjectId}
                onChange={(e) => setPhProjectId(e.target.value)}
                placeholder="12345"
              />
            </label>
            <label className="growth-ci-add-label">
              Host
              <select
                value={phHost}
                onChange={(e) => setPhHost(e.target.value)}
              >
                <option value="https://us.posthog.com">US (us.posthog.com)</option>
                <option value="https://eu.posthog.com">EU (eu.posthog.com)</option>
              </select>
            </label>
            <button
              type="button"
              className="growth-ci-btn"
              disabled={busy === "ph" || !phKey || !phProjectId}
              onClick={() => void connectPostHogKey()}
            >
              {busy === "ph" ? "Connecting…" : "Connect with API key"}
            </button>
          </>
        )}
      </section>

      {/* Step 3 — events */}
      <section className="growth-ci-card" data-step="3">
        <h3>
          <CheckCircle2 size={16} /> 3. Session + activation events
        </h3>
        {!ph ? (
          <p className="growth-ci-subtle">Connect PostHog first.</p>
        ) : (
          <>
            <p className="growth-ci-subtle">
              Confirm which events mean “session / active use” and “first value”.
              Unconfirmed maps cannot produce a regression verdict.
            </p>
            <label className="growth-ci-add-label">
              Session event
              <select
                value={sessionEvent}
                onChange={(e) => setSessionEvent(e.target.value)}
              >
                <option value="">Select…</option>
                {sortedEvents.map((event) => (
                  <option key={event.name} value={event.name}>
                    {event.name} · {event.uniqueUsers} users
                  </option>
                ))}
              </select>
            </label>
            <label className="growth-ci-add-label">
              Activation event
              <select
                value={activationEvent}
                onChange={(e) => setActivationEvent(e.target.value)}
              >
                <option value="">Select…</option>
                {sortedEvents.map((event) => (
                  <option key={`a-${event.name}`} value={event.name}>
                    {event.name} · {event.uniqueUsers} users
                  </option>
                ))}
              </select>
            </label>
            {sessionEvent && activationEvent && sessionEvent === activationEvent ? (
              <p className="growth-ci-banner growth-ci-banner--error">
                Session and activation must be different events.
              </p>
            ) : null}
            <button
              type="button"
              className="growth-ci-btn"
              disabled={
                busy === "events" ||
                !sessionEvent ||
                !activationEvent ||
                sessionEvent === activationEvent
              }
              onClick={() => void confirmEvents()}
            >
              {busy === "events"
                ? "Saving…"
                : "Confirm events and import"}
            </button>
            <p className="growth-ci-subtle">
              Mapping status: {data?.mapping?.status || "unknown"}
            </p>
          </>
        )}
      </section>

      {/* Step 4 — version */}
      <section className="growth-ci-card" data-step="4">
        <h3>
          <CheckCircle2 size={16} /> 4. Version property
        </h3>
        {!ph ? (
          <p className="growth-ci-subtle">Connect PostHog first.</p>
        ) : (
          <>
            <p className="growth-ci-subtle">
              Which property on the session event is the app version? Prefer{" "}
              <code>$app_version</code> or <code>app_version</code>.
            </p>
            <div className="growth-ci-actions">
              <button
                type="button"
                className="growth-ci-btn"
                disabled={discovering}
                onClick={() => void discoverVersions()}
              >
                {discovering ? (
                  <>
                    <LoaderCircle size={16} className="spin" /> Discovering…
                  </>
                ) : (
                  "Discover from PostHog"
                )}
              </button>
            </div>
            {candidates.length > 0 ? (
              <ul className="growth-ci-add-results">
                {candidates.map((candidate) => (
                  <li key={candidate.key}>
                    <button
                      type="button"
                      onClick={() => setSelectedVersion(candidate.key)}
                      aria-pressed={selectedVersion === candidate.key}
                    >
                      <span />
                      <span>
                        <strong>{candidate.key}</strong>
                        <small>
                          score {candidate.score} ·{" "}
                          {candidate.sampleValues.slice(0, 4).join(", ") || "—"}
                        </small>
                      </span>
                      <span className="growth-ci-add-action">
                        {selectedVersion === candidate.key
                          ? "Selected"
                          : "Select"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="growth-ci-add-label">
              Version property key
              <input
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
                placeholder="$app_version"
              />
            </label>
            <label className="growth-ci-add-label">
              Build property (optional)
              <input
                value={buildProperty}
                onChange={(e) => setBuildProperty(e.target.value)}
                placeholder="build_number"
              />
            </label>
            <button
              type="button"
              className="growth-ci-btn"
              disabled={busy === "version" || !selectedVersion}
              onClick={() => void confirmVersion(true)}
            >
              {busy === "version"
                ? "Saving…"
                : "Confirm version and import cohorts"}
            </button>
            <p className="growth-ci-subtle">
              Version status:{" "}
              {data?.mapping?.versionPropertyStatus || "unconfirmed"}
              {data?.mapping?.versionProperty
                ? ` (${data.mapping.versionProperty})`
                : ""}
            </p>
          </>
        )}
      </section>

      <section className="growth-ci-card">
        <h3>
          <ShieldCheck size={16} /> Access
        </h3>
        <p>
          {access?.reason === "paid"
            ? "Pro — continuous monitoring + Agent Bridge."
            : access?.reason === "trial"
              ? "Trial — full Growth CI while the trial is active."
              : access?.reason === "free_first_verdict"
                ? "Free — first complete release verdict is free. Agent Bridge needs Pro."
                : "Free first verdict used — upgrade for ongoing monitoring."}
        </p>
      </section>

      <section className="growth-ci-card">
        <h3>Growth Contract</h3>
        {data?.contract?.thresholds ? (
          <dl className="growth-ci-dl">
            <div>
              <dt>Min new users</dt>
              <dd>{data.contract.thresholds.minimumNewUsers}</dd>
            </div>
            <div>
              <dt>Activation window</dt>
              <dd>{data.contract.thresholds.activationWindowDays}d</dd>
            </div>
            <div>
              <dt>Max collection</dt>
              <dd>{data.contract.thresholds.maximumCollectionDays}d</dd>
            </div>
          </dl>
        ) : null}
        {data?.contract?.yaml ? (
          <button
            type="button"
            className="growth-ci-btn growth-ci-btn--ghost"
            onClick={() => {
              void navigator.clipboard.writeText(data.contract.yaml);
              setMessage("appclimb.yml copied.");
            }}
          >
            <Copy size={14} /> Copy appclimb.yml
          </button>
        ) : null}
      </section>

      <section className="growth-ci-card">
        <h3>
          <Bot size={16} /> Agent Bridge
        </h3>
        <p className="growth-ci-subtle">
          After a confirmed regression, your coding agent claims one task via
          token. Shown once only.
        </p>
        {newToken ? (
          <div className="growth-ci-banner growth-ci-banner--ok">
            <p>
              <strong>Copy now:</strong>
            </p>
            <code style={{ wordBreak: "break-all" }}>{newToken}</code>
            <button
              type="button"
              className="growth-ci-btn"
              onClick={() => void navigator.clipboard.writeText(newToken)}
            >
              <Copy size={14} /> Copy token
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="growth-ci-btn"
          disabled={busy === "token" || access?.canUseAgentBridge === false}
          onClick={() => void createToken()}
        >
          <KeyRound size={14} /> Create agent token
        </button>
        {tokens.length ? (
          <ul className="growth-ci-token-list">
            {tokens.map((token) => (
              <li key={token.id}>
                <span>
                  <strong>{token.name}</strong> · {token.prefix}…
                  {token.revokedAt ? " (revoked)" : ""}
                </span>
                {!token.revokedAt ? (
                  <button
                    type="button"
                    className="growth-ci-btn growth-ci-btn--ghost"
                    disabled={busy === "token"}
                    onClick={() => void revokeToken(token.id)}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {props.onOpenLegacySources ? (
        <p className="growth-ci-subtle">
          Need revoke for App Store Connect / Superwall leftovers?{" "}
          <button
            type="button"
            className="growth-ci-btn growth-ci-btn--ghost"
            onClick={props.onOpenLegacySources}
          >
            Open full source manager
          </button>
        </p>
      ) : null}
    </div>
  );
}
