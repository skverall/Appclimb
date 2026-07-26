"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CloudOff,
  Compass,
  CreditCard,
  Globe2,
  PanelTop,
  PlugZap,
  RefreshCw,
  Sparkles,
  Store,
  Zap,
  ArrowDownToLine,
} from "lucide-react";

import type {
  DashboardSnapshot,
  SourceConnection,
  StageId,
} from "@/lib/contracts";
import { ProviderMark } from "@/components/provider-mark";

const STAGE_ICONS = {
  discover: Compass,
  store: Store,
  install: ArrowDownToLine,
  activate: Zap,
  paywall: PanelTop,
  trial: Sparkles,
  paid: CreditCard,
  renew: RefreshCw,
} satisfies Record<StageId, typeof Compass>;

export function EmptyWorkspaceView({
  snapshot,
  onOpenSources,
  onOpenAcquisitionAtlas,
  onOpenMethodology,
}: {
  snapshot: DashboardSnapshot;
  onOpenSources: (provider?: SourceConnection["provider"]) => void;
  onOpenAcquisitionAtlas: () => void;
  onOpenMethodology: () => void;
}) {
  const configuredSources = snapshot.sources.filter(
    (source) =>
      source.provider !== "appclimb-rank" &&
      source.status !== "not-connected",
  );
  const awaitingMetrics = configuredSources.length > 0;
  const apple = snapshot.sources.find(
    (source) => source.provider === "app-store-connect",
  );
  const posthog = snapshot.sources.find((source) => source.provider === "posthog");
  const appleConfigured = Boolean(
    apple && apple.status !== "not-connected",
  );
  const posthogConfigured = Boolean(
    posthog && posthog.status !== "not-connected",
  );
  const applePending =
    apple?.lastErrorCode === "apple_reports_pending" ||
    (apple?.status === "connected" && (apple.metricCount ?? 0) === 0);
  const posthogNeedsEvents =
    posthog?.lastErrorCode === "no_data_in_window" ||
    posthog?.status === "needs-attention";
  const primaryProvider = posthogNeedsEvents
    ? "posthog"
    : apple?.status === "not-connected"
      ? "app-store-connect"
      : posthog?.status === "not-connected"
        ? "posthog"
        : undefined;
  const primaryLabel = posthogNeedsEvents
    ? "Choose PostHog events"
    : applePending && posthog?.status === "not-connected"
      ? "Use PostHog while Apple prepares"
      : awaitingMetrics
        ? "Review source status"
        : "Add your iOS app";

  return (
    <section className="empty-workspace" aria-labelledby="empty-workspace-title">
      <div className="empty-workspace-copy">
        <span className="eyebrow">
          {awaitingMetrics ? "Awaiting live metrics" : "No live data yet"}
        </span>
        <h2 id="empty-workspace-title">
          {awaitingMetrics
            ? "Your app is added. Finish one live signal."
            : "Add your app, then follow one clear next step."}
        </h2>
        <p>
          {awaitingMetrics
            ? "Your access is saved. AppClimb will show exactly what is ready, what is waiting on a provider, and what you can finish now."
            : "Start with App Store Connect for your iOS app. You can also add product events or a website without hunting through the dashboard."}
        </p>
      </div>

      <div className="activation-path" aria-label="Workspace setup">
        <button
          className={`activation-path-card ${
            appleConfigured ? "is-complete" : ""
          }`}
          type="button"
          onClick={() => onOpenSources("app-store-connect")}
        >
          <span className="activation-step-icon">
            {appleConfigured ? (
              <CheckCircle2 size={18} />
            ) : (
              <Store size={18} />
            )}
          </span>
          <span>
            <small>iOS app</small>
            <strong>{apple?.accountLabel || snapshot.app.name}</strong>
            <em>
              {appleConfigured
                ? "Added through App Store Connect"
                : "Add App Store Connect"}
            </em>
          </span>
          <ArrowRight size={17} />
        </button>

        <button
          className={`activation-path-card ${
            (posthog?.metricCount ?? 0) > 0
              ? "is-complete"
              : posthogNeedsEvents
                ? "needs-action"
                : ""
          }`}
          type="button"
          onClick={() => onOpenSources("posthog")}
        >
          <span className="activation-step-icon">
            {posthogNeedsEvents ? (
              <CircleAlert size={18} />
            ) : (posthog?.metricCount ?? 0) > 0 ? (
              <CheckCircle2 size={18} />
            ) : (
              <Zap size={18} />
            )}
          </span>
          <span>
            <small>Product events</small>
            <strong>PostHog activation</strong>
            <em>
              {posthogNeedsEvents
                ? "Choose events that exist in your project"
                : (posthog?.metricCount ?? 0) > 0
                  ? "Live product events"
                  : posthogConfigured
                    ? "Access saved · waiting for data"
                    : "Connect or skip for now"}
            </em>
          </span>
          <ArrowRight size={17} />
        </button>

        <button
          className="activation-path-card"
          type="button"
          onClick={onOpenAcquisitionAtlas}
        >
          <span className="activation-step-icon">
            <Globe2 size={18} />
          </span>
          <span>
            <small>Website · optional</small>
            <strong>Add a web property</strong>
            <em>Install first-party Acquisition Atlas tracking</em>
          </span>
          <ArrowRight size={17} />
        </button>
      </div>

      {applePending && (
        <div className="apple-preparing-card" role="status">
          <Clock3 size={20} />
          <div>
            <strong>Apple access works. The first report files are still preparing.</strong>
            <p>
              Apple normally needs 24–48 hours for a new Analytics Reports
              request. AppClimb checks ready one-time history first, then keeps
              importing ongoing daily files automatically.
            </p>
            <small>
              For history, an App Store Connect Admin must request a
              ONE_TIME_SNAPSHOT once. Keep the connected AppClimb key limited
              to the Sales and Reports role.
            </small>
          </div>
        </div>
      )}

      <div className="empty-river" aria-label="Growth River stages awaiting data">
        <div className="empty-river-flow" aria-hidden="true" />
        {snapshot.stages.map((stage) => {
          const Icon = STAGE_ICONS[stage.id];
          return (
            <div className="empty-stage" key={stage.id}>
              <Icon size={18} />
              <span>{stage.label}</span>
            </div>
          );
        })}
      </div>

      <div className="empty-actions">
        <button
          className="primary-action"
          type="button"
          onClick={() => onOpenSources(primaryProvider)}
        >
          <PlugZap size={17} /> {primaryLabel} <ArrowRight size={17} />
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={onOpenMethodology}
        >
          How source ownership works
        </button>
      </div>

      {/**
       * Current source state comes before the numbered explainer. It is the
       * only block here that says something specific about this workspace,
       * and it is what the primary action leads to; the steps below merely
       * describe what will happen once a sync lands.
       */}
      <div className="empty-source-preview">
        <h3>
          {awaitingMetrics
            ? "Configured source state"
            : "Connect a source to get started"}
        </h3>
        <div>
          {snapshot.sources.map((source) => (
            <EmptySourceCard
              source={source}
              key={source.provider}
              onOpenSources={onOpenSources}
            />
          ))}
        </div>
      </div>

      <ol className="empty-steps">
        <li>
          <span>1</span>
          <div>
            <strong>
              {awaitingMetrics ? "Review source status" : "Connect a source"}
            </strong>
            <p>
              {awaitingMetrics
                ? "Confirm the configured source is connected and has data in the selected window."
                : "Choose the system that owns the first metric you trust."}
            </p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Complete a data-bearing sync</strong>
            <p>
              Imports are validated and normalized to UTC in the background;
              a zero-row window remains visible as needing attention.
            </p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Open the first bottleneck</strong>
            <p>Only supported evidence becomes a diagnosis or draft experiment.</p>
          </div>
        </li>
      </ol>

      <p className="empty-trust-note">
        <CheckCircle2 size={15} />
        Credentials stay encrypted server-side · External systems remain
        unchanged
      </p>
    </section>
  );
}

