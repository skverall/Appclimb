"use client";

import { useCallback, useEffect, useState } from "react";
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

export function GrowthCiSettings(props: {
  appId: string;
  snapshot: GrowthCiSnapshot | null;
  onRefresh: () => void;
  onOpenLegacySources?: () => void;
}) {
  const { appId, snapshot, onRefresh } = props;
  const [candidates, setCandidates] = useState<VersionCandidate[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState(
    snapshot?.mapping?.versionProperty ?? "",
  );
  const [buildProperty, setBuildProperty] = useState(
    snapshot?.mapping?.buildProperty ?? "",
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
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
  const [tokenBusy, setTokenBusy] = useState(false);

  const access = snapshot?.access;
  const readiness = snapshot?.readiness;

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

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    setSelectedVersion(snapshot?.mapping?.versionProperty ?? "");
    setBuildProperty(snapshot?.mapping?.buildProperty ?? "");
    const cached = snapshot?.mapping?.versionCandidates;
    if (Array.isArray(cached) && cached.length) {
      setCandidates(cached as VersionCandidate[]);
    }
  }, [snapshot]);

  // If Settings is opened before Growth home loaded a snapshot, fetch once.
  useEffect(() => {
    if (snapshot || !appId) return;
    void fetch(`/api/growth-ci?appId=${encodeURIComponent(appId)}`, {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((payload: unknown) => {
        const data = (payload as { data?: GrowthCiSnapshot })?.data;
        if (data) onRefresh();
      })
      .catch(() => undefined);
  }, [appId, snapshot, onRefresh]);

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
          ? `Found ${list.length} candidate properties.`
          : "No version-like properties found on the session event yet.",
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
    setConfirming(true);
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
          ? "Version property confirmed. Sync PostHog to evaluate releases."
          : "Version property saved as unconfirmed.",
      );
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "confirm_failed");
    } finally {
      setConfirming(false);
    }
  }

  async function createToken() {
    setTokenBusy(true);
    setError("");
    setNewToken(null);
    try {
      const response = await fetch("/api/agent-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appId,
          name: "Coding agent",
        }),
      });
      const payload = (await response.json()) as {
        data?: { token?: string };
        error?: string;
      };
      if (!response.ok) {
        setError(
          payload.error === "agent_bridge_requires_pro"
            ? "Agent Bridge requires Pro (or an active trial)."
            : (payload.error ?? "token_create_failed"),
        );
        return;
      }
      setNewToken(payload.data?.token ?? null);
      await loadTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "token_create_failed");
    } finally {
      setTokenBusy(false);
    }
  }

  async function revokeToken(id: string) {
    setTokenBusy(true);
    try {
      await fetch(`/api/agent-tokens/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      await loadTokens();
    } finally {
      setTokenBusy(false);
    }
  }

  const sources = snapshot?.sources ?? [];
  const rc = sources.find((s) => s.provider === "revenuecat");
  const ph = sources.find((s) => s.provider === "posthog");

  return (
    <div className="growth-ci-workspace growth-ci-settings">
      <header className="growth-ci-header">
        <div>
          <h1>Settings</h1>
          <p className="growth-ci-subtle">
            RevenueCat + PostHog, measurement contract, and Agent Bridge.
          </p>
        </div>
        <button
          type="button"
          className="growth-ci-icon-btn"
          onClick={onRefresh}
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

      {access ? (
        <section className="growth-ci-card">
          <h3>
            <ShieldCheck size={16} /> Plan access
          </h3>
          <p>
            {access.reason === "paid"
              ? "Pro access — automatic release checks and Agent Bridge enabled."
              : access.reason === "trial"
                ? "Trial access — full Growth CI automation while the trial is active."
                : access.reason === "free_first_verdict"
                  ? "Free plan — first complete release verdict is free. Agent Bridge requires Pro."
                  : "Free first verdict used — upgrade to Pro for ongoing monitoring and Agent Bridge."}
          </p>
          <ul className="growth-ci-subtle">
            <li>
              Release checks:{" "}
              {access.canRunReleaseChecks ? "allowed" : "blocked"}
            </li>
            <li>
              Agent Bridge:{" "}
              {access.canUseAgentBridge ? "allowed" : "Pro required"}
            </li>
          </ul>
        </section>
      ) : null}

      <section className="growth-ci-card">
        <h3>
          <PlugZap size={16} /> Measurement readiness
        </h3>
        {readiness ? (
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
        ) : (
          <p className="growth-ci-subtle">Loading readiness…</p>
        )}
        {readiness ? (
          <p>
            <strong>Next:</strong> {readiness.nextAction}
          </p>
        ) : null}
      </section>

      <section className="growth-ci-grid">
        <article className="growth-ci-card">
          <h3>
            <Link2 size={16} /> RevenueCat
          </h3>
          <p>
            Status: <strong>{rc?.status ?? "not connected"}</strong>
          </p>
          {rc?.lastSuccessAt ? (
            <p className="growth-ci-subtle">
              Last sync {new Date(rc.lastSuccessAt).toLocaleString()}
            </p>
          ) : null}
          <p className="growth-ci-subtle">
            Money ledger for trials, paid, renewals, and revenue (read-only).
          </p>
          {props.onOpenLegacySources ? (
            <button
              type="button"
              className="growth-ci-btn"
              onClick={props.onOpenLegacySources}
            >
              {rc ? "Manage connection" : "Connect RevenueCat"}
            </button>
          ) : null}
        </article>

        <article className="growth-ci-card">
          <h3>
            <Link2 size={16} /> PostHog
          </h3>
          <p>
            Status: <strong>{ph?.status ?? "not connected"}</strong>
          </p>
          {snapshot?.mapping ? (
            <dl className="growth-ci-dl">
              <div>
                <dt>Session</dt>
                <dd>{snapshot.mapping.sessionEvent || "—"}</dd>
              </div>
              <div>
                <dt>Activation</dt>
                <dd>{snapshot.mapping.activationEvent || "—"}</dd>
              </div>
              <div>
                <dt>Mapping</dt>
                <dd>{snapshot.mapping.status || "—"}</dd>
              </div>
              <div>
                <dt>Version</dt>
                <dd>
                  {snapshot.mapping.versionProperty || "—"} (
                  {snapshot.mapping.versionPropertyStatus || "unconfirmed"})
                </dd>
              </div>
            </dl>
          ) : null}
          {props.onOpenLegacySources ? (
            <button
              type="button"
              className="growth-ci-btn"
              onClick={props.onOpenLegacySources}
            >
              {ph ? "Manage PostHog / events" : "Connect PostHog"}
            </button>
          ) : null}
        </article>
      </section>

      <section className="growth-ci-card">
        <h3>
          <CheckCircle2 size={16} /> Version property
        </h3>
        <p className="growth-ci-subtle">
          AppClimb never trusts a guessed property for confirmed regressions.
          Discover candidates, then confirm explicitly.
        </p>
        <div className="growth-ci-actions">
          <button
            type="button"
            className="growth-ci-btn"
            disabled={discovering || !ph}
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
                      score {candidate.score} · samples:{" "}
                      {candidate.sampleValues.slice(0, 4).join(", ") || "—"}
                    </small>
                  </span>
                  <span className="growth-ci-add-action">
                    {selectedVersion === candidate.key ? "Selected" : "Select"}
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
            onChange={(event) => setSelectedVersion(event.target.value)}
            placeholder="$app_version"
          />
        </label>
        <label className="growth-ci-add-label">
          Build property (optional)
          <input
            value={buildProperty}
            onChange={(event) => setBuildProperty(event.target.value)}
            placeholder="build_number"
          />
        </label>
        <div className="growth-ci-actions">
          <button
            type="button"
            className="growth-ci-btn"
            disabled={confirming || !selectedVersion}
            onClick={() => void confirmVersion(true)}
          >
            {confirming ? "Saving…" : "Confirm version property"}
          </button>
          <button
            type="button"
            className="growth-ci-btn growth-ci-btn--ghost"
            disabled={confirming || !selectedVersion}
            onClick={() => void confirmVersion(false)}
          >
            Save without confirm
          </button>
        </div>
      </section>

      <section className="growth-ci-card">
        <h3>Growth Contract</h3>
        <p className="growth-ci-subtle">
          Server-owned defaults (visible, not a wall of onboarding knobs).
        </p>
        {snapshot?.contract?.thresholds ? (
          <dl className="growth-ci-dl">
            <div>
              <dt>Min new users</dt>
              <dd>{snapshot.contract.thresholds.minimumNewUsers}</dd>
            </div>
            <div>
              <dt>Activation window</dt>
              <dd>{snapshot.contract.thresholds.activationWindowDays}d</dd>
            </div>
            <div>
              <dt>Max collection</dt>
              <dd>{snapshot.contract.thresholds.maximumCollectionDays}d</dd>
            </div>
            <div>
              <dt>Contract</dt>
              <dd>v{snapshot.contract.version}</dd>
            </div>
          </dl>
        ) : null}
        {snapshot?.contract?.yaml ? (
          <div className="growth-ci-actions">
            <button
              type="button"
              className="growth-ci-btn growth-ci-btn--ghost"
              onClick={() => {
                void navigator.clipboard.writeText(snapshot.contract.yaml);
                setMessage("appclimb.yml copied.");
              }}
            >
              <Copy size={14} /> Copy appclimb.yml
            </button>
          </div>
        ) : null}
      </section>

      <section className="growth-ci-card">
        <h3>
          <Bot size={16} /> Agent Bridge
        </h3>
        <p className="growth-ci-subtle">
          Create a scoped token for Hermes / Codex / Grok / Claude. Raw token is
          shown once. Set <code>APPCLIMB_AGENT_TOKEN</code>.
        </p>
        {newToken ? (
          <div className="growth-ci-banner growth-ci-banner--ok">
            <p>
              <strong>Copy now — this is the only time it is shown:</strong>
            </p>
            <code style={{ wordBreak: "break-all" }}>{newToken}</code>
            <div className="growth-ci-actions">
              <button
                type="button"
                className="growth-ci-btn"
                onClick={() => {
                  void navigator.clipboard.writeText(newToken);
                }}
              >
                <Copy size={14} /> Copy token
              </button>
            </div>
          </div>
        ) : null}
        <div className="growth-ci-actions">
          <button
            type="button"
            className="growth-ci-btn"
            disabled={tokenBusy || access?.canUseAgentBridge === false}
            onClick={() => void createToken()}
          >
            <KeyRound size={14} /> Create agent token
          </button>
        </div>
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
                    disabled={tokenBusy}
                    onClick={() => void revokeToken(token.id)}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="growth-ci-subtle">No tokens yet.</p>
        )}
        <p className="growth-ci-subtle">
          Skill docs: <code>docs/agent-skill/appclimb-growth-ci.md</code>
        </p>
      </section>

      {props.onOpenLegacySources ? (
        <p className="growth-ci-subtle">
          Need to revoke App Store Connect or Superwall leftovers?{" "}
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
