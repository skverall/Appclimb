"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Code2,
  ExternalLink,
  FlaskConical,
  Gauge,
  HelpCircle,
  LogIn,
  LogOut,
  PlugZap,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";

import { logout } from "@/app/actions";
import { AcquisitionAtlas } from "@/components/acquisition-atlas";
import { AccountSecurity } from "@/components/account-security";
import { BrandMark } from "@/components/brand-mark";
import { ModalDialog } from "@/components/modal-dialog";
import { PlanCheckout } from "@/components/plan-checkout";
import {
  AVATAR_KEYS,
  type AvatarKey,
  ProfileAvatar,
} from "@/components/profile-avatar";
import { PulseView } from "@/components/pulse-view";
import {
  DiagnoseView,
  LabView,
} from "@/components/workspace-views";
import { SourcesView } from "@/components/sources-view";
import {
  EmptyWorkspaceView,
  NoEvidenceView,
  RestrictedWorkspaceView,
  UnavailableWorkspaceView,
} from "@/components/workspace-state";
import type {
  DashboardSnapshot,
  Experiment,
  Insight,
  SourceConnection,
} from "@/lib/contracts";
import type { BackendIdentity } from "@/lib/backend";
import {
  createExperimentDraft,
  experimentIdForInsight,
} from "@/lib/experiments";
import {
  type WorkspaceSection,
  workspaceInsightFromValue,
  workspaceSectionFromValue,
} from "@/lib/workspace-navigation";

const NAV_ITEMS: {
  id: WorkspaceSection;
  label: string;
  icon: typeof Gauge;
}[] = [
  { id: "pulse", label: "Pulse", icon: Gauge },
  { id: "diagnose", label: "Diagnose", icon: Activity },
  { id: "lab", label: "Lab", icon: FlaskConical },
  { id: "sources", label: "Sources", icon: PlugZap },
];

/**
 * Both Pulse projections report on the same workspace, so the Atlas opens on
 * the window the Growth River filter row already shows.
 */
function analyticsWindowDays(period: string): 7 | 30 | 90 {
  const days = Number(period.match(/\d+/)?.[0]);
  return days === 7 || days === 90 ? days : 30;
}