function EmptySourceCard({
  source,
  onOpenSources,
}: {
  source: SourceConnection;
  onOpenSources: (provider?: SourceConnection["provider"]) => void;
}) {
  const statusKey =
    source.provider === "appclimb-rank"
      ? "roadmap"
      : source.syncStatus === "queued" ||
          source.syncStatus === "running" ||
          source.syncStatus === "retrying"
        ? "importing"
      : source.lastErrorCode === "apple_reports_pending"
        ? "pending"
      : source.status === "connected" && (source.metricCount ?? 0) > 0
        ? "live"
      : source.status === "connected"
        ? "saved"
      : source.status === "needs-attention"
        ? "attention"
        : "unconnected";

  const statusLabel = {
    roadmap: "Roadmap",
    importing: "Importing",
    pending: "Preparing reports",
    live: "Live data",
    saved: "Access saved",
    attention: "Needs attention",
    unconnected: "Not connected",
  }[statusKey];

  return (
    <button
      className={`empty-source-card status-${statusKey}`}
      type="button"
      onClick={() => onOpenSources(source.provider)}
      aria-label={`Open Sources to connect ${source.label}`}
    >
      <div className="empty-source-card-header">
        <span className={`provider-logo provider-${source.provider}`}>
          <ProviderMark provider={source.provider} />
        </span>
        <span className={`source-status-badge status-${statusKey}`}>
          {statusLabel}
        </span>
      </div>
      <div className="empty-source-card-body">
        <strong>{source.label}</strong>
        <small>{source.capabilities.slice(0, 2).join(" · ")}</small>
      </div>
    </button>
  );
}

