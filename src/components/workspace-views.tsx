"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleCheckBig,
  CircleDot,
  Clock3,
  DatabaseZap,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { ActionPlanDetail } from "@/components/action-plan-detail";
import { ModalDialog } from "@/components/modal-dialog";
import { ProviderMark } from "@/components/provider-mark";
import type {
  DashboardSnapshot,
  Insight,
  SourceConnection,
} from "@/lib/contracts";
import {
  actionPlanFor,
  type InsightFeedbackAction,
  type PersistedExperiment,
} from "@/lib/experiments";
import {
  connectionFields,
  type ConnectableProvider,
  SOURCE_SETUP,
} from "@/lib/source-setup";

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

function percentPointChange(before: string, after: string) {
  const beforeValue = Number.parseFloat(before.replace("%", ""));
  const afterValue = Number.parseFloat(after.replace("%", ""));
  if (
    !before.includes("%") ||
    !after.includes("%") ||
    !Number.isFinite(beforeValue) ||
    !Number.isFinite(afterValue)
  ) {
    return "Observed change";
  }

  const delta = afterValue - beforeValue;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${Math.abs(delta).toFixed(1)} pts`;
}

function formatUtcDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function DiagnoseView({
  snapshot,
  selectedInsight,
  onSelectInsight,
  onCreateExperiment,
  experiments = [],
  savingExperiment = false,
  onSendFeedback,
  onActionPlanOpened,
  feedbackState = "",
  feedbackError = "",
}: {
  snapshot: DashboardSnapshot;
  selectedInsight?: Insight;
  onSelectInsight: (id: string) => void;
  onCreateExperiment: () => void;
  experiments?: PersistedExperiment[];
  savingExperiment?: boolean;
  onSendFeedback?: (action: InsightFeedbackAction, reason: string) => void;
  onActionPlanOpened?: (insightId: string) => void;
  feedbackState?: string;
  feedbackError?: string;
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const insight = selectedInsight ?? snapshot.insights[0];
  const evidenceItems = snapshot.evidence.filter((item) =>
    insight?.evidenceIds.includes(item.id),
  );
  const evidence = evidenceItems[0];
  const proposal = snapshot.actionProposals.find(
    (item) => item.insightId === insight?.id,
  );
  const sourceNames = Array.from(
    new Set(evidenceItems.map((item) => sourceLabel(item.source))),
  );
  const metricKeys = Array.from(
    new Set(evidenceItems.flatMap((item) => item.metricKeys)),
  );
  const windowStart = evidenceItems
    .map((item) => item.window.from)
    .sort()[0];
  const windowEnd = evidenceItems
    .map((item) => item.window.to)
    .sort()
    .at(-1);

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

        {insight && evidence ? (
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
                  {percentPointChange(
                    evidence.before.value,
                    evidence.after.value,
                  )}
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
                  <strong>{sourceNames.join(" + ")}</strong>
                  <p>{metricKeys.join(" + ")}</p>
                </div>
              </div>
              <div className="lineage-connector" />
              <div className="lineage-step complete">
                <span>
                  <CalendarClock size={17} />
                </span>
                <div>
                  <small>Aligned window</small>
                  <strong>UTC aggregate comparison</strong>
                  <p>
                    {windowStart && windowEnd
                      ? `${formatUtcDate(windowStart)} – ${formatUtcDate(windowEnd)}`
                      : "Window unavailable"}
                  </p>
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

            <div className="evidence-identifiers">
              <span>Evidence IDs</span>
              <code>{evidenceItems.map((item) => item.id).join(" · ")}</code>
            </div>

            {proposal && (
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
                  aria-expanded={planOpen}
                  onClick={() => {
                    const next = !planOpen;
                    setPlanOpen(next);
                    if (next) onActionPlanOpened?.(insight.id);
                  }}
                >
                  {planOpen ? "Hide action plan" : "Open action plan"}
                  <ArrowRight size={17} />
                </button>
              </div>
            )}

            {planOpen && (
              <ActionPlanDetail
                plan={actionPlanFor(snapshot, insight)}
                insight={insight}
                proposal={proposal}
                evidence={snapshot.evidence}
                experimentExists={experiments.some(
                  (experiment) => experiment.insightId === insight.id,
                )}
                busy={savingExperiment}
                onCreateExperiment={onCreateExperiment}
                onFeedback={onSendFeedback}
                feedbackState={feedbackState}
                feedbackError={feedbackError}
              />
            )}

            <div className="proof-strip">
              <ShieldCheck size={17} />
              <span>
                Deterministic diagnosis from aggregate metrics and evidence IDs.
              </span>
              <strong>No AI claim · no secrets · no raw user rows</strong>
            </div>
          </article>
        ) : (
          <article className="evidence-workbench evidence-empty">
            <DatabaseZap size={24} />
            <h3>No supported diagnosis yet</h3>
            <p>
              AppClimb will not create a recommendation until a source,
              evidence window and owned metric are available together.
            </p>
          </article>
        )}
      </div>
    </section>
  );
}

const EXPERIMENT_STATUS_ORDER = [
  "draft",
  "ready",
  "running",
  "completed",
] as const;

export function LabView({
  selectedInsight,
  experiments,
  latestCreatedExperimentId,
  onCreateDraft,
  persistence = "session",
  busy = false,
  errorMessage = "",
  onUpdateExperiment,
  onDeleteExperiment,
}: {
  selectedInsight?: Insight;
  experiments: PersistedExperiment[];
  latestCreatedExperimentId: string;
  onCreateDraft: () => void;
  /**
   * `saved` means every card in this view round-trips through D1. `session`
   * is only reachable in the public demo and in a signed-out workspace, and
   * the UI says so instead of implying a draft was stored.
   */
  persistence?: "saved" | "session";
  busy?: boolean;
  errorMessage?: string;
  onUpdateExperiment?: (
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<void> | void;
  onDeleteExperiment?: (id: string) => Promise<void> | void;
}) {
  const [openedExperimentId, setOpenedExperimentId] = useState("");
  const openedExperiment =
    experiments.find((experiment) => experiment.id === openedExperimentId) ??
    null;
  const latestCreated = experiments.find(
    (experiment) => experiment.id === latestCreatedExperimentId,
  );

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
        <button
          className="primary-action"
          type="button"
          onClick={onCreateDraft}
          disabled={!selectedInsight}
        >
          <Plus size={17} /> New experiment
        </button>
      </div>

      {latestCreated && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={18} />
          {persistence === "saved" ? (
            <>
              Experiment saved from {latestCreated.stageId} evidence. It stays
              in this workspace after a reload, and nothing was launched in{" "}
              {sourceLabel(latestCreated.source)} or another tool.
            </>
          ) : (
            <>
              Draft created from {latestCreated.stageId} evidence. Sign in to a
              private workspace to keep it after a reload — this demo does not
              store experiments.
            </>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="lab-error-banner" role="alert">
          <X size={16} aria-hidden="true" />
          {errorMessage}
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
            {persistence === "saved" && onUpdateExperiment && (
              <div className="lab-experiment-controls">
                <label htmlFor={`experiment-status-${experiment.id}`}>
                  Status
                </label>
                <select
                  id={`experiment-status-${experiment.id}`}
                  value={experiment.status}
                  disabled={busy}
                  onChange={(event) =>
                    void onUpdateExperiment(experiment.id, {
                      status: event.target.value,
                    })
                  }
                >
                  {EXPERIMENT_STATUS_ORDER.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                {onDeleteExperiment && (
                  <button
                    type="button"
                    className="lab-delete-experiment"
                    disabled={busy}
                    aria-label={`Delete ${experiment.title}`}
                    onClick={() => void onDeleteExperiment(experiment.id)}
                  >
                    <X size={14} aria-hidden="true" /> Delete
                  </button>
                )}
              </div>
            )}
            <div className="experiment-footer">
              <span>
                <DatabaseZap size={15} /> {sourceLabel(experiment.source)}
              </span>
              <button
                type="button"
                onClick={() => setOpenedExperimentId(experiment.id)}
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
          <button
            type="button"
            onClick={onCreateDraft}
            disabled={!selectedInsight}
          >
            Use recommendation <ArrowRight size={16} />
          </button>
        </article>
      </div>

      {openedExperiment && (
        <ExperimentDetailDialog
          experiment={openedExperiment}
          persistence={persistence}
          busy={busy}
          onClose={() => setOpenedExperimentId("")}
          onUpdateExperiment={onUpdateExperiment}
        />
      )}
    </section>
  );
}

function ExperimentDetailDialog({
  experiment,
  persistence,
  busy,
  onClose,
  onUpdateExperiment,
}: {
  experiment: PersistedExperiment;
  persistence: "saved" | "session";
  busy: boolean;
  onClose: () => void;
  onUpdateExperiment?: (
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<void> | void;
}) {
  const [result, setResult] = useState(experiment.result ?? "");
  const [learnings, setLearnings] = useState(experiment.learnings ?? "");
  const [saved, setSaved] = useState(false);
  const editable = persistence === "saved" && Boolean(onUpdateExperiment);

  return (
    <ModalDialog
      labelledBy="experiment-detail-title"
      onClose={onClose}
      dialogClassName="settings-dialog experiment-dialog"
      closeLabel="Close experiment"
    >
      <span className="eyebrow">Experiment · {experiment.status}</span>
      <h2 id="experiment-detail-title">{experiment.title}</h2>
      <p className="experiment-detail-hypothesis">{experiment.hypothesis}</p>
      <div className="experiment-detail-grid">
        <div>
          <small>Stage</small>
          <strong>{experiment.stageId}</strong>
        </div>
        <div>
          <small>Evidence source</small>
          <strong>{sourceLabel(experiment.source)}</strong>
        </div>
        <div>
          <small>Primary metric</small>
          <strong>{experiment.primaryMetric}</strong>
        </div>
        <div>
          <small>Guardrail</small>
          <strong>{experiment.guardrailMetric}</strong>
        </div>
        <div>
          <small>Segment</small>
          <strong>{experiment.segment || "All users in the window"}</strong>
        </div>
        <div>
          <small>Started / ended</small>
          <strong>
            {experiment.startedAt
              ? formatUtcDate(experiment.startedAt)
              : "Not started"}
            {experiment.endedAt ? ` → ${formatUtcDate(experiment.endedAt)}` : ""}
          </strong>
        </div>
      </div>

      {experiment.steps && experiment.steps.length > 0 && (
        <div className="experiment-detail-section">
          <strong>Exact steps</strong>
          <ol>
            {experiment.steps.map((step) => (
              <li key={`${step.order}-${step.title}`}>
                <strong>{step.title}</strong>
                <span>{step.instruction}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {experiment.guardrails && experiment.guardrails.length > 0 && (
        <div className="experiment-detail-section">
          <strong>Guardrails</strong>
          <ul>
            {experiment.guardrails.map((guardrail) => (
              <li key={guardrail.key}>{guardrail.label}</li>
            ))}
          </ul>
        </div>
      )}

      {experiment.evidenceIds && experiment.evidenceIds.length > 0 && (
        <div className="experiment-detail-section">
          <strong>Evidence</strong>
          <code>{experiment.evidenceIds.join(" · ")}</code>
        </div>
      )}

      {editable ? (
        <form
          className="experiment-notes-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaved(false);
            await onUpdateExperiment?.(experiment.id, {
              result: result.trim(),
              learnings: learnings.trim(),
            });
            setSaved(true);
          }}
        >
          <label htmlFor="experiment-result">Result</label>
          <textarea
            id="experiment-result"
            rows={3}
            value={result}
            onChange={(event) => setResult(event.target.value)}
            placeholder="What the primary metric did, measured in your own tool."
          />
          <label htmlFor="experiment-learnings">Learnings</label>
          <textarea
            id="experiment-learnings"
            rows={3}
            value={learnings}
            onChange={(event) => setLearnings(event.target.value)}
            placeholder="What you would keep, change or stop next cycle."
          />
          <div>
            <button type="submit" className="primary-action" disabled={busy}>
              {busy ? "Saving…" : "Save result and learnings"}
            </button>
            {saved && (
              <span role="status" className="experiment-notes-saved">
                Saved
              </span>
            )}
          </div>
        </form>
      ) : (
        (experiment.result || experiment.learnings) && (
          <div className="experiment-detail-section">
            {experiment.result && (
              <>
                <strong>Result</strong>
                <p>{experiment.result}</p>
              </>
            )}
            {experiment.learnings && (
              <>
                <strong>Learnings</strong>
                <p>{experiment.learnings}</p>
              </>
            )}
          </div>
        )
      )}

      <div className="settings-security-note">
        <p>
          AppClimb records the experiment. Launch and execution remain in your
          product, paywall or App Store tooling — nothing here changes a
          connected system.
        </p>
      </div>
    </ModalDialog>
  );
}

function postHogOAuthErrorMessage(reason: string | null) {
  switch (reason) {
    case "provider_denied":
      return "PostHog access was declined. No credentials were saved.";
    case "missing_start":
      return "PostHog returned, but the AppClimb login step expired. Start again from appclimb.app (not www or a local preview), stay signed in, and retry.";
    case "start_expired":
      return "PostHog authorization took too long and expired. Try Connect again.";
    case "state_mismatch":
      return "PostHog authorization could not be verified (state mismatch). Try again in the same browser.";
    case "token_exchange":
    case "token_incomplete":
      return "PostHog approved access, but token exchange failed. Try again in a minute.";
    case "token_storage":
      return "PostHog returned credentials that could not be stored safely in this browser. No connection was saved.";
    case "host_unresolved":
      return "PostHog authorized AppClimb, but no US/EU project host could be resolved.";
    case "missing_code":
    case "missing_state":
      return "PostHog did not return a complete authorization code. Try again.";
    default:
      return "PostHog authorization did not finish. No access was saved; try again from https://appclimb.app while signed in.";
  }
}

export function SourcesView({
  snapshot,
  authenticated,
  entitled,
  sources,
  onSourcesChange,
}: {
  snapshot: DashboardSnapshot;
  authenticated: boolean;
  entitled: boolean;
  sources: SourceConnection[];
  onSourcesChange: (
    update:
      | SourceConnection[]
      | ((current: SourceConnection[]) => SourceConnection[]),
  ) => void;
}) {
  const isDemo = snapshot.mode === "demo";
  const accessRestricted = !isDemo && !entitled;
  const [selectedProvider, setSelectedProvider] = useState<
    SourceConnection["provider"] | null
  >(null);
  const [syncing, setSyncing] = useState(false);
  const [syncComplete, setSyncComplete] = useState(false);
  const [managing, setManaging] = useState(false);
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
    () =>
      sources.find(
        (source) => source.provider === selectedProvider,
      ),
    [selectedProvider, sources],
  );
  const selectedHasCredentials =
    selected != null &&
    selected.provider !== "appclimb-rank" &&
    selected.status !== "not-connected";
  const connectedCount = sources.filter(
    (source) => source.status === "connected",
  ).length;
  const attentionCount = sources.filter(
    (source) => source.status === "needs-attention",
  ).length;
  const availableConnectorCount = sources.filter(
    (source) => source.provider !== "appclimb-rank",
  ).length;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedProvider = params.get("source");
    const oauthResult = params.get("oauth");
    const oauthReason = params.get("oauth_reason");
    const sourceExists =
      requestedProvider &&
      sources.some((source) => source.provider === requestedProvider);
    if (!sourceExists && !oauthResult) return;

    if (sourceExists) params.delete("source");
    if (oauthResult) params.delete("oauth");
    if (oauthReason) params.delete("oauth_reason");
    if (requestedProvider || oauthResult) {
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    }

    const controller = new AbortController();
    const applyReturn = window.setTimeout(() => {
      if (sourceExists) {
        setSelectedProvider(
          requestedProvider as SourceConnection["provider"],
        );
        if (requestedProvider !== "appclimb-rank" && !isDemo) {
          setManaging(true);
        }
      }
      if (oauthResult === "error") {
        setConnectionState("error");
        setConnectionMessage(postHogOAuthErrorMessage(oauthReason));
        setOauthState("error");
        return;
      }
      if (oauthResult !== "ready") return;

      setSelectedProvider("posthog");
      setManaging(true);
      setOauthState("loading");
      fetch("/api/oauth/posthog/projects", { signal: controller.signal })
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
          if (projects.length === 0) {
            throw new Error("oauth_projects_empty");
          }
          setOauthProjects(projects);
          setOauthState("ready");
          setConnectionMessage("");
          setConnectionState("idle");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setOauthState("error");
          setConnectionState("error");
          setConnectionMessage(
            "PostHog authorized AppClimb, but no readable project was found.",
          );
        });
    }, 0);
    return () => {
      window.clearTimeout(applyReturn);
      controller.abort();
    };
  }, [isDemo, sources]);

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
    if (accessRestricted) {
      setConnectionMessage(
        "An active trial or plan is required before imports can resume.",
      );
      setConnectionState("error");
      return;
    }
    setSyncing(true);
    setSyncComplete(false);
    setConnectionMessage("");
    setConnectionState("idle");
    try {
      const response = await fetch(
        `/api/connections/${selected.provider}/sync`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw new Error("sync_failed");
      }
      setSyncComplete(true);
      setConnectionMessage("Sync queued.");
      setConnectionState("idle");
    } catch {
      setConnectionMessage("Sync could not be queued. Check the connection.");
      setConnectionState("error");
    } finally {
      setSyncing(false);
    }
  };

  const markConnected = (provider: SourceConnection["provider"]) => {
    onSourcesChange((current) =>
      current.map((source) =>
        source.provider === provider
          ? {
              ...source,
              status: "connected",
              freshnessHours: undefined,
              lastSyncAt: undefined,
              lastErrorCode: undefined,
            }
          : source,
      ),
    );
    setConnectionState("success");
    setConnectionMessage("");
  };

  const connectSource = async (formData: FormData) => {
    if (!selected || selected.provider === "appclimb-rank") return;
    if (!requireAccount()) return;
    if (accessRestricted) {
      setConnectionMessage(
        "An active trial or plan is required before this source can be verified.",
      );
      setConnectionState("error");
      return;
    }

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
      markConnected(selected.provider);
    } catch {
      setConnectionState("error");
      setConnectionMessage(
        "Credentials could not be verified. Check scopes and try again.",
      );
    }
  };

  const connectPostHogOAuth = async (formData: FormData) => {
    if (!requireAccount()) return;
    const projectId = String(formData.get("projectId") ?? "").trim();
    const activationEvent = String(
      formData.get("activationEvent") ?? "app_activated",
    ).trim();
    const sessionEvent = String(
      formData.get("sessionEvent") ?? "$session_start",
    ).trim();
    if (!projectId || !activationEvent || !sessionEvent) {
      setConnectionState("error");
      setConnectionMessage("Choose a project and enter both event names.");
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
      markConnected("posthog");
      setOauthState("idle");
      setOauthProjects([]);
    } catch {
      setConnectionState("error");
      setConnectionMessage(
        "PostHog access could not be verified. Reauthorize and try again.",
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

    setConnectionState("saving");
    setConnectionMessage("");
    try {
      const response = await fetch(
        `/api/connections/${selected.provider}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("revoke_failed");
      onSourcesChange((current) =>
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
      setConnectionState("idle");
      setConnectionMessage("Credentials deleted.");
    } catch {
      setConnectionState("error");
      setConnectionMessage("Connection could not be revoked.");
    }
  };

  return (
    <section className="workspace-page">
      <PageIntro
        eyebrow="Sources"
        title={
          isDemo
            ? "Explore the source model without connecting an account."
            : "Every metric has a named source of truth."
        }
        description={
          isDemo
            ? "These are synthetic source profiles for the interactive demo. No credentials exist and no sync is running."
            : accessRestricted
              ? "Existing source state remains visible and credentials can still be revoked, but verification and imports are paused until access is restored."
            : "Credentials stay encrypted server-side. Available connectors are read-only and normalized to UTC."
        }
      />

      {isDemo && (
        <div className="sample-notice" role="note">
          <Sparkles size={17} />
          <div>
            <strong>Interactive demo · synthetic source states</strong>
            <span>
              Labels, freshness and capabilities below are illustrative, not
              live connections.
            </span>
          </div>
        </div>
      )}

      {accessRestricted && (
        <div className="source-attention-note source-access-note" role="status">
          <strong>Imports paused · plan required</strong>
          <span>
            No source data is being refreshed. You can review or revoke
            existing connections without reactivating access.
          </span>
        </div>
      )}

      <div className="source-summary-strip">
        <span>
          <CheckCircle2 size={17} />{" "}
          {isDemo
            ? `${connectedCount} sample profiles`
            : `${connectedCount} connected${
                attentionCount > 0
                  ? ` · ${attentionCount} needs attention`
                  : ""
              } · ${availableConnectorCount} available`}
        </span>
        <span>
          <Clock3 size={17} /> UTC-aligned imports
        </span>
        <span>
          <ShieldCheck size={17} />{" "}
          {isDemo ? "No credentials stored" : "Encrypted credentials"}
        </span>
        <span>
          <RefreshCw size={17} />{" "}
          {isDemo
            ? "No live sync"
            : accessRestricted
              ? "Background sync paused"
              : "Background sync queue"}
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
                setManaging(
                  !isDemo &&
                    source.provider !== "appclimb-rank" &&
                    source.status !== "connected",
                );
                setSyncComplete(false);
                setConnectionMessage("");
                setConnectionState("idle");
                setOauthState("idle");
                setOauthProjects([]);
              }}
              isDemo={isDemo}
              generatedAt={snapshot.generatedAt}
            />
          ))}
        </div>
      </div>

      {selected && (
        <ModalDialog
          labelledBy="source-modal-title"
          onClose={() => {
            setSelectedProvider(null);
            setManaging(false);
            setConnectionState("idle");
            setConnectionMessage("");
            if (oauthState !== "idle") {
              void fetch("/api/oauth/posthog/connect", {
                method: "DELETE",
              });
              setOauthState("idle");
              setOauthProjects([]);
            }
          }}
          dialogClassName="settings-dialog source-modal-dialog"
          closeLabel="Close connection window"
        >
          <div className="source-detail">
            <div className="source-detail-header">
              <div className={`provider-logo provider-${selected.provider}`}>
                <ProviderMark provider={selected.provider} />
              </div>
              <span className={`status-pill status-${selected.status}`}>
                {!isDemo && selected.status === "connected" && (
                  <Check size={14} />
                )}
                {isDemo ? "Sample profile" : sourceStatusLabel(selected.status)}
              </span>
            </div>
            <h3 id="source-modal-title">{selected.label}</h3>
            <p>
              {selected.capabilities.join(", ")}.{" "}
              {isDemo
                ? "Shown only to explain source ownership in the demo."
                : selected.provider === "appclimb-rank"
                  ? "This is a roadmap surface; no keyword collector is enabled."
                  : selected.status === "not-connected"
                    ? "When connected, supported fields are imported as aggregate UTC metric points."
                    : "Supported fields are imported as aggregate UTC metric points for this workspace."}
            </p>

            <div className="source-security">
              <div>
                <KeyRound size={17} />
                <span>
                  <small>Credentials</small>
                  <strong>
                    {isDemo
                      ? "None in demo"
                      : selected.provider === "appclimb-rank"
                        ? "Not collected"
                        : selected.status === "not-connected"
                          ? "None stored"
                          : "Envelope encrypted"}
                  </strong>
                </span>
              </div>
              <div>
                <LockKeyhole size={17} />
                <span>
                  <small>Permissions</small>
                  <strong>
                    {isDemo
                      ? "Illustrative"
                      : selected.provider === "appclimb-rank"
                        ? "Not enabled"
                        : "Read-only"}
                  </strong>
                </span>
              </div>
            </div>

            {!isDemo && selected.status === "needs-attention" && (
              <div className="source-attention-note" role="status">
                <strong>Connection needs attention</strong>
                <span>
                  {selected.lastErrorCode === "no_data_in_window"
                    ? "No supported rows were returned for this window. Confirm the selected app, project, and event names, or wait for source data; the credentials may still be valid."
                    : `${
                        selected.lastErrorCode
                          ? `Last import: ${selected.lastErrorCode.replaceAll("_", " ")}.`
                          : "The last import did not complete."
                      } Verify the source credentials, scopes, and app selection.`}
                </span>
              </div>
            )}

            {selected.provider === "appclimb-rank" && (
              <div className="rank-allowance">
                <div>
                  <strong>Roadmap</strong>
                  <span>daily collection is not enabled</span>
                </div>
                <div>
                  <strong>100 · 3</strong>
                  <span>planned keywords · storefronts</span>
                </div>
              </div>
            )}

            {connectionState === "success" &&
            selected.provider !== "appclimb-rank" ? (
              <div className="connection-success" role="status">
                <div className="connection-success-mark" aria-hidden="true">
                  <span />
                  <CircleCheckBig size={30} />
                </div>
                <div>
                  <span className="eyebrow">Connection complete</span>
                  <h4>{selected.label} is connected</h4>
                  <p>
                    Access was verified and encrypted. AppClimb can now import
                    the supported read-only metrics for this workspace.
                  </p>
                </div>
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
                    ? "Starting first sync…"
                    : syncComplete
                      ? "First sync queued"
                      : "Start first sync"}
                </button>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() => {
                    setConnectionState("idle");
                    setManaging(false);
                    setSelectedProvider(null);
                  }}
                >
                  Done
                </button>
              </div>
            ) : managing && selected.provider !== "appclimb-rank" ? (
              <div className="connection-setup">
                <button
                  className="connection-close"
                  type="button"
                  aria-label="Close connection setup"
                  onClick={() => {
                    setManaging(false);
                    setConnectionState("idle");
                    setConnectionMessage("");
                    if (oauthState !== "idle") {
                      void fetch("/api/oauth/posthog/connect", {
                        method: "DELETE",
                      });
                      setOauthState("idle");
                      setOauthProjects([]);
                    }
                  }}
                >
                  <X size={15} />
                </button>
                <ConnectionGuide provider={selected.provider} />

                {selected.provider === "posthog" &&
                oauthState === "loading" ? (
                  <div className="oauth-loading" role="status">
                    <LoaderCircle className="spin" size={22} />
                    <div>
                      <strong>Loading your PostHog projects…</strong>
                      <span>
                        Authorization is complete. AppClimb is reading only the
                        project list you granted.
                      </span>
                    </div>
                  </div>
                ) : selected.provider === "posthog" &&
                  oauthState === "ready" ? (
                  <form
                    className="connection-form oauth-project-form"
                    action={connectPostHogOAuth}
                  >
                    <label>
                      PostHog project
                      <select name="projectId" required defaultValue="">
                        <option value="" disabled>
                          Choose a project
                        </option>
                        {oauthProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.organizationName} · {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Activation event · unique users
                      <input
                        name="activationEvent"
                        defaultValue="app_activated"
                        required
                        spellCheck={false}
                      />
                      <span className="field-help">
                        The event that means a user reached first value.
                        <a
                          href="https://posthog.com/docs/product-analytics/activation"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Choose an activation event <ExternalLink size={12} />
                        </a>
                      </span>
                    </label>
                    <label>
                      Session event · unique users
                      <input
                        name="sessionEvent"
                        defaultValue="$session_start"
                        required
                        spellCheck={false}
                      />
                    </label>
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
                      {connectionState === "saving"
                        ? "Verifying project…"
                        : "Connect selected project"}
                    </button>
                  </form>
                ) : (
                  <>
                    {selected.provider === "posthog" && (
                      <>
                        <a
                          className="oauth-connect-button"
                          href="/api/oauth/posthog/start"
                        >
                          <ProviderMark provider="posthog" />
                          <span>
                            <strong>Continue with PostHog</strong>
                            <small>
                              Recommended · scoped read-only OAuth
                            </small>
                          </span>
                          <ArrowRight size={16} />
                        </a>
                        <div className="connection-divider">
                          <span>or connect with an API key</span>
                        </div>
                      </>
                    )}
                    {selected.provider === "revenuecat" && (
                      <div className="oauth-coming-note">
                        <BadgeCheck size={17} />
                        <p>
                          <strong>RevenueCat OAuth is supported</strong>
                          It will appear here after RevenueCat approves AppClimb
                          as an OAuth client. API key setup remains available
                          below.
                        </p>
                      </div>
                    )}
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
                          <span className="field-help">
                            {field.help}
                            <a
                              href={field.helpUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {field.helpLabel} <ExternalLink size={12} />
                            </a>
                          </span>
                        </label>
                      ))}
                      <div className="connection-security-note">
                        <ShieldCheck size={16} />
                        <span>
                          Encrypted before storage · never exposed to the
                          browser again · read-only imports
                        </span>
                      </div>
                      <button
                        className="primary-action"
                        type="submit"
                        disabled={
                          connectionState === "saving" || accessRestricted
                        }
                      >
                        {connectionState === "saving" ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <ShieldCheck size={17} />
                        )}
                        {accessRestricted
                          ? "Plan required to verify"
                          : connectionState === "saving"
                            ? "Verifying credentials…"
                            : "Verify & connect"}
                      </button>
                      {connectionState === "saving" && (
                        <div className="connection-progress" role="status">
                          <span className="active">
                            <CheckCircle2 size={13} /> Checking access
                          </span>
                          <span>
                            <LockKeyhole size={13} /> Encrypting
                          </span>
                          <span>
                            <RefreshCw size={13} /> Preparing sync
                          </span>
                        </div>
                      )}
                      {selectedHasCredentials && (
                        <button
                          className="danger-action"
                          type="button"
                          onClick={revokeSource}
                        >
                          Revoke connection
                        </button>
                      )}
                    </form>
                  </>
                )}
              </div>
            ) : (
              <>
                {isDemo ? (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => window.location.assign("/login")}
                  >
                    <KeyRound size={17} /> Connect your own data
                  </button>
                ) : selected.provider === "appclimb-rank" ? (
                  <div className="source-beta-note">
                    Keyword monitoring is visible in the product model but is
                    not enabled for workspaces yet.
                  </div>
                ) : selected.status === "connected" ? (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={triggerSync}
                    disabled={syncing || accessRestricted}
                  >
                    <RefreshCw
                      size={17}
                      className={syncing ? "spin" : undefined}
                    />
                    {accessRestricted
                      ? "Plan required to sync"
                      : syncing
                      ? "Queueing…"
                      : syncComplete
                        ? "Sync queued"
                        : "Sync now"}
                  </button>
                ) : selected.status === "needs-attention" ? (
                  <button
                    className="primary-action"
                    type="button"
                    onClick={() => {
                      if (requireAccount()) setManaging(true);
                    }}
                  >
                    <KeyRound size={17} /> Review connection
                  </button>
                ) : (
                  <button
                    className="primary-action"
                    type="button"
                    disabled={accessRestricted}
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
              {isDemo
                ? "Illustrative source profile · no connection or sync exists."
                : selected.provider === "appclimb-rank"
                  ? "No keyword data is collected until the private beta is enabled."
                  : selectedHasCredentials
                    ? "Revoking the source deletes its stored credentials immediately."
                    : "No credentials are stored for this source."}
            </p>
          </div>
        </ModalDialog>
      )}
    </section>
  );
}

