"use client";

/**
 * The canonical website install wizard (Tasks P0.23, P0.25, P0.27).
 *
 * This is the only implementation of the add-domain → install → deploy →
 * verify → goal → baseline sequence. The active step is server-derived, so
 * leaving and returning lands on the exact incomplete step.
 */

import {
  ArrowLeft,
  Check,
  CircleAlert,
  Clipboard,
  ExternalLink,
  LoaderCircle,
  Radio,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ConversionGoalSetup } from "./conversion-goal-setup";
import {
  BaselineProgress,
  TrackingStatusPill,
  TrackingStatusSummary,
} from "./tracking-status";
import {
  buildCrawlerAgentPrompt,
  buildTrackingAgentPrompt,
} from "./tracking-agent-prompt";
import {
  buildFrameworkInstallTabs,
  buildTrackingSnippet,
  type TrackingInstallTab,
  type TrackingInstallTabId,
} from "./tracking-snippet";
import {
  useWebInstallState,
  type WebInstallProperty,
} from "./use-web-install-state";
import {
  canonicalHostname,
  WEB_INSTALL_STEPS,
  WEB_INSTALL_STEP_TITLES,
  type WebInstallStep,
} from "./web-install-state";

export function TrackingInstallWizard({
  appId = "",
  collectorOrigin,
  onPropertyCreated,
  onFinish,
  finishLabel = "Open Acquisition Atlas",
}: {
  appId?: string;
  collectorOrigin?: string;
  onPropertyCreated?: (property: WebInstallProperty) => void;
  onFinish?: () => void;
  finishLabel?: string;
}) {
  const install = useWebInstallState({ appId });
  const {
    snapshot,
    state,
    loading,
    loaded,
    error,
    refresh,
    listening,
    listenAttempts,
    listenTimedOut,
    startListening,
    saveStep,
    saveGoal,
  } = install;

  const [override, setOverride] = useState<{
    step: WebInstallStep;
    anchor: WebInstallStep;
  } | null>(null);
  const activeStep =
    override && override.anchor === state.step ? override.step : state.step;

  const origin =
    collectorOrigin ??
    snapshot.collectorOrigin ??
    (typeof window === "undefined"
      ? "https://appclimb.app"
      : window.location.origin);

  const goTo = (step: WebInstallStep) =>
    setOverride({ step, anchor: state.step });
  const resume = () => setOverride(null);

  return (
    <section className="web-tracking-wizard" aria-label="Website setup">
      <header className="wt-head">
        <div>
          <span className="wt-eyebrow">Website setup</span>
          <h3>
            {snapshot.property?.domain
              ? `Install AppClimb on ${snapshot.property.domain}`
              : "Add the website you want to diagnose"}
          </h3>
          <p>
            AppClimb collects first-party visitors, referrers, UTM campaigns and
            landing pages. A saved domain is not a connected source — the site
            counts as installed only after a real browser event is accepted.
          </p>
        </div>
        {snapshot.property && <TrackingStatusPill state={state} />}
      </header>

      <ol className="wt-stepper">
        {WEB_INSTALL_STEPS.map((step, index) => {
          const reached = index <= state.stepIndex;
          const done = index < state.stepIndex;
          return (
            <li
              key={step}
              className={`wt-step${activeStep === step ? " active" : ""}${
                done ? " done" : ""
              }`}
            >
              <button
                type="button"
                disabled={!reached}
                aria-current={activeStep === step ? "step" : undefined}
                onClick={() => goTo(step)}
              >
                <span className="wt-step-index">
                  {done ? <Check size={13} /> : index + 1}
                </span>
                <span className="wt-step-title">
                  {WEB_INSTALL_STEP_TITLES[step]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {error && (
        <p className="wt-error" role="alert">
          <CircleAlert size={15} /> {error}
        </p>
      )}

      {override && override.step !== state.step && (
        <button type="button" className="wt-resume" onClick={resume}>
          <ArrowLeft size={14} /> Back to your next step:{" "}
          {WEB_INSTALL_STEP_TITLES[state.step]}
        </button>
      )}

      <div className="wt-panel">
        {activeStep === "domain" && (
          <DomainStep
            saving={loading && !loaded}
            onSaved={(property) => {
              install.setSnapshot((current) => ({
                ...current,
                property,
                facts: {
                  ...current.facts,
                  propertyId: property.id,
                  domain: property.domain,
                  reachedStep: "install",
                },
              }));
              onPropertyCreated?.(property);
              void saveStep("install");
              resume();
            }}
          />
        )}

        {activeStep === "install" && snapshot.property && (
          <InstallStep
            property={snapshot.property}
            collectorOrigin={origin}
            conversionGoal={state.conversionDiagnosisBlocked ? null : snapshot.facts.primaryConversionGoal}
            onContinue={() => {
              void saveStep("deploy");
              resume();
            }}
          />
        )}

        {activeStep === "deploy" && snapshot.property && (
          <DeployStep
            domain={snapshot.property.domain}
            checking={loading}
            onOpenAndListen={() => {
              if (typeof window !== "undefined") {
                window.open(
                  `https://${snapshot.property?.domain}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }
              void saveStep("verify");
              startListening();
              resume();
            }}
            onCheckNow={() => void refresh()}
            notDetected={loaded && !state.trackingInstalled}
          />
        )}

        {activeStep === "verify" && snapshot.property && (
          <VerifyStep
            domain={snapshot.property.domain}
            state={state}
            firstEvent={snapshot.firstEvent}
            listening={listening}
            listenAttempts={listenAttempts}
            listenTimedOut={listenTimedOut}
            checking={loading}
            onListen={() => {
              if (typeof window !== "undefined") {
                window.open(
                  `https://${snapshot.property?.domain}`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }
              startListening();
            }}
            onCheckNow={() => void refresh()}
            onContinue={() => {
              void saveStep("goal");
              resume();
            }}
          />
        )}

        {activeStep === "goal" && snapshot.property && (
          <GoalStep
            currentGoal={snapshot.facts.primaryConversionGoal}
            onSave={async (goal) => {
              const ok = await saveGoal(goal);
              if (ok) {
                void saveStep("baseline");
                resume();
              }
            }}
            onSkip={() => {
              void saveStep("baseline");
              resume();
            }}
          />
        )}

        {activeStep === "baseline" && snapshot.property && (
          <BaselineStep
            state={state}
            goal={snapshot.facts.primaryConversionGoal}
            onConfigureGoal={() => goTo("goal")}
            onRefresh={() => void refresh()}
            onFinish={onFinish}
            finishLabel={finishLabel}
          />
        )}

        {activeStep !== "domain" && !snapshot.property && (
          <p className="wt-note">
            {loading
              ? "Loading website setup…"
              : "No website property is saved yet. Start with step 1."}
          </p>
        )}
      </div>
    </section>
  );
}

function DomainStep({
  saving,
  onSaved,
}: {
  saving?: boolean;
  onSaved: (property: WebInstallProperty) => void;
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const canonical = canonicalHostname(domain);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canonical) {
      setError("Enter a valid hostname such as example.com.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/acquisition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || canonical,
          domain: canonical,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: WebInstallProperty;
        error?: string;
      } | null;
      if (!response.ok || !payload?.data) {
        throw new Error(payload?.error ?? "web_property_failed");
      }
      onSaved(payload.data);
    } catch (saveError) {
      const code = saveError instanceof Error ? saveError.message : "";
      setError(
        code === "web_property_exists"
          ? "This domain is already saved in this workspace. Open it to finish the install."
          : code === "admin_required"
            ? "Only workspace owners and admins can add a website."
            : "The website could not be saved. Check the domain and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="wt-form" onSubmit={submit}>
      <label className="wt-field">
        Website domain
        <input
          name="domain"
          value={domain}
          onChange={(event) => {
            setDomain(event.target.value);
            setError("");
          }}
          placeholder="example.com"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <small>
          {canonical
            ? `Canonical hostname: ${canonical}`
            : "Paste the URL or hostname. www. and paths are removed."}
        </small>
      </label>
      <label className="wt-field">
        Display name (optional)
        <input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Marketing website"
          maxLength={120}
        />
      </label>
      {error && (
        <p className="wt-error" role="alert">
          {error}
        </p>
      )}
      <div className="wt-actions">
        <button
          type="submit"
          className="wt-primary"
          disabled={!canonical || submitting || saving}
        >
          {submitting ? <LoaderCircle className="spin" size={16} /> : null}
          {submitting ? "Saving website…" : "Save website"}
        </button>
      </div>
      <p className="wt-note">
        Saving the domain does not connect anything yet. AppClimb will report{" "}
        <strong>Website saved</strong> until it accepts a real browser event.
      </p>
    </form>
  );
}

function InstallStep({
  property,
  collectorOrigin,
  conversionGoal,
  onContinue,
}: {
  property: WebInstallProperty;
  collectorOrigin: string;
  conversionGoal?: string | null;
  onContinue: () => void;
}) {
  const [tab, setTab] = useState<TrackingInstallTabId>("agent");
  const [copied, setCopied] = useState(false);

  const target = {
    domain: property.domain,
    trackingToken: property.trackingToken ?? "",
    collectorOrigin,
  };

  const tabs = useMemo<TrackingInstallTab[]>(() => {
    const agentTab: TrackingInstallTab = {
      id: "agent",
      label: "AI coding agent",
      summary:
        "Hand this to Claude Code, Cursor or any coding agent. It contains only the browser install.",
      language: "markdown",
      code: buildTrackingAgentPrompt({
        ...target,
        name: property.name,
        conversionGoal,
      }),
    };
    const framework = buildFrameworkInstallTabs(target);
    return [
      agentTab,
      ...framework.filter((item) => item.id !== "crawler"),
      {
        ...(framework.find((item) => item.id === "crawler") as TrackingInstallTab),
        code: buildCrawlerAgentPrompt({ ...target, name: property.name }),
        language: "markdown",
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    property.domain,
    property.name,
    property.trackingToken,
    collectorOrigin,
    conversionGoal,
  ]);

  const active = tabs.find((item) => item.id === tab) ?? tabs[0];

  if (!property.trackingToken) {
    return (
      <p className="wt-note">
        This website has no tracking token yet. Reload the workspace, or reopen
        the property from Acquisition Atlas.
      </p>
    );
  }

  return (
    <div className="wt-install">
      <div className="wt-tabs" role="tablist" aria-label="Installation method">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`${tab === item.id ? "active" : ""}${
              item.advanced ? " advanced" : ""
            }`}
            onClick={() => setTab(item.id)}
          >
            {item.id === "agent" && <Sparkles size={14} />}
            {item.label}
          </button>
        ))}
      </div>

      <p className="wt-tab-summary">{active.summary}</p>
      {active.filename && <code className="wt-filename">{active.filename}</code>}

      <div className="wt-code-block">
        <pre>
          <code>{active.code}</code>
        </pre>
        <button
          type="button"
          className="wt-copy"
          onClick={() => {
            void navigator.clipboard.writeText(active.code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? <Check size={15} /> : <Clipboard size={15} />}
          {copied
            ? "Copied"
            : active.id === "agent"
              ? "Copy AI agent prompt"
              : "Copy install snippet"}
        </button>
      </div>

      {active.id !== "agent" && active.id !== "crawler" && (
        <details className="wt-raw-snippet">
          <summary>Raw script tag</summary>
          <pre>
            <code>{buildTrackingSnippet(target)}</code>
          </pre>
        </details>
      )}

      <div className="wt-actions">
        <button type="button" className="wt-primary" onClick={onContinue}>
          I added the script — next: deploy
        </button>
      </div>
    </div>
  );
}

function DeployStep({
  domain,
  checking,
  notDetected,
  onOpenAndListen,
  onCheckNow,
}: {
  domain: string;
  checking?: boolean;
  notDetected?: boolean;
  onOpenAndListen: () => void;
  onCheckNow: () => void;
}) {
  return (
    <div className="wt-deploy">
      <ol className="wt-checklist">
        <li>Deploy the change to the live site (not a local preview).</li>
        <li>
          Confirm the script is served on <code>https://{domain}</code>.
        </li>
        <li>Open one page in a normal browser so a real event is produced.</li>
      </ol>

      <div className="wt-actions">
        <button type="button" className="wt-primary" onClick={onOpenAndListen}>
          <ExternalLink size={16} />
          Open live site and listen for the first event
        </button>
        <button
          type="button"
          className="wt-secondary"
          onClick={onCheckNow}
          disabled={checking}
        >
          {checking ? <LoaderCircle className="spin" size={15} /> : null}
          {checking ? "Checking…" : "Check for events now"}
        </button>
      </div>

      {notDetected && (
        <p className="wt-not-detected" role="status">
          Tracking not detected yet. No real event has reached AppClimb from{" "}
          {domain}. That is expected before the deploy goes live — AppClimb does
          not invent traffic.
        </p>
      )}
    </div>
  );
}

function VerifyStep({
  domain,
  state,
  firstEvent,
  listening,
  listenAttempts,
  listenTimedOut,
  checking,
  onListen,
  onCheckNow,
  onContinue,
}: {
  domain: string;
  state: ReturnType<typeof useWebInstallState>["state"];
  firstEvent: React.ComponentProps<typeof TrackingStatusSummary>["event"];
  listening: boolean;
  listenAttempts: number;
  listenTimedOut: boolean;
  checking?: boolean;
  onListen: () => void;
  onCheckNow: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="wt-verify">
      {listening && (
        <div className="wt-listening" role="status">
          <span className="wt-radar" aria-hidden="true">
            <Radio size={20} />
          </span>
          <div>
            <strong>Listening for the first real event…</strong>
            <span>
              Checked {listenAttempts} time{listenAttempts === 1 ? "" : "s"}.
              Open a page on {domain} in a normal browser.
            </span>
          </div>
        </div>
      )}

      <TrackingStatusSummary
        state={state}
        domain={domain}
        event={state.trackingInstalled ? firstEvent : null}
      />

      {!state.trackingInstalled && !listening && (
        <p className="wt-not-detected" role="status">
          {listenTimedOut
            ? `No event arrived while listening. Tracking not detected on ${domain} yet.`
            : `Tracking not detected on ${domain} yet.`}{" "}
          Check that the deploy is live and that the script runs on the same
          hostname.
        </p>
      )}

      <div className="wt-actions">
        {state.trackingInstalled ? (
          <button type="button" className="wt-primary" onClick={onContinue}>
            Next: configure a conversion goal
          </button>
        ) : (
          <>
            <button
              type="button"
              className="wt-primary"
              onClick={onListen}
              disabled={listening}
            >
              <ExternalLink size={16} />
              Open live site and listen for the first event
            </button>
            <button
              type="button"
              className="wt-secondary"
              onClick={onCheckNow}
              disabled={checking || listening}
            >
              {checking ? <LoaderCircle className="spin" size={15} /> : null}
              {checking ? "Checking…" : "Check for events now"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GoalStep({
  currentGoal,
  onSave,
  onSkip,
}: {
  currentGoal?: string | null;
  onSave: (goal: string) => Promise<void>;
  onSkip: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <ConversionGoalSetup
      currentGoal={currentGoal}
      saving={saving}
      error={error}
      onSkip={onSkip}
      onSave={async (goal) => {
        setSaving(true);
        setError("");
        try {
          await onSave(goal);
        } catch {
          setError("The conversion goal could not be saved. Try again.");
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}

function BaselineStep({
  state,
  goal,
  onConfigureGoal,
  onRefresh,
  onFinish,
  finishLabel,
}: {
  state: ReturnType<typeof useWebInstallState>["state"];
  goal?: string | null;
  onConfigureGoal: () => void;
  onRefresh: () => void;
  onFinish?: () => void;
  finishLabel: string;
}) {
  return (
    <div className="wt-baseline-step">
      <BaselineProgress state={state} />

      {state.conversionDiagnosisBlocked ? (
        <p className="wt-blocked-note" role="status">
          No conversion goal is configured. AppClimb can analyse acquisition —
          sources, referrers, campaigns and landing pages — but conversion
          diagnosis is blocked until a goal exists.{" "}
          <button type="button" className="wt-link" onClick={onConfigureGoal}>
            Configure a conversion goal
          </button>
        </p>
      ) : (
        <p className="wt-note">
          Primary conversion goal: <code>{goal}</code>
        </p>
      )}

      <div className="wt-actions">
        <button type="button" className="wt-secondary" onClick={onRefresh}>
          Refresh progress
        </button>
        {onFinish && (
          <button type="button" className="wt-primary" onClick={onFinish}>
            {finishLabel}
          </button>
        )}
      </div>
    </div>
  );
}
