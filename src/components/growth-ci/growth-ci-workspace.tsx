"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Bot,
  RefreshCw,
  Settings2,
  Shield,
} from "lucide-react";

export interface GrowthCiSnapshot {
  product: "growth_ci";
  app: {
    id: string;
    name: string;
    iconUrl: string | null;
    bundleId: string | null;
  };
  sources: Array<{
    provider: string;
    status: string;
    lastSuccessAt: string | null;
  }>;
  mapping: {
    status: string;
    mode?: string;
    confidence?: number;
    sessionEvent: string;
    activationEvent: string;
    versionProperty: string;
    buildProperty?: string;
    versionPropertyStatus: string;
    versionPropertyConfirmedAt?: string | null;
    activationWindowDays?: number;
    confirmedAt?: string | null;
    versionCandidates?: unknown[];
  } | null;
  readiness?: {
    money: { status: string; label: string; detail: string };
    activation: { status: string; label: string; detail: string };
    version: { status: string; label: string; detail: string };
    overall: string;
    nextAction: string;
  };
  access?: {
    freeVerdictRemaining: boolean;
    canRunReleaseChecks: boolean;
    canUseAgentBridge: boolean;
    reason: string;
  };
  contract: {
    version: string;
    freeVerdictConsumedAt: string | null;
    yaml: string;
    thresholds?: {
      minimumNewUsers: number;
      activationWindowDays: number;
      maximumCollectionDays: number;
    };
  };
  latestRelease: {
    id: string;
    version: string;
    buildNumber: string;
    firstSeenAt: string;
    firstObservedLabel: string;
    verdict: string | null;
    confidenceScore: number | null;
    confidenceLevel: string | null;
    currentValue: number | null;
    baselineValue: number | null;
    currentSample: number | null;
    baselineSample: number | null;
    absoluteChange: number | null;
    relativeChange: number | null;
    limitations: string[];
    nextCheckAt: string | null;
    baselineMethod: string | null;
    checkStatus: string | null;
  } | null;
  history: Array<{
    id: string;
    version: string;
    buildNumber: string;
    firstSeenAt: string;
    verdict: string | null;
    confidenceScore: number | null;
    outcome?: string | null;
  }>;
  incident: {
    id: string;
    title: string;
    summary: string;
    severity: string;
    status: string;
    outcome: string | null;
  } | null;
  task: {
    id: string;
    status: string;
    packet: Record<string, unknown>;
    claimedBy: string | null;
    branchName: string | null;
    commitSha: string | null;
    pullRequestUrl: string | null;
  } | null;
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 1000) / 10}%`;
}

function verdictTone(verdict: string | null | undefined): string {
  switch (verdict) {
    case "regression":
      return "growth-ci-verdict--bad";
    case "improvement":
      return "growth-ci-verdict--good";
    case "healthy":
      return "growth-ci-verdict--ok";
    case "collecting":
      return "growth-ci-verdict--wait";
    case "configuration_required":
      return "growth-ci-verdict--config";
    default:
      return "growth-ci-verdict--muted";
  }
}

export function GrowthCiWorkspace(props: {
  snapshot: GrowthCiSnapshot | null;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onOpenSettings?: () => void;
  onAddApp?: () => void;
  onDismissIncident?: (incidentId: string) => void;
  onCopyTask?: () => void;
  onUpgrade?: () => void;
}) {
  const { snapshot, loading, error } = props;
  const release = snapshot?.latestRelease;
  const task = snapshot?.task;
  const incident = snapshot?.incident;

  return (
    <div className="growth-ci-workspace">
      <header className="growth-ci-header">
        <div className="growth-ci-app">
          {snapshot?.app.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={snapshot.app.iconUrl}
              alt=""
              width={40}
              height={40}
              className="growth-ci-app-icon"
            />
          ) : (
            <div className="growth-ci-app-icon growth-ci-app-icon--empty" />
          )}
          <div>
            <h1>{snapshot?.app.name ?? "Your iOS app"}</h1>
            <p className="growth-ci-subtle">
              {release
                ? `${release.version}${release.buildNumber ? ` (${release.buildNumber})` : ""} · ${release.firstObservedLabel}`
                : "Connect RevenueCat + PostHog in Settings to evaluate releases"}
            </p>
          </div>
        </div>
        <div className="growth-ci-header-actions">
          {props.onAddApp ? (
            <button
              type="button"
              className="growth-ci-btn"
              onClick={props.onAddApp}
            >
              Add iOS app
            </button>
          ) : null}
          <button
            type="button"
            className="growth-ci-icon-btn"
            onClick={props.onRefresh}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            className="growth-ci-icon-btn"
            onClick={props.onOpenSettings}
            aria-label="Settings"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="growth-ci-banner growth-ci-banner--error" role="alert">
          {error}
        </div>
      ) : null}

      {!snapshot && loading ? (
        <p className="growth-ci-subtle">Loading Growth CI…</p>
      ) : null}

      {snapshot ? (
        <>
          {snapshot.readiness && snapshot.readiness.overall !== "ready" ? (
            <section className="growth-ci-verdict growth-ci-verdict--config">
              <div>
                <h2 id="growth-ci-verdict-title">Finish setup to evaluate releases</h2>
                <p>{snapshot.readiness.nextAction}</p>
                <ul className="growth-ci-readiness-list" style={{ marginTop: "0.75rem" }}>
                  {[
                    snapshot.readiness.money,
                    snapshot.readiness.activation,
                    snapshot.readiness.version,
                  ].map((item) => (
                    <li key={item.label} data-status={item.status}>
                      <strong>{item.label}</strong>
                      <span className="growth-ci-pill">{item.status}</span>
                      <p className="growth-ci-subtle">{item.detail}</p>
                    </li>
                  ))}
                </ul>
                <div className="growth-ci-actions">
                  <button
                    type="button"
                    className="growth-ci-btn"
                    onClick={props.onOpenSettings}
                  >
                    Continue setup in Settings
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {snapshot.readiness?.overall === "ready" && !release ? (
            <section className="growth-ci-verdict growth-ci-verdict--wait">
              <div>
                <h2>Measurement is ready — waiting for release cohorts</h2>
                <p>
                  Import PostHog again after users ship with the confirmed version
                  property. AppClimb will open a verdict when a mature new-user
                  cohort is available (default: 30 users, activation window).
                </p>
                <div className="growth-ci-actions">
                  <button
                    type="button"
                    className="growth-ci-btn"
                    onClick={props.onOpenSettings}
                  >
                    Import / check connections
                  </button>
                  <button
                    type="button"
                    className="growth-ci-btn growth-ci-btn--ghost"
                    onClick={props.onRefresh}
                  >
                    Refresh verdicts
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {snapshot.access?.reason === "free_exhausted" ? (
            <div className="growth-ci-banner growth-ci-banner--error">
              Free first verdict used. Upgrade to Pro for ongoing release
              monitoring and Agent Bridge.
              {props.onUpgrade ? (
                <button
                  type="button"
                  className="growth-ci-btn"
                  style={{ marginLeft: "0.75rem" }}
                  onClick={props.onUpgrade}
                >
                  Upgrade to Pro
                </button>
              ) : null}
            </div>
          ) : snapshot.access?.reason === "free_first_verdict" ? (
            <div className="growth-ci-banner growth-ci-banner--ok">
              Free plan: your first complete release verdict is free. Agent
              Bridge requires Pro.
            </div>
          ) : null}

          <section
            className={`growth-ci-verdict ${verdictTone(release?.verdict)}`}
            aria-labelledby="growth-ci-verdict-title"
          >
            <div className="growth-ci-verdict-icon">
              {release?.verdict === "collecting" ? (
                <Clock3 size={22} />
              ) : release?.verdict === "regression" ? (
                <AlertTriangle size={22} />
              ) : release?.verdict === "healthy" ||
                release?.verdict === "improvement" ? (
                <CheckCircle2 size={22} />
              ) : (
                <Shield size={22} />
              )}
            </div>
            <div>
              <h2 id="growth-ci-verdict-title">
                {incident?.title ||
                  (release?.verdict === "collecting"
                    ? `Evaluating ${release.version}`
                    : release?.verdict === "configuration_required"
                      ? "Measurement configuration required"
                      : release?.verdict === "inconclusive"
                        ? "Not enough evidence for this release"
                        : release?.verdict === "healthy"
                          ? `No material regression detected in ${release.version}`
                          : release?.verdict === "improvement"
                            ? `Activation improved after ${release.version}`
                            : release?.verdict === "regression"
                              ? `Activation regressed after ${release.version}`
                              : "Waiting for the first release")}
              </h2>
              <p>
                {incident?.summary ||
                  (release
                    ? `${pct(release.baselineValue)} → ${pct(release.currentValue)} · ${release.baselineSample ?? "—"} vs ${release.currentSample ?? "—"} users${
                        release.confidenceLevel
                          ? ` · ${release.confidenceLevel} confidence`
                          : ""
                      }`
                    : "Add your App Store app, connect RevenueCat and PostHog, and confirm session, activation, and version mappings.")}
              </p>
              {release?.verdict === "collecting" && release.nextCheckAt ? (
                <p className="growth-ci-subtle">
                  Next check after the activation window matures (
                  {new Date(release.nextCheckAt).toLocaleString()}).
                </p>
              ) : null}
            </div>
          </section>

          <section className="growth-ci-grid">
            <article className="growth-ci-card">
              <h3>Evidence</h3>
              {release?.verdict && release.verdict !== "configuration_required" ? (
                <dl className="growth-ci-dl">
                  <div>
                    <dt>Baseline</dt>
                    <dd>{pct(release.baselineValue)}</dd>
                  </div>
                  <div>
                    <dt>Current</dt>
                    <dd>{pct(release.currentValue)}</dd>
                  </div>
                  <div>
                    <dt>Sample</dt>
                    <dd>
                      {release.baselineSample ?? "—"} / {release.currentSample ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Change</dt>
                    <dd>
                      {release.absoluteChange !== null &&
                      release.absoluteChange !== undefined
                        ? `${(release.absoluteChange * 100).toFixed(1)} pp`
                        : "—"}
                      {release.relativeChange !== null &&
                      release.relativeChange !== undefined
                        ? ` (${(release.relativeChange * 100).toFixed(1)}%)`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Baseline method</dt>
                    <dd>{release.baselineMethod ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>PostHog version cohort (verified connector)</dd>
                  </div>
                </dl>
              ) : (
                <p className="growth-ci-subtle">
                  Evidence appears after a mature release cohort is evaluated.
                  Missing data is not zero.
                </p>
              )}
              {release?.limitations?.length ? (
                <ul className="growth-ci-limitations">
                  {release.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </article>

            <article className="growth-ci-card">
              <h3>
                <Bot size={16} aria-hidden /> Growth Task
              </h3>
              {task ? (
                <>
                  <p className="growth-ci-task-title">
                    {(task.packet.incident as { title?: string } | undefined)
                      ?.title || incident?.title}
                  </p>
                  <p className="growth-ci-subtle">
                    Status: <strong>{task.status}</strong>
                    {task.claimedBy ? ` · claimed by ${task.claimedBy}` : ""}
                  </p>
                  {task.branchName || task.commitSha ? (
                    <p className="growth-ci-subtle">
                      {task.branchName}
                      {task.commitSha ? ` @ ${task.commitSha.slice(0, 7)}` : ""}
                    </p>
                  ) : null}
                  <p className="growth-ci-hypothesis">
                    Hypothesis (inference, not observation):{" "}
                    {(
                      task.packet.hypothesis as
                        | { text?: string }
                        | undefined
                    )?.text ||
                      "A change in the release may have added friction or broken activation instrumentation."}
                  </p>
                  <div className="growth-ci-actions">
                    <button
                      type="button"
                      className="growth-ci-btn"
                      onClick={props.onCopyTask}
                    >
                      Copy task JSON
                    </button>
                    {incident &&
                    ["open", "in_progress"].includes(incident.status) ? (
                      <button
                        type="button"
                        className="growth-ci-btn growth-ci-btn--ghost"
                        onClick={() => props.onDismissIncident?.(incident.id)}
                      >
                        Dismiss
                      </button>
                    ) : null}
                  </div>
                  <p className="growth-ci-subtle">
                    Agents claim this task via Agent Bridge. AppClimb never merges
                    or deploys for you.
                  </p>
                </>
              ) : (
                <p className="growth-ci-subtle">
                  No open growth task. A confirmed regression creates exactly one
                  task for your coding agent.
                </p>
              )}
            </article>

            <article className="growth-ci-card">
              <h3>Verification</h3>
              {incident?.status === "awaiting_verification" ? (
                <p>
                  Waiting for a mature fix-release cohort. Agent “done” claims do
                  not close this incident.
                </p>
              ) : incident?.status === "closed" ? (
                <p>
                  Closed: <strong>{incident.outcome ?? "unknown"}</strong>
                </p>
              ) : incident ? (
                <p className="growth-ci-subtle">
                  Verification starts after a fix release is reported and shipped.
                </p>
              ) : (
                <p className="growth-ci-subtle">
                  When a fix ships, AppClimb compares the new release to the
                  broken origin and original baseline.
                </p>
              )}
            </article>
          </section>

          <section className="growth-ci-card">
            <h3>Release history</h3>
            {snapshot.history.length === 0 ? (
              <p className="growth-ci-subtle">No releases observed yet.</p>
            ) : (
              <table className="growth-ci-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Verdict</th>
                    <th>Confidence</th>
                    <th>First observed</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.history.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.version}
                        {row.buildNumber ? ` (${row.buildNumber})` : ""}
                      </td>
                      <td>{row.verdict ?? "—"}</td>
                      <td>{row.confidenceScore ?? "—"}</td>
                      <td>{new Date(row.firstSeenAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="growth-ci-card growth-ci-sources-row">
            <h3>Connections</h3>
            <ul>
              {["revenuecat", "posthog"].map((provider) => {
                const source = snapshot.sources.find(
                  (s) => s.provider === provider,
                );
                return (
                  <li key={provider}>
                    <strong>{provider}</strong>:{" "}
                    {source?.status ?? "not connected"}
                    {source?.lastSuccessAt
                      ? ` · last sync ${new Date(source.lastSuccessAt).toLocaleString()}`
                      : ""}
                  </li>
                );
              })}
            </ul>
            <p className="growth-ci-subtle">
              Manage connections, measurement mapping, Growth Contract, and Agent
              Bridge tokens in Settings.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}

export function useGrowthCiSnapshot(
  appId: string | null,
  fetchJson: (path: string) => Promise<unknown>,
) {
  const [snapshot, setSnapshot] = useState<GrowthCiSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    setError(null);
    try {
      const response = (await fetchJson(
        `/v1/growth-ci?appId=${encodeURIComponent(appId)}`,
      )) as { data?: GrowthCiSnapshot; error?: string };
      if (response?.data) setSnapshot(response.data);
      else setError(response?.error ?? "growth_ci_unavailable");
    } catch (err) {
      setError(err instanceof Error ? err.message : "growth_ci_unavailable");
    } finally {
      setLoading(false);
    }
  }, [appId, fetchJson]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, loading, error, refresh, setSnapshot };
}
