"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  DatabaseZap,
  FlaskConical,
  KeyRound,
  Link2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import type {
  DashboardSnapshot,
  Experiment,
  Insight,
  SourceConnection,
} from "@/lib/contracts";

function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <p>{description}</p>
    </div>
  );
}

export function DiagnoseView({
  snapshot,
  selectedInsight,
  onSelectInsight,
  onCreateExperiment,
}: {
  snapshot: DashboardSnapshot;
  selectedInsight?: Insight;
  onSelectInsight: (id: string) => void;
  onCreateExperiment: () => void;
}) {
  const insight = selectedInsight ?? snapshot.insights[0];
  const evidence = snapshot.evidence.find((item) =>
    insight?.evidenceIds.includes(item.id),
  );
  const proposal = snapshot.actionProposals.find(
    (item) => item.insightId === insight?.id,
  );

  return (
    <section className="workspace-page">
      <PageIntro
        eyebrow="Diagnose"
        title="Follow the evidence, not the loudest metric."
        description="AppClimb selects the earliest broken stage, then shows exactly which sources and time windows support it."
      />

      <div className="diagnose-layout">
        <aside className="diagnose-list">
          <span className="mini-heading">Ranked opportunities</span>
          {snapshot.insights.map((item) => (
            <button
              className={
                item.id === insight?.id
                  ? "diagnose-list-item selected"
                  : "diagnose-list-item"
              }
              type="button"
              key={item.id}
              onClick={() => onSelectInsight(item.id)}
            >
              <span>{item.rank}</span>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {item.kind} · {item.confidence} confidence
                </small>
              </div>
              <ChevronRight size={17} />
            </button>
          ))}
          <div className="join-policy-card">
            <Link2 size={18} />
            <div>
              <strong>Aggregate comparison</strong>
              <p>
                No shared App User ID is configured. Sources are aligned by UTC
                day and cohort, never by guessed identity.
              </p>
            </div>
          </div>
        </aside>

        {insight && evidence && proposal && (
          <article className="evidence-workbench">
            <div className="evidence-hero">
              <div>
                <span className={`kind-pill kind-${insight.kind.toLowerCase()}`}>
                  {insight.kind}
                </span>
                <span className="confidence-inline">
                  <BadgeCheck size={15} /> {insight.confidence} confidence
                </span>
              </div>
              <h3>{insight.title}</h3>
              <p>{evidence.finding}</p>
            </div>

            <div className="evidence-comparison">
              <div>
                <span>{evidence.before.label}</span>
                <strong>{evidence.before.value}</strong>
              </div>
              <div className="comparison-arrow">
                <ArrowRight size={19} />
                <span>
                  {insight.stageId === "activate" ? "−16.2 pts" : "observed"}
                </span>
              </div>
              <div className="comparison-after">
                <span>{evidence.after.label}</span>
                <strong>{evidence.after.value}</strong>
              </div>
            </div>

            <div className="evidence-lineage">
              <div className="lineage-step complete">
                <span>
                  <DatabaseZap size={17} />
                </span>
                <div>
                  <small>Source of truth</small>
                  <strong>{sourceLabel(evidence.source)}</strong>
                  <p>{evidence.metricKeys.join(" + ")}</p>
                </div>
              </div>
              <div className="lineage-connector" />
              <div className="lineage-step complete">
                <span>
                  <CalendarClock size={17} />
                </span>
                <div>
                  <small>Aligned window</small>
                  <strong>UTC daily cohorts</strong>
                  <p>Before and after version 2.4</p>
                </div>
              </div>
              <div className="lineage-connector" />
              <div className="lineage-step active">
                <span>
                  <CircleDot size={17} />
                </span>
                <div>
                  <small>Diagnosis</small>
                  <strong>Earliest broken stage</strong>
                  <p>Downstream stages are not blamed first</p>
                </div>
              </div>
            </div>

            <div className="proposal-box">
              <span className="proposal-large-icon">
                <FlaskConical size={21} />
              </span>
              <div>
                <span className="eyebrow">Action proposal</span>
                <h4>{proposal.title}</h4>
                <p>{proposal.rationale}</p>
              </div>
              <button
                className="primary-action"
                type="button"
                onClick={onCreateExperiment}
              >
                Create draft <ArrowRight size={17} />
              </button>
            </div>

            <div className="proof-strip">
              <ShieldCheck size={17} />
              <span>
                AI explanation received aggregate values and evidence IDs only.
              </span>
              <strong>No secrets · no raw user rows</strong>
            </div>
          </article>
        )}
      </div>
    </section>
  );
}