export function AppClimbShell({
  initialSnapshot,
  initialSection = "pulse",
  initialInsightId,
  initialPulseProjection = "growth",
  session,
  privateSessionExpected = false,
  trialDaysRemaining,
}: {
  initialSnapshot: DashboardSnapshot;
  initialSection?: WorkspaceSection;
  initialInsightId?: string;
  initialPulseProjection?: "growth" | "acquisition";
  session?: BackendIdentity;
  privateSessionExpected?: boolean;
  trialDaysRemaining?: number;
}) {
  const insightIds = useMemo(
    () => initialSnapshot.insights.map((insight) => insight.id),
    [initialSnapshot.insights],
  );
  const [activeSection, setActiveSection] =
    useState<WorkspaceSection>(initialSection);
  const [selectedInsightId, setSelectedInsightId] = useState(
    workspaceInsightFromValue(initialInsightId, insightIds),
  );
  const [replayIndex, setReplayIndex] = useState(initialSnapshot.events.length);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [avatarKey, setAvatarKey] = useState<AvatarKey>(
    (session?.avatarKey as AvatarKey | undefined) ?? "ridge",
  );
  const [avatarState, setAvatarState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [experiments, setExperiments] = useState<Experiment[]>(
    initialSnapshot.experiments,
  );
  const [sourceConnections, setSourceConnections] = useState<
    SourceConnection[]
  >(initialSnapshot.sources);
  const [latestCreatedExperimentId, setLatestCreatedExperimentId] =
    useState("");
  const [pulseProjection, setPulseProjection] = useState<
    "growth" | "acquisition"
  >(initialPulseProjection);

  const selectedInsight = useMemo<Insight | undefined>(
    () =>
      initialSnapshot.insights.find(
        (insight) => insight.id === selectedInsightId,
      ),
    [initialSnapshot.insights, selectedInsightId],
  );

  const updateWorkspaceUrl = useCallback(
    (
      section: WorkspaceSection,
      insightId: string,
      method: "pushState" | "replaceState" = "pushState",
    ) => {
      const url = new URL(window.location.href);
      if (section === "pulse") {
        url.searchParams.delete("view");
      } else {
        url.searchParams.set("view", section);
      }
      if ((section === "diagnose" || section === "lab") && insightId) {
        url.searchParams.set("insight", insightId);
      } else {
        url.searchParams.delete("insight");
      }
      window.history[method](null, "", `${url.pathname}${url.search}${url.hash}`);
    },
    [],
  );

  const navigateTo = useCallback(
    (section: WorkspaceSection, insightId = selectedInsightId) => {
      setActiveSection(section);
      setSelectedInsightId(
        workspaceInsightFromValue(insightId, insightIds),
      );
      updateWorkspaceUrl(section, insightId);
    },
    [insightIds, selectedInsightId, updateWorkspaceUrl],
  );

  const selectPulseProjection = useCallback(
    (projection: "growth" | "acquisition") => {
      setPulseProjection(projection);
      const url = new URL(window.location.href);
      if (projection === "acquisition") {
        url.searchParams.set("atlas", "1");
      } else {
        url.searchParams.delete("atlas");
      }
      window.history.pushState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    },
    [],
  );

  const selectInsight = useCallback(
    (insightId: string) => {
      const nextInsightId = workspaceInsightFromValue(insightId, insightIds);
      setSelectedInsightId(nextInsightId);
      if (activeSection === "diagnose") {
        updateWorkspaceUrl("diagnose", nextInsightId, "replaceState");
      }
    },
    [activeSection, insightIds, updateWorkspaceUrl],
  );

  useEffect(() => {
    const restoreWorkspaceLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const section = workspaceSectionFromValue(params.get("view"));
      const insightId = workspaceInsightFromValue(
        params.get("insight"),
        insightIds,
      );
      setActiveSection(section);
      setSelectedInsightId(insightId);
      setPulseProjection(
        params.get("atlas") === "1" ? "acquisition" : "growth",
      );
    };

    window.addEventListener("popstate", restoreWorkspaceLocation);
    return () =>
      window.removeEventListener("popstate", restoreWorkspaceLocation);
  }, [insightIds]);

  const openInsight = (insightId: string) => {
    navigateTo("diagnose", insightId);
  };
  const createDraftFromInsight = (insight?: Insight) => {
    if (!insight) return;
    const experimentId = experimentIdForInsight(insight.id);
    setExperiments((current) =>
      current.some((experiment) => experiment.id === experimentId)
        ? current
        : [createExperimentDraft(initialSnapshot, insight), ...current],
    );
    setLatestCreatedExperimentId(experimentId);
    navigateTo("lab", insight.id);
  };
  const trialDays = trialDaysRemaining ?? 12;
  const subscriptionStatus = session?.subscriptionStatus.toLowerCase();
  const accessRestricted = initialSnapshot.mode === "restricted";
  const sessionUnavailable = privateSessionExpected && !session;
  const workspaceEntitled =
    Boolean(session) &&
    (initialSnapshot.mode === "live" || initialSnapshot.mode === "empty");
  const activeSubscription =
    !accessRestricted &&
    (subscriptionStatus === "active" || subscriptionStatus === "paid");
  const billingAttention =
    accessRestricted ||
    subscriptionStatus === "past_due" ||
    subscriptionStatus === "expired" ||
    subscriptionStatus === "canceled" ||
    subscriptionStatus === "cancelled";
  const sourceNavState = sessionUnavailable
    ? "unavailable"
    : accessRestricted
      ? "restricted"
      : initialSnapshot.mode === "demo"
        ? "demo"
        : sourceConnections.some(
              (source) =>
                source.status === "needs-attention" ||
                source.syncStatus === "failed",
            )
          ? "attention"
          : sourceConnections.some(
                (source) =>
                  source.syncStatus === "queued" ||
                  source.syncStatus === "running" ||
                  source.syncStatus === "retrying",
            )
            ? "syncing"
          : sourceConnections.some((source) => (source.metricCount ?? 0) > 0)
            ? "connected"
            : sourceConnections.some((source) => source.status === "connected")
              ? "waiting"
            : "empty";
  const sourceNavLabel = {
    unavailable: "workspace unavailable",
    restricted: "imports paused",
    demo: "sample profiles",
    attention: "connection needs attention",
    syncing: "source import in progress",
    connected: "source connected",
    waiting: "source access saved; awaiting data",
    empty: "no sources connected",
  }[sourceNavState];
  const trialProgress = Math.max(0, Math.min(100, (trialDays / 14) * 100));
  const profileName = session ? session.email.split("@")[0] : "Demo";
  const connectedAppleName = sourceConnections.find(
    (source) =>
      source.provider === "app-store-connect" &&
      source.status !== "not-connected" &&
      source.accountLabel?.trim(),
  )?.accountLabel;
  const displayedAppName = connectedAppleName?.trim() || initialSnapshot.app.name;
  const workspaceSnapshot = {
    ...initialSnapshot,
    app: { ...initialSnapshot.app, name: displayedAppName },
    sources: sourceConnections,
  };
  const appInitials = displayedAppName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "AC";
  const workspaceStatus =
    initialSnapshot.mode === "demo"
      ? "Interactive demo · synthetic sample data"
      : initialSnapshot.mode === "empty"
        ? "Growth River awaiting source data"
        : initialSnapshot.mode === "restricted"
          ? "Plan required · imports paused"
          : initialSnapshot.mode === "unavailable"
            ? "Workspace data unavailable"
            : "Live workspace";
  const accountPlanLabel = activeSubscription
      ? "AppClimb Pro · active"
      : accessRestricted
        ? "Access limited · plan required"
      : subscriptionStatus === "trialing" && trialDays > 0
        ? `${trialDays} trial days left`
        : workspaceEntitled
          ? "Access active · current entitlement"
        : `${session?.subscriptionStatus ?? "unknown"} · billing status`;
  const deleteAccount = async () => {
    if (
      !session ||
      !window.confirm(
        "Delete this workspace, its history and encrypted credentials permanently?",
      )
    ) {
      return;
    }
    setDeletingAccount(true);
    setAccountError("");
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      if (!response.ok) throw new Error("deletion_failed");
      window.location.assign("/");
    } catch {
      setAccountError("Account deletion could not be completed. Try again.");
      setDeletingAccount(false);
    }
  };
  const saveAvatar = async (nextAvatar: AvatarKey) => {
    if (!session || nextAvatar === avatarKey || avatarState === "saving") return;
    const previous = avatarKey;
    setAvatarKey(nextAvatar);
    setAvatarState("saving");
    setAccountError("");
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatarKey: nextAvatar }),
      });
      if (!response.ok) throw new Error("avatar_update_failed");
      setAvatarState("saved");
      window.setTimeout(() => setAvatarState("idle"), 1800);
    } catch {
      setAvatarKey(previous);
      setAvatarState("error");
      setAccountError("Avatar could not be saved. Try again.");
    }
  };
  const retryWorkspace = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    window.location.assign(`${url.pathname}${url.search}${url.hash}`);
  };
  const openSourceSetup = (provider: SourceConnection["provider"]) => {
    const url = new URL(window.location.href);
    url.searchParams.set("source", provider);
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    navigateTo("sources");
  };
  const openAcquisitionAtlas = () => {
    setPulseProjection("acquisition");
    navigateTo("pulse");
    const url = new URL(window.location.href);
    url.searchParams.set("atlas", "1");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  };

  return (
    <div
      className="app-shell"
      data-nosnippet={initialSnapshot.mode === "demo" ? "" : undefined}
    >
      <aside className="sidebar">
        <div>
          <button
            className="sidebar-brand-home"
            type="button"
            onClick={() => {
              setPulseProjection("growth");
              navigateTo("pulse");
            }}
            aria-label="Open AppClimb Pulse"
          >
            <BrandMark />
          </button>
          <button
            className="workspace-switcher"
            type="button"
            onClick={() => openSourceSetup("app-store-connect")}
            aria-label={`Manage ${displayedAppName}`}
          >
            <div className="app-avatar" aria-hidden="true">
              <span>{appInitials}</span>
            </div>
            <div>
              <strong>{displayedAppName}</strong>
              <span>Current app · {initialSnapshot.app.platform}</span>
            </div>
            <ChevronRight size={16} aria-hidden="true" />
          </button>

          <nav className="main-nav" aria-label="Primary navigation">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                className={activeSection === id ? "nav-item active" : "nav-item"}
                key={id}
                type="button"
                onClick={() => navigateTo(id)}
                aria-current={activeSection === id ? "page" : undefined}
                aria-label={label}
                title={id === "sources" ? sourceNavLabel : undefined}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{label}</span>
                {id === "sources" && (
                  <span
                    className={`nav-status-dot nav-status-${sourceNavState}`}
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          {!session && !sessionUnavailable && (
            <nav
              className="demo-resource-links"
              aria-label="Learn about AppClimb"
            >
              <Link href="/ios-subscription-analytics">Product</Link>
              <Link href="/guides/ios-subscription-growth">Growth guide</Link>
            </nav>
          )}
          <div className="trial-card">
            <div>
              <span className="eyebrow">
                {activeSubscription
                  ? "AppClimb Pro"
                  : billingAttention
                    ? "Billing attention"
                    : sessionUnavailable
                      ? "Private workspace"
                    : subscriptionStatus === "trialing" && trialDays > 0
                      ? "Free trial"
                      : workspaceEntitled
                        ? "Access active"
                      : "Demo workspace"}
              </span>
              <strong>
                {activeSubscription
                  ? "Plan active"
                  : billingAttention
                    ? "Workspace access limited"
                    : sessionUnavailable
                      ? "Temporarily unavailable"
                    : subscriptionStatus === "trialing" && trialDays > 0
                      ? `${trialDays} days left`
                      : workspaceEntitled
                        ? "Current entitlement"
                      : "Explore River Atlas"}
              </strong>
            </div>
            {!activeSubscription && !sessionUnavailable && (
              <>
                <div className="trial-track">
                  <span style={{ width: `${session ? trialProgress : 46}%` }} />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (session) {
                      setBillingOpen(true);
                    } else {
                      window.location.assign("/login");
                    }
                  }}
                >
                  {session ? "Choose plan" : "Start private workspace"}
                </button>
              </>
            )}
          </div>
          <button
            className="footer-link"
            type="button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} /> Settings
          </button>
          {session ? (
            <button
              className="profile-row"
              type="button"
              onClick={() => setSettingsOpen(true)}
            >
              <ProfileAvatar avatarKey={avatarKey} />
              <span>
                <strong>{profileName}</strong>
                <small>{accountPlanLabel}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ) : sessionUnavailable ? (
            <div className="session-recovery-row">
              <button
                className="profile-row"
                type="button"
                onClick={retryWorkspace}
              >
                <span className="profile-avatar">··</span>
                <span>
                  <strong>Session unavailable</strong>
                  <small>Retry loading</small>
                </span>
                <RefreshCw size={16} />
              </button>
              <form action={logout}>
                <button
                  className="session-signout"
                  type="submit"
                  aria-label="Sign out and clear this local session"
                  title="Sign out"
                >
                  <LogOut size={16} />
                </button>
              </form>
            </div>
          ) : (
            <Link className="profile-row" href="/login">
              <span className="profile-avatar">DE</span>
              <span>
                <strong>Create account</strong>
                <small>Or sign in</small>
              </span>
              <LogIn size={16} />
            </Link>
          )}
        </div>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <div>
            <p className="eyebrow">{initialSnapshot.workspaceName}</p>
            <h1>{NAV_ITEMS.find((item) => item.id === activeSection)?.label}</h1>
          </div>
          {/**
           * Two clusters, not one queue. Read-only state chips come first and
           * carry no border, then the interactive controls. Previously the two
           * status indicators sat at opposite ends with three buttons between
           * them, and both were styled as bordered pills, so nothing in the row
           * signalled what could be clicked.
           */}
          <div className="topbar-actions">
            <div className="topbar-state-group" role="status">
              <span
                className={`workspace-status workspace-status-${initialSnapshot.mode ?? "demo"}`}
              >
                {workspaceStatus}
              </span>
              <div className="readonly-pill">
                <span />
                Read-only
              </div>
            </div>
            <div className="topbar-control-group">
              <Link
                className="topbar-demo-action"
                href={
                  initialSnapshot.mode === "demo" && session ? "/" : "/?demo=1"
                }
              >
                {initialSnapshot.mode === "demo" && session
                  ? "Open workspace"
                  : "View demo"}
              </Link>
              <button
                className="icon-button"
                type="button"
                aria-label="Help"
                onClick={() => setHelpOpen(true)}
              >
                <HelpCircle size={19} />
              </button>
              <button
                className="icon-button account-button"
                type="button"
                aria-label="Account and settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings size={18} />
              </button>
              {session && !activeSubscription && (
                <button
                  className="mobile-plan-action"
                  type="button"
                  onClick={() => setBillingOpen(true)}
                >
                  Choose plan
                </button>
              )}
              {!session && !sessionUnavailable && (
                <Link className="topbar-auth-action" href="/login">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="workspace-content">
          {activeSection === "pulse" &&
            initialSnapshot.mode !== "unavailable" &&
            initialSnapshot.mode !== "restricted" && (
              <div
                className="pulse-projection-switch"
                role="tablist"
                aria-label="Pulse projection"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={pulseProjection === "growth"}
                  className={pulseProjection === "growth" ? "active" : ""}
                  onClick={() => selectPulseProjection("growth")}
                >
                  <Gauge size={14} /> Growth River
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pulseProjection === "acquisition"}
                  className={
                    pulseProjection === "acquisition" ? "active" : ""
                  }
                  onClick={() => selectPulseProjection("acquisition")}
                >
                  <Code2 size={14} /> Acquisition Atlas
                </button>
              </div>
            )}
          {initialSnapshot.mode === "unavailable" ? (
            <UnavailableWorkspaceView onRetry={retryWorkspace} />
          ) : initialSnapshot.mode === "restricted" &&
            activeSection !== "sources" ? (
            <RestrictedWorkspaceView
              onOpenBilling={() => setBillingOpen(true)}
              onOpenSources={() => navigateTo("sources")}
            />
          ) : activeSection === "pulse" &&
            pulseProjection === "acquisition" ? (
            <AcquisitionAtlas
              authenticated={Boolean(session)}
              demo={initialSnapshot.mode === "demo"}
              defaultWindowDays={analyticsWindowDays(
                initialSnapshot.app.period,
              )}
            />
          ) : activeSection === "pulse" &&
            initialSnapshot.mode === "empty" ? (
            <EmptyWorkspaceView
              snapshot={workspaceSnapshot}
              onOpenSources={(provider) => {
                if (provider) {
                  openSourceSetup(provider);
                  return;
                }
                navigateTo("sources");
              }}
              onOpenAcquisitionAtlas={openAcquisitionAtlas}
              onOpenMethodology={() => setHelpOpen(true)}
            />
          ) : activeSection === "pulse" ? (
            <PulseView
              snapshot={initialSnapshot}
              selectedInsightId={selectedInsightId}
              onSelectInsight={selectInsight}
              onOpenInsight={openInsight}
              replayIndex={replayIndex}
              onReplayIndexChange={setReplayIndex}
              sources={sourceConnections}
            />
          ) : activeSection === "diagnose" &&
            initialSnapshot.insights.length === 0 ? (
            <NoEvidenceView
              section="Diagnose"
              hasObservedMetrics={initialSnapshot.mode === "live"}
              onOpenSources={() => navigateTo("sources")}
            />
          ) : activeSection === "diagnose" ? (
            <DiagnoseView
              snapshot={initialSnapshot}
              selectedInsight={selectedInsight}
              onSelectInsight={selectInsight}
              onCreateExperiment={() => createDraftFromInsight(selectedInsight)}
            />
          ) : activeSection === "lab" &&
            initialSnapshot.insights.length === 0 ? (
            <NoEvidenceView
              section="Lab"
              hasObservedMetrics={initialSnapshot.mode === "live"}
              onOpenSources={() => navigateTo("sources")}
            />
          ) : activeSection === "lab" ? (
            <LabView
              selectedInsight={selectedInsight}
              experiments={experiments}
              latestCreatedExperimentId={latestCreatedExperimentId}
              onCreateDraft={() => createDraftFromInsight(selectedInsight)}
            />
          ) : activeSection === "sources" ? (
            <SourcesView
              snapshot={initialSnapshot}
              authenticated={Boolean(session)}
              entitled={initialSnapshot.mode !== "restricted"}
              sources={sourceConnections}
              onSourcesChange={setSourceConnections}
              onOpenGrowthRiver={() => {
                window.location.assign("/");
              }}
              onOpenAcquisitionAtlas={() => {
                openAcquisitionAtlas();
              }}
            />
          ) : null}
        </main>
      </div>

      {session && (
        <PlanCheckout
          workspaceId={session.workspaceId}
          customerEmail={session.email}
          open={billingOpen}
          onOpenChange={setBillingOpen}
          hideTrigger
        />
      )}

      {settingsOpen && (
        <ModalDialog
          labelledBy="settings-title"
          onClose={() => setSettingsOpen(false)}
          dialogClassName="settings-dialog account-dialog"
          closeLabel="Close settings"
        >
          <span className="eyebrow">Your account</span>
          <h2 id="settings-title">Profile & billing</h2>
          {session ? (
            <>
              <div className="account-identity-card">
                <div className="account-identity-main">
                  <ProfileAvatar avatarKey={avatarKey} className="account-avatar" />
                  <div className="account-identity-info">
                    <span>Signed in as</span>
                    <strong>{session.email}</strong>
                    <p>{accountPlanLabel}</p>
                  </div>
                </div>
                <form action={logout}>
                  <button type="submit" className="account-signout-btn">
                    <LogOut size={14} />
                    <span>Sign out</span>
                  </button>
                </form>
              </div>

              <section className="account-section" aria-labelledby="avatar-title">
                <div className="account-section-heading">
                  <div>
                    <strong id="avatar-title">Choose your trail mark</strong>
                    <p>A small illustrated profile — no photo upload needed.</p>
                  </div>
                  <span
                    className={`avatar-save-state avatar-save-${avatarState}`}
                    role="status"
                  >
                    {avatarState === "saving"
                      ? "Saving…"
                      : avatarState === "saved"
                        ? "Saved"
                        : avatarState === "error"
                          ? "Try again"
                          : ""}
                  </span>
                </div>
                <div className="avatar-picker">
                  {AVATAR_KEYS.map((key) => (
                    <button
                      type="button"
                      className={avatarKey === key ? "selected" : ""}
                      key={key}
                      onClick={() => saveAvatar(key)}
                      aria-label={`Use ${key} avatar`}
                      aria-pressed={avatarKey === key}
                      disabled={avatarState === "saving"}
                    >
                      <ProfileAvatar avatarKey={key} />
                      {avatarKey === key && (
                        <CheckCircle2 size={16} aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              </section>

              <AccountSecurity />

              <div className="account-plan-card">
                <span className="account-plan-icon">
                  <Sparkles size={20} />
                </span>
                <div className="account-plan-details">
                  <div className="account-plan-header">
                    <span className="account-plan-eyebrow">Subscription</span>
                    <span className="account-plan-badge">{accountPlanLabel}</span>
                  </div>
                  <p className="account-plan-desc">
                    {activeSubscription
                      ? "Update payment details, invoices or cancellation in Paddle’s secure customer portal."
                      : "Start Pro when you are ready. No card is required during the free trial."}
                  </p>
                </div>
                {activeSubscription ? (
                  <a
                    href="https://customer-portal.paddle.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="account-plan-cta"
                  >
                    <span>Manage billing</span>
                    <ExternalLink size={14} />
                  </a>
                ) : (
                  <button
                    type="button"
                    className="account-plan-cta"
                    onClick={() => {
                      setSettingsOpen(false);
                      setBillingOpen(true);
                    }}
                  >
                    <span>Choose plan</span>
                    <ChevronRight size={14} className="account-cta-arrow" />
                  </button>
                )}
              </div>

              <div className="settings-security-note">
                <ShieldCheck size={18} />
                <p>
                  Sources are read-only. Revoking a source deletes its encrypted
                  credentials immediately.
                </p>
              </div>
              <div className="danger-zone">
                <div>
                  <strong>Delete account</strong>
                  <p>
                    Permanently remove the workspace, imported history,
                    experiments and credentials.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={deleteAccount}
                  disabled={deletingAccount}
                  className="danger-delete-btn"
                >
                  <Trash2 size={15} />
                  <span>{deletingAccount ? "Deleting…" : "Delete account"}</span>
                </button>
              </div>
            </>
          ) : sessionUnavailable ? (
            <div className="settings-demo-note">
              <p>
                Account details are temporarily unavailable. No demo data has
                replaced this private workspace.
              </p>
              <button type="button" onClick={retryWorkspace}>
                Retry loading
              </button>
              <form action={logout}>
                <button type="submit">Sign out locally</button>
              </form>
            </div>
          ) : (
            <div className="settings-demo-note">
              <p>
                Sign in to manage sources, billing and account deletion.
              </p>
              <Link href="/login">Start a private workspace</Link>
            </div>
          )}
          {accountError && (
            <p className="settings-error" role="alert">
              {accountError}
            </p>
          )}
          <div className="settings-legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/refunds">Refunds</Link>
          </div>
        </ModalDialog>
      )}

      {helpOpen && (
        <ModalDialog
          labelledBy="help-title"
          onClose={() => setHelpOpen(false)}
          dialogClassName="settings-dialog help-dialog"
          closeLabel="Close help"
        >
          <span className="eyebrow">Getting started</span>
          <h2 id="help-title">From raw data to the next experiment</h2>
          <ol className="help-steps">
            <li>
              <strong>Connect one source</strong>
              <span>Start in Sources with the system you trust most.</span>
            </li>
            <li>
              <strong>Open the first bottleneck</strong>
              <span>Pulse highlights the earliest evidence-backed loss.</span>
            </li>
            <li>
              <strong>Create a draft in Lab</strong>
              <span>
                Keep the hypothesis, primary metric and guardrail together.
              </span>
            </li>
          </ol>
          <div className="settings-legal">
            <Link href="/guides/ios-subscription-growth">Growth guide</Link>
            <Link href="/blog">Field notes</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