function ConnectionGuide({ provider }: { provider: ConnectableProvider }) {
  const setup = SOURCE_SETUP[provider];
  return (
    <div className="connection-guide">
      <div>
        <span className="eyebrow">Three quick steps</span>
        <strong>Connect {sourceLabel(provider)}</strong>
      </div>
      <ol>
        {setup.steps.map((step, index) => (
          <li key={step}>
            <span>{index + 1}</span>
            <p>{step}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SourceCard({
  source,
  selected,
  onSelect,
  isDemo,
  generatedAt,
}: {
  source: SourceConnection;
  selected: boolean;
  onSelect: () => void;
  isDemo: boolean;
  generatedAt: string;
}) {
  return (
    <button
      className={selected ? "source-card selected" : "source-card"}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className={`provider-logo provider-${source.provider}`}>
        <ProviderMark provider={source.provider} />
      </div>
      <div className="source-card-copy">
        <div>
          <strong>{source.label}</strong>
          <span className={`status-pill status-${source.status}`}>
            {!isDemo && source.status === "connected" && <Check size={13} />}
            {isDemo
              ? "Sample"
              : source.provider === "appclimb-rank"
                ? "Roadmap"
                : sourceStatusLabel(source.status)}
          </span>
        </div>
        <p>{source.capabilities.slice(0, 3).join(" · ")}</p>
        <span>
          <Clock3 size={14} />
          {isDemo
            ? "Illustrative sync state"
            : source.provider === "appclimb-rank"
              ? "Not enabled yet"
              : source.status === "connected"
                ? sourceFreshnessLabel(source, generatedAt)
                : source.status === "needs-attention"
                  ? "Review connection"
                  : "Ready to connect"}
        </span>
      </div>
      <ChevronRight size={18} />
    </button>
  );
}

function sourceFreshnessLabel(
  source: SourceConnection,
  generatedAt: string,
): string {
  if (!source.lastSyncAt) return "Awaiting first sync";
  const referenceTime = new Date(generatedAt).getTime();
  const syncTime = new Date(source.lastSyncAt).getTime();
  if (!Number.isFinite(referenceTime) || !Number.isFinite(syncTime)) {
    return "Sync time unavailable";
  }

  const hours = Math.max(0, (referenceTime - syncTime) / (60 * 60 * 1000));
  if (hours < 1) return `Synced ${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 48) return `Synced ${Math.round(hours)}h ago`;
  return `Synced ${Math.round(hours / 24)}d ago`;
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

function sourceStatusLabel(status: SourceConnection["status"]) {
  return (
    {
      connected: "Connected",
      "needs-attention": "Needs attention",
      "not-connected": "Not connected",
    }[status] ?? status
  );
}