export function LabView({
  snapshot,
  selectedInsight,
}: {
  snapshot: DashboardSnapshot;
  selectedInsight?: Insight;
}) {
  const suggested = snapshot.actionProposals.find(
    (proposal) => proposal.insightId === selectedInsight?.id,
  );
  const [experiments, setExperiments] = useState<Experiment[]>(
    snapshot.experiments,
  );
  const [created, setCreated] = useState(false);
  const [openedExperiment, setOpenedExperiment] =
    useState<Experiment | null>(null);

  const createDraft = () => {
    if (created) return;
    setExperiments((current) => [
      {
        id: "experiment-new-draft",
        title: suggested?.title ?? "Activation experiment",
        stageId: selectedInsight?.stageId ?? "activate",
        hypothesis:
          suggested?.rationale ??
          "A focused change at the earliest bottleneck will improve growth.",
        primaryMetric: "Activation within 24h",
        guardrailMetric: "D7 retention",
        status: "draft",
        source: "posthog",
      },
      ...current,
    ]);
    setCreated(true);
  };

  return (
    <section className="workspace-page">
      <PageIntro
        eyebrow="Experiment"
        title="Turn a diagnosis into one clean learning loop."
        description="Lab keeps hypotheses, primary metrics, guardrails and outcomes together. Execution remains in your existing tools."
      />

      <div className="lab-toolbar">
        <div className="cycle-strip">
          {["Observe", "Diagnose", "Experiment", "Learn"].map((item, index) => (
            <span className={index === 2 ? "active" : ""} key={item}>
              <i>{index + 1}</i>
              {item}
              {index < 3 && <ArrowRight size={15} />}
            </span>
          ))}
        </div>
        <button className="primary-action" type="button" onClick={createDraft}>
          <Plus size={17} /> New experiment
        </button>
      </div>

      {created && (
        <div className="success-banner">
          <CheckCircle2 size={18} />
          Draft created. AppClimb will not launch it in PostHog or Superwall.
        </div>
      )}

      <div className="experiment-grid">
        {experiments.map((experiment) => (
          <article className="experiment-card" key={experiment.id}>
            <div className="experiment-topline">
              <span className={`experiment-status status-${experiment.status}`}>
                {experiment.status === "running" && <span />}
                {experiment.status}
              </span>
              <span className="experiment-stage">{experiment.stageId}</span>
            </div>
            <h3>{experiment.title}</h3>
            <p>{experiment.hypothesis}</p>
            <div className="experiment-metrics">
              <div>
                <small>Primary metric</small>
                <strong>{experiment.primaryMetric}</strong>
              </div>
              <div>
                <small>Guardrail</small>
                <strong>{experiment.guardrailMetric}</strong>
              </div>
            </div>
            <div className="experiment-footer">
              <span>
                <DatabaseZap size={15} /> {sourceLabel(experiment.source)}
              </span>
              <button
                type="button"
                onClick={() => setOpenedExperiment(experiment)}
              >
                Open <ChevronRight size={16} />
              </button>
            </div>
          </article>
        ))}
        <article className="experiment-card template-card">
          <span className="template-icon">
            <Sparkles size={22} />
          </span>
          <h3>Start from evidence</h3>
          <p>
            Choose a confirmed bottleneck and AppClimb will prefill the
            hypothesis, metric and guardrail.
          </p>
          <button type="button" onClick={createDraft}>
            Use recommendation <ArrowRight size={16} />
          </button>
        </article>
      </div>

      {openedExperiment && (
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setOpenedExperiment(null);
            }
          }}
        >
          <section
            className="settings-dialog experiment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="experiment-detail-title"
          >
            <button
              className="settings-close"
              type="button"
              aria-label="Close experiment"
              onClick={() => setOpenedExperiment(null)}
            >
              <X size={18} />
            </button>
            <span className="eyebrow">Experiment · {openedExperiment.status}</span>
            <h2 id="experiment-detail-title">{openedExperiment.title}</h2>
            <p className="experiment-detail-hypothesis">
              {openedExperiment.hypothesis}
            </p>
            <div className="experiment-detail-grid">
              <div>
                <small>Stage</small>
                <strong>{openedExperiment.stageId}</strong>
              </div>
              <div>
                <small>Evidence source</small>
                <strong>{sourceLabel(openedExperiment.source)}</strong>
              </div>
              <div>
                <small>Primary metric</small>
                <strong>{openedExperiment.primaryMetric}</strong>
              </div>
              <div>
                <small>Guardrail</small>
                <strong>{openedExperiment.guardrailMetric}</strong>
              </div>
            </div>
            <div className="settings-security-note">
              <p>
                This is a read-only experiment record. Launch and execution
                remain in your product or paywall tool.
              </p>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export function SourcesView({
  snapshot,
  authenticated,
}: {
  snapshot: DashboardSnapshot;
  authenticated: boolean;
}) {
  const [sources, setSources] = useState(snapshot.sources);
  const [selectedProvider, setSelectedProvider] = useState(
    snapshot.sources[0]?.provider,
  );
  const [syncing, setSyncing] = useState(false);
  const [syncComplete, setSyncComplete] = useState(false);
  const [managing, setManaging] = useState(false);
  const [connectionState, setConnectionState] = useState<
    "idle" | "saving" | "error"
  >("idle");
  const [connectionMessage, setConnectionMessage] = useState("");

  const selected = useMemo(
    () =>
      sources.find(
        (source) => source.provider === selectedProvider,
      ),
    [selectedProvider, sources],
  );
  const connectedCount = sources.filter(
    (source) => source.status === "connected",
  ).length;

  const requireAccount = () => {
    if (authenticated) return true;
    window.location.assign("/login");
    return false;
  };

  const triggerSync = async () => {
    if (!selected || selected.provider === "appclimb-rank") {
      setSyncComplete(true);
      return;
    }
    if (!requireAccount()) return;
    setSyncing(true);
    setSyncComplete(false);
    try {
      const response = await fetch(
        `/api/connections/${selected.provider}/sync`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error("sync_failed");
      }
      setSyncComplete(true);
    } catch {
      setConnectionMessage("Sync could not be queued. Check the connection.");
      setConnectionState("error");
    } finally {
      setSyncing(false);
    }
  };

  const connectSource = async (formData: FormData) => {
    if (!selected || selected.provider === "appclimb-rank") return;
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
      const response = await fetch(
        `/api/connections/${selected.provider}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: selected.provider,
            credentials,
          }),
        },
      );
      if (!response.ok) {
        throw new Error("connection_failed");
      }
      setSources((current) =>
        current.map((source) =>
          source.provider === selected.provider
            ? {
                ...source,
                status: "connected",
                freshnessHours: 0,
                lastSyncAt: new Date().toISOString(),
              }
            : source,
        ),
      );
      setManaging(false);
      setConnectionState("idle");
      setConnectionMessage("Connection verified and encrypted.");
    } catch {
      setConnectionState("error");
      setConnectionMessage(
        "Credentials could not be verified. Check scopes and try again.",
      );
    }
  };

  const revokeSource = async () => {
    if (
      !selected ||
      selected.provider === "appclimb-rank" ||
      !requireAccount() ||
      !window.confirm(`Revoke ${selected.label} and delete its credentials?`)
    ) {
      return;
    }

    const response = await fetch(
      `/api/connections/${selected.provider}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setConnectionState("error");
      setConnectionMessage("Connection could not be revoked.");
      return;
    }
    setSources((current) =>
      current.map((source) =>
        source.provider === selected.provider
          ? {
              ...source,
              status: "not-connected",
              freshnessHours: undefined,
              lastSyncAt: undefined,
            }
          : source,
      ),
    );
    setManaging(false);
    setConnectionMessage("Credentials deleted.");
  };

  return (
    <section className="workspace-page">
      <PageIntro
        eyebrow="Sources"
        title="Every metric has a named source of truth."
        description="Credentials stay encrypted server-side. Available connectors are read-only, normalized to UTC and reconciled every six hours."
      />

      <div className="source-summary-strip">
        <span>
          <CheckCircle2 size={17} /> {connectedCount} of 5 sources connected
        </span>
        <span>
          <Clock3 size={17} /> UTC-aligned imports
        </span>
        <span>
          <ShieldCheck size={17} /> 90-day metric history
        </span>
        <span>
          <RefreshCw size={17} /> 6-hour schedule
        </span>
      </div>

      <div className="sources-layout">
        <div className="source-grid">
          {sources.map((source) => (
            <SourceCard
              key={source.provider}
              source={source}
              selected={source.provider === selectedProvider}
              onSelect={() => {
                setSelectedProvider(source.provider);
                setManaging(false);
                setConnectionMessage("");
              }}
            />
          ))}
        </div>

        {selected && (
          <aside className="source-detail">
            <div className={`provider-logo provider-${selected.provider}`}>
              {sourceInitials(selected)}
            </div>
            <span className={`status-pill status-${selected.status}`}>
              {selected.status === "connected" && <Check size={14} />}
              {sourceStatusLabel(selected.status)}
            </span>
            <h3>{selected.label}</h3>
            <p>
              {selected.capabilities.join(", ")}. Imported as aggregate UTC
              metric points and retained for 90 days.
            </p>

            <div className="source-security">
              <div>
                <KeyRound size={17} />
                <span>
                  <small>Credentials</small>
                  <strong>Envelope encrypted</strong>
                </span>
              </div>
              <div>
                <LockKeyhole size={17} />
                <span>
                  <small>Permissions</small>
                  <strong>Read-only</strong>
                </span>
              </div>
            </div>

            {selected.provider === "appclimb-rank" && (
              <div className="rank-allowance">
                <div>
                  <strong>Private beta</strong>
                  <span>daily ranking collection</span>
                </div>
                <div>
                  <strong>100 · 3</strong>
                  <span>planned keywords · storefronts</span>
                </div>
              </div>
            )}

            {managing &&
            selected.provider !== "appclimb-rank" ? (
              <form
                className="connection-form"
                action={connectSource}
              >
                {connectionFields(selected.provider).map((field) => (
                  <label key={field.name}>
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
                  </label>
                ))}
                <button
                  className="primary-action"
                  type="submit"
                  disabled={connectionState === "saving"}
                >
                  <ShieldCheck size={17} />
                  {connectionState === "saving"
                    ? "Verifying…"
                    : "Verify & connect"}
                </button>
                {selected.status === "connected" && (
                  <button
                    className="danger-action"
                    type="button"
                    onClick={revokeSource}
                  >
                    Revoke connection
                  </button>
                )}
              </form>
            ) : (
              <>
                {selected.provider === "appclimb-rank" ? (
                  <div className="source-beta-note">
                    Keyword monitoring is visible in the product model but is
                    not enabled for workspaces yet.
                  </div>
                ) : selected.status === "connected" ? (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={triggerSync}
                    disabled={syncing}
                  >
                    <RefreshCw
                      size={17}
                      className={syncing ? "spin" : undefined}
                    />
                    {syncing
                      ? "Queueing…"
                      : syncComplete
                        ? "Sync queued"
                        : "Sync now"}
                  </button>
                ) : (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => {
                      if (requireAccount()) setManaging(true);
                    }}
                  >
                    <KeyRound size={17} /> Connect source
                  </button>
                )}
                {selected.provider !== "appclimb-rank" &&
                  selected.status === "connected" && (
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => {
                        if (requireAccount()) setManaging(true);
                      }}
                    >
                      Manage connection
                    </button>
                  )}
              </>
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
            <p className="source-footnote">
              {selected.provider === "appclimb-rank"
                ? "No keyword data is collected until the private beta is enabled."
                : "Revoking the source deletes its stored credentials immediately."}
            </p>
          </aside>
        )}
      </div>
    </section>
  );
}

function SourceCard({
  source,
  selected,
  onSelect,
}: {
  source: SourceConnection;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={selected ? "source-card selected" : "source-card"}
      type="button"
      onClick={onSelect}
    >
      <div className={`provider-logo provider-${source.provider}`}>
        {sourceInitials(source)}
      </div>
      <div className="source-card-copy">
        <div>
          <strong>{source.label}</strong>
          <span className={`status-pill status-${source.status}`}>
            {source.status === "connected" && <Check size={13} />}
            {sourceStatusLabel(source.status)}
          </span>
        </div>
        <p>{source.capabilities.slice(0, 3).join(" · ")}</p>
        <span>
          <Clock3 size={14} />
          {source.status === "connected"
            ? source.freshnessHours !== undefined
              ? `Synced ${
                  source.freshnessHours < 1
                    ? `${Math.round(source.freshnessHours * 60)}m ago`
                    : `${source.freshnessHours}h ago`
                }`
              : "Awaiting first sync"
            : "Ready to connect"}
        </span>
      </div>
      <ChevronRight size={18} />
    </button>
  );
}

function sourceLabel(provider: SourceConnection["provider"]): string {
  return (
    {
      "app-store-connect": "App Store Connect",
      revenuecat: "RevenueCat",
      posthog: "PostHog",
      superwall: "Superwall",
      "appclimb-rank": "AppClimb Rank",
    }[provider] ?? provider
  );
}

function sourceInitials(source: SourceConnection): string {
  return (
    {
      "app-store-connect": "A",
      revenuecat: "RC",
      posthog: "PH",
      superwall: "S",
      "appclimb-rank": "AC",
    }[source.provider] ?? source.label.slice(0, 2)
  );
}

function sourceStatusLabel(status: SourceConnection["status"]) {
  return (
    {
      connected: "Connected",
      "needs-attention": "Needs attention",
      "not-connected": "Not connected",
    }[status] ?? status
  );
}

interface ConnectionField {
  name: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  multiline?: boolean;
  defaultValue?: string;
}

function connectionFields(
  provider: Exclude<SourceConnection["provider"], "appclimb-rank">,
): ConnectionField[] {
  return {
    "app-store-connect": [
      {
        name: "appId",
        label: "Apple app ID",
        placeholder: "1234567890",
      },
      {
        name: "issuerId",
        label: "Issuer ID",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      },
      {
        name: "keyId",
        label: "Key ID",
        placeholder: "ABC123DEFG",
      },
      {
        name: "privateKey",
        label: "Private key (.p8)",
        placeholder: "-----BEGIN PRIVATE KEY-----",
        secret: true,
        multiline: true,
      },
    ],
    revenuecat: [
      {
        name: "apiKey",
        label: "Secret API key",
        placeholder: "sk_…",
        secret: true,
      },
      {
        name: "projectId",
        label: "Project ID",
        placeholder: "proj…",
      },
    ],
    posthog: [
      {
        name: "personalApiKey",
        label: "Personal API key",
        placeholder: "phx_…",
        secret: true,
      },
      {
        name: "projectId",
        label: "Project ID",
        placeholder: "12345",
      },
      {
        name: "host",
        label: "PostHog host",
        placeholder: "https://us.posthog.com",
        defaultValue: "https://us.posthog.com",
      },
    ],
    superwall: [
      {
        name: "apiKey",
        label: "API key",
        placeholder: "sw_…",
        secret: true,
      },
      {
        name: "projectId",
        label: "Project ID",
        placeholder: "project ID",
      },
      {
        name: "applicationId",
        label: "Application ID",
        placeholder: "application ID",
      },
    ],
  }[provider];
}
