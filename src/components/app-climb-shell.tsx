"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  CreditCard,
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
  Trash2,
} from "lucide-react";
import Link from "next/link";

import { logout } from "@/app/actions";
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
  SourcesView,
} from "@/components/workspace-views";
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

export function AppClimbShell({
  initialSnapshot,
  initialSection = "pulse",
  initialInsightId,
  session,
  privateSessionExpected = false,
  trialDaysRemaining,
}: {
  initialSnapshot: DashboardSnapshot;
  initialSection?: WorkspaceSection;
  initialInsightId?: string;
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
        : sourceConnections.some((source) => source.status === "needs-attention")
          ? "attention"
          : sourceConnections.some((source) => source.status === "connected")
            ? "connected"
            : "empty";
  const sourceNavLabel = {
    unavailable: "workspace unavailable",
    restricted: "imports paused",
    demo: "sample profiles",
    attention: "connection needs attention",
    connected: "source connected",
    empty: "no sources connected",
  }[sourceNavState];
  const trialProgress = Math.max(0, Math.min(100, (trialDays / 14) * 100));
  const profileName = session ? session.email.split("@")[0] : "Demo";
  const appInitials = initialSnapshot.app.name
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
        ? "No live data yet"
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <BrandMark />
          <div className="workspace-switcher">
            <div className="app-avatar" aria-hidden="true">
              <span>{appInitials}</span>
            </div>
            <div>
              <strong>{initialSnapshot.app.name}</strong>
              <span>Current app · {initialSnapshot.app.platform}</span>
            </div>
          </div>

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
          <div className="topbar-actions">
            <span
              className={`workspace-status workspace-status-${initialSnapshot.mode ?? "demo"}`}
            >
              {workspaceStatus}
            </span>
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
            <div className="readonly-pill">
              <span />
              Read-only
            </div>
          </div>
        </header>

        <main className="workspace-content">
          {initialSnapshot.mode === "unavailable" ? (
            <UnavailableWorkspaceView onRetry={retryWorkspace} />
          ) : initialSnapshot.mode === "restricted" &&
            activeSection !== "sources" ? (
            <RestrictedWorkspaceView
              onOpenBilling={() => setBillingOpen(true)}
              onOpenSources={() => navigateTo("sources")}
            />
          ) : activeSection === "pulse" &&
            initialSnapshot.mode === "empty" ? (
            <EmptyWorkspaceView
              snapshot={initialSnapshot}
              onOpenSources={() => navigateTo("sources")}
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
                <ProfileAvatar avatarKey={avatarKey} className="account-avatar" />
                <div>
                  <span>Signed in as</span>
                  <strong>{session.email}</strong>
                  <p>{accountPlanLabel}</p>
                </div>
                <form action={logout}>
                  <button type="submit">
                    <LogOut size={15} /> Sign out
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

              <div className="account-plan-card">
                <span className="account-plan-icon">
                  <CreditCard size={18} />
                </span>
                <div>
                  <span>Subscription</span>
                  <strong>{accountPlanLabel}</strong>
                  <p>
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
                  >
                    Manage billing <ExternalLink size={14} />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      setBillingOpen(true);
                    }}
                  >
                    Choose plan <ChevronRight size={14} />
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
                >
                  <Trash2 size={16} />
                  {deletingAccount ? "Deleting…" : "Delete account"}
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
            <Link href="/pricing">Pricing</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