export function NoEvidenceView({
  section,
  hasObservedMetrics,
  onOpenSources,
}: {
  section: "Diagnose" | "Lab";
  hasObservedMetrics: boolean;
  onOpenSources: () => void;
}) {
  return (
    <section className="state-card" aria-labelledby="no-evidence-title">
      <span className="state-icon">
        <PlugZap size={24} />
      </span>
      <span className="eyebrow">{section}</span>
      <h2 id="no-evidence-title">
        {hasObservedMetrics
          ? "No defensible constraint yet"
          : "Evidence comes before recommendations"}
      </h2>
      <p>
        {hasObservedMetrics
          ? "Observed metrics are available, but no explicit workspace baseline supports a health classification yet. AppClimb keeps the stages unknown instead of inventing a benchmark or recommendation."
          : "Connect and sync a source first. This workspace will stay empty instead of filling gaps with sample metrics or generic experiments."}
      </p>
      <button className="primary-action" type="button" onClick={onOpenSources}>
        {hasObservedMetrics ? "Review source evidence" : "Open Sources"}{" "}
        <ArrowRight size={17} />
      </button>
    </section>
  );
}

export function UnavailableWorkspaceView({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <section className="state-card" aria-labelledby="unavailable-title">
      <span className="state-icon state-icon-error">
        <CloudOff size={24} />
      </span>
      <span className="eyebrow">Temporary source error</span>
      <h2 id="unavailable-title">Your workspace could not be loaded</h2>
      <p>
        AppClimb is not showing demo values in place of your data. Your sources
        and credentials were not changed.
      </p>
      <button
        className="primary-action"
        type="button"
        onClick={onRetry}
      >
        <RefreshCw size={17} /> Try again
      </button>
    </section>
  );
}

export function RestrictedWorkspaceView({
  onOpenBilling,
  onOpenSources,
}: {
  onOpenBilling: () => void;
  onOpenSources: () => void;
}) {
  return (
    <section className="state-card" aria-labelledby="restricted-title">
      <span className="state-icon">
        <CreditCard size={24} />
      </span>
      <span className="eyebrow">Plan required</span>
      <h2 id="restricted-title">Your data pipeline is safely paused</h2>
      <p>
        The trial or paid access period has ended. Existing workspace data is
        not replaced with demo metrics, and no new imports run until access is
        restored.
      </p>
      <div className="empty-actions">
        <button
          className="primary-action"
          type="button"
          onClick={onOpenBilling}
        >
          Choose a plan <ArrowRight size={17} />
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={onOpenSources}
        >
          Review Sources
        </button>
      </div>
    </section>
  );
}
