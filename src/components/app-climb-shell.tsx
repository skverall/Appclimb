"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  ExternalLink,
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
import { lookupAppStoreIcon } from "@/lib/itunes";
import {
  looksLikeWebDomain,
  preferredWebFaviconUrl,
} from "@/lib/web-favicon";
import { AccountSecurity } from "@/components/account-security";
import { BrandMark } from "@/components/brand-mark";
import { ModalDialog } from "@/components/modal-dialog";
import { PlanCheckout } from "@/components/plan-checkout";
import {
  AVATAR_KEYS,
  type AvatarKey,
  ProfileAvatar,
} from "@/components/profile-avatar";
import { WebSiteIcon } from "@/components/web-site-icon";
import { SourcesView } from "@/components/sources-view";
import {
  RestrictedWorkspaceView,
  UnavailableWorkspaceView,
} from "@/components/workspace-state";
import {
  GrowthCiWorkspace,
  type GrowthCiSnapshot,
} from "@/components/growth-ci/growth-ci-workspace";
import type {
  DashboardSnapshot,
  Insight,
  SourceConnection,
} from "@/lib/contracts";
import type { BackendIdentity } from "@/lib/backend";
import {
  createExperimentDraft,
  experimentApi,
  experimentIdForInsight,
  type InsightFeedbackAction,
  type PersistedExperiment,
  sendInsightFeedback,
} from "@/lib/experiments";
import {
  configureProductEvents,
  trackProductEvent,
} from "@/lib/product-events";
import "@/app/decision-lab.css";
import "@/components/growth-ci/growth-ci.css";
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
  { id: "growth", label: "Growth CI", icon: Gauge },
  { id: "sources", label: "Settings", icon: PlugZap },
];

/**
 * Local edits layered over a server-rendered value.
 *
 * The shell used to mirror `initialSnapshot` into state inside an effect, which
 * both tripped `react-hooks/set-state-in-effect` and rendered one stale frame
 * after a navigation. Instead the override carries the seed it was derived
 * from: when the server sends a different snapshot the override stops matching
 * and the fresh value wins during the same render, with no effect involved.
 */
function useSeededState<T>(
  seed: unknown,
  base: T,
): [T, (next: T | ((current: T) => T)) => void] {
  const [override, setOverride] = useState<{ seed: unknown; value: T } | null>(
    null,
  );
  const value = override && override.seed === seed ? override.value : base;
  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      setOverride((current) => {
        const currentValue =
          current && current.seed === seed ? current.value : base;
        return {
          seed,
          value:
            typeof next === "function"
              ? (next as (item: T) => T)(currentValue)
              : next,
        };
      });
    },
    [seed, base],
  );
  return [value, update];
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
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [customAppName, setCustomAppName] = useState(initialSnapshot.app.name);
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
  const [latestCreatedExperimentId, setLatestCreatedExperimentId] =
    useState("");
  const [pulseProjection, setPulseProjection] = useState<
    "growth" | "acquisition"
  >(initialPulseProjection);

  const [snapshot, setSnapshot] = useSeededState<DashboardSnapshot>(
    initialSnapshot,
    initialSnapshot,
  );
  const [sourceConnections, setSourceConnections] = useSeededState<
    SourceConnection[]
  >(snapshot, snapshot.sources);
  // Seeded on the app id, not the snapshot: a background growth-map refresh for
  // the same app must not wipe the experiments already loaded from
  // `/api/experiments`, but switching apps must.
  const [experiments, setExperiments] = useSeededState<PersistedExperiment[]>(
    snapshot.app.id,
    snapshot.experiments,
  );
  const [experimentBusy, setExperimentBusy] = useState(false);
  const [experimentError, setExperimentError] = useState("");
  const [feedbackState, setFeedbackState] = useState("");
  const [feedbackError, setFeedbackError] = useState("");

  const resolveAppIcon = useCallback((app: DashboardSnapshot["app"]) => {
    const isWeb = app.platform === "Web";
    const domain =
      app.bundleId ||
      (looksLikeWebDomain(app.name) ? app.name : "") ||
      (app.appStoreId?.startsWith("web:")
        ? app.appStoreId.slice(4)
        : "");
    if (isWeb && domain) {
      // Stored web icon URLs point at public favicon hosts the CSP blocks, so
      // the same-origin proxy always wins here.
      return preferredWebFaviconUrl(domain);
    }
    return app.iconUrl || "";
  }, []);

  const lookupAppStoreIconId =
    snapshot.app.appStoreId ||
    (snapshot.app as { apple_app_id?: string }).apple_app_id ||
    "";
  const derivedAppIcon = resolveAppIcon(snapshot.app);
  const [fetchedAppIcon, setFetchedAppIcon] = useSeededState(
    lookupAppStoreIconId,
    "",
  );
  const activeAppIcon = derivedAppIcon || fetchedAppIcon;

  useEffect(() => {
    if (
      derivedAppIcon ||
      !lookupAppStoreIconId ||
      lookupAppStoreIconId.startsWith("web:") ||
      !/^\d+$/u.test(lookupAppStoreIconId)
    ) {
      return;
    }
    let cancelled = false;
    lookupAppStoreIcon(lookupAppStoreIconId)
      .then((icon) => {
        if (icon && !cancelled) setFetchedAppIcon(icon);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [derivedAppIcon, lookupAppStoreIconId, setFetchedAppIcon]);

  const refreshSnapshot = useCallback(async () => {
    if (snapshot.mode === "demo") return;
    try {
      const url = new URL("/api/growth-map", window.location.origin);
      if (snapshot.app.id) url.searchParams.set("app", snapshot.app.id);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { data?: DashboardSnapshot };
      if (data.data) {
        setSnapshot(data.data);
      }
    } catch {
      // Ignore background refresh failure
    }
  }, [snapshot.mode, snapshot.app.id, setSnapshot]);

  const selectedInsight = useMemo<Insight | undefined>(
    () =>
      snapshot.insights.find(
        (insight) => insight.id === selectedInsightId,
      ),
    [snapshot.insights, selectedInsightId],
  );

  const updateWorkspaceUrl = useCallback(
    (
      section: WorkspaceSection,
      insightId: string,
      method: "pushState" | "replaceState" = "pushState",
    ) => {
      const url = new URL(window.location.href);
      if (section === "growth" || section === "pulse") {
        url.searchParams.delete("view");
      } else {
        url.searchParams.set("view", section);
      }
      url.searchParams.delete("insight");
      url.searchParams.delete("atlas");
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

  /**
   * A workspace backed by a real session is the only place an experiment can be
   * stored. The public demo and a signed-out visitor keep local drafts and the
   * Lab says so, rather than implying a row reached D1.
   */
  const experimentsPersist =
    Boolean(session) &&
    (snapshot.mode === "live" || snapshot.mode === "empty") &&
    Boolean(snapshot.app.id);

  useEffect(() => {
    configureProductEvents({ enabled: experimentsPersist });
  }, [experimentsPersist]);

  useEffect(() => {
    if (!experimentsPersist) return;
    let cancelled = false;
    experimentApi
      .list(snapshot.app.id)
      .then((rows) => {
        if (!cancelled) setExperiments(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setExperimentError(
            "Saved experiments could not be loaded. Reload to try again.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [experimentsPersist, snapshot.app.id, setExperiments]);

  const openInsight = (insightId: string) => {
    trackProductEvent("insight_opened", { insightId });
    navigateTo("diagnose", insightId);
  };

  const createDraftFromInsight = async (insight?: Insight) => {
    if (!insight || experimentBusy) return;
    setExperimentError("");
    const existing = experiments.find(
      (experiment) =>
        experiment.insightId === insight.id ||
        experiment.id === experimentIdForInsight(insight.id),
    );
    if (existing) {
      setLatestCreatedExperimentId(existing.id);
      navigateTo("lab", insight.id);
      return;
    }

    const draft = createExperimentDraft(snapshot, insight);
    if (!experimentsPersist) {
      setExperiments((current) => [draft, ...current]);
      setLatestCreatedExperimentId(draft.id);
      navigateTo("lab", insight.id);
      return;
    }

    setExperimentBusy(true);
    try {
      const saved = await experimentApi.create(snapshot.app.id, draft);
      setExperiments((current) => [
        saved,
        ...current.filter((item) => item.id !== saved.id),
      ]);
      setLatestCreatedExperimentId(saved.id);
      trackProductEvent("experiment_created", {
        insightId: insight.id,
        stageId: insight.stageId,
        experimentId: saved.id,
      });
      if (draft.actionProposalId) {
        await sendInsightFeedback(
          draft.actionProposalId,
          "convert_to_experiment",
          { experimentId: saved.id },
        ).catch(() => undefined);
      }
      navigateTo("lab", insight.id);
    } catch {
      setExperimentError(
        "The experiment could not be saved. Nothing was changed in a connected tool.",
      );
    } finally {
      setExperimentBusy(false);
    }
  };

  const updateExperiment = async (
    id: string,
    patch: Record<string, unknown>,
  ) => {
    if (!experimentsPersist) return;
    setExperimentBusy(true);
    setExperimentError("");
    try {
      const saved = await experimentApi.update(id, patch);
      setExperiments((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
    } catch {
      setExperimentError("The experiment could not be updated. Try again.");
    } finally {
      setExperimentBusy(false);
    }
  };

  const removeExperiment = async (id: string) => {
    if (!experimentsPersist) return;
    setExperimentBusy(true);
    setExperimentError("");
    try {
      await experimentApi.remove(id);
      setExperiments((current) => current.filter((item) => item.id !== id));
    } catch {
      setExperimentError("The experiment could not be deleted. Try again.");
    } finally {
      setExperimentBusy(false);
    }
  };

  const submitInsightFeedback = async (
    action: InsightFeedbackAction,
    reason: string,
  ) => {
    const proposal = snapshot.actionProposals.find(
      (item) => item.insightId === selectedInsight?.id,
    );
    setFeedbackState("");
    setFeedbackError("");
    if (!proposal) return;
    if (!experimentsPersist) {
      setFeedbackError(
        "Feedback is only recorded in a private workspace. Nothing was stored for this demo.",
      );
      return;
    }
    try {
      await sendInsightFeedback(proposal.id, action, { reason });
      trackProductEvent(
        action === "accept" || action === "convert_to_experiment"
          ? "recommendation_accepted"
          : "recommendation_dismissed",
        { proposalId: proposal.id, feedbackAction: action },
      );
      setFeedbackState("Recorded. This decision is stored with an audit event.");
      void refreshSnapshot();
    } catch {
      setFeedbackError("Feedback could not be saved. Try again.");
    }
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
  const displayedAppName =
    connectedAppleName?.trim() ||
    (customAppName !== "My iOS App" ? customAppName : "") ||
    initialSnapshot.app.name;

  const saveAppName = async (nextName: string): Promise<boolean> => {
    if (!nextName.trim()) return false;
    setCustomAppName(nextName.trim());
    try {
      const response = await fetch("/api/apps", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nextName.trim() }),
      });
      return response.ok;
    } catch {
      return false;
    }
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
              navigateTo("growth");
            }}
            aria-label="Open AppClimb Growth CI"
          >
            <BrandMark />
          </button>
          <button
            className="workspace-switcher"
            type="button"
            onClick={() => setAppModalOpen(true)}
            aria-label={`Manage ${displayedAppName}`}
          >
              {snapshot.app.platform === "Web" ? (
                <WebSiteIcon
                  className="app-avatar"
                  domain={
                    snapshot.app.bundleId ||
                    (snapshot.app.appStoreId?.startsWith("web:")
                      ? snapshot.app.appStoreId.slice(4)
                      : "") ||
                    snapshot.app.name
                  }
                  name={snapshot.app.name}
                  iconUrl={activeAppIcon || snapshot.app.iconUrl}
                  size={36}
                  rounded={10}
                  fallback="letter"
                />
              ) : (
                <div
                  className="app-avatar"
                  aria-hidden="true"
                  style={{
                    overflow: "hidden",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {activeAppIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeAppIcon}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span>{appInitials}</span>
                  )}
                </div>
              )}
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
          {initialSnapshot.mode === "unavailable" ? (
            <UnavailableWorkspaceView onRetry={retryWorkspace} />
          ) : initialSnapshot.mode === "restricted" &&
            activeSection !== "sources" ? (
            <RestrictedWorkspaceView
              onOpenBilling={() => setBillingOpen(true)}
              onOpenSources={() => navigateTo("sources")}
            />
          ) : activeSection === "growth" || activeSection === "pulse" ? (
            <GrowthCiHome
              appId={snapshot.app.id}
              demo={initialSnapshot.mode === "demo"}
              onOpenSettings={() => navigateTo("sources")}
            />
          ) : activeSection === "sources" ? (
            <SourcesView
              snapshot={snapshot}
              authenticated={Boolean(session)}
              entitled={snapshot.mode !== "restricted"}
              sources={sourceConnections}
              onSourcesChange={(newSources: SourceConnection[]) => {
                setSourceConnections(newSources);
                void refreshSnapshot();
              }}
              onRefreshSnapshot={refreshSnapshot}
              onOpenGrowthRiver={() => {
                navigateTo("growth");
                void refreshSnapshot();
              }}
              onOpenAcquisitionAtlas={() => {
                navigateTo("growth");
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

      {appModalOpen && (
        <AppInfoModal
          appName={displayedAppName}
          platform={initialSnapshot.app.platform}
          sourceConnections={sourceConnections}
          onSaveName={saveAppName}
          onOpenSource={openSourceSetup}
          onClose={() => setAppModalOpen(false)}
        />
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

function AppInfoModal({
  appName,
  platform,
  sourceConnections,
  onSaveName,
  onOpenSource,
  onClose,
}: {
  appName: string;
  platform: string;
  sourceConnections: SourceConnection[];
  onSaveName: (name: string) => Promise<boolean>;
  onOpenSource: (provider: SourceConnection["provider"]) => void;
  onClose: () => void;
}) {
  const [editingName, setEditingName] = useState(appName);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingName.trim() || saving) return;
    setSaving(true);
    setSaveMessage("");
    const success = await onSaveName(editingName.trim());
    setSaving(false);
    if (success) {
      setSaved(true);
      setSaveMessage("App name updated successfully.");
      window.setTimeout(() => setSaveMessage(""), 2200);
    } else {
      setSaved(false);
      setSaveMessage("Could not update app name. Try again.");
    }
  };

  return (
    <ModalDialog
      labelledBy="app-modal-title"
      onClose={onClose}
      dialogClassName="settings-dialog app-info-dialog"
      closeLabel="Close app settings"
    >
      <span className="eyebrow">App & Workspace Settings · {platform}</span>
      <h2 id="app-modal-title">{appName}</h2>

      <form onSubmit={handleSave} className="connection-form app-name-form" style={{ marginTop: "1rem" }}>
        <label>
          App Name
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <input
              type="text"
              value={editingName}
              onChange={(event) => setEditingName(event.target.value)}
              placeholder="e.g. Currency Converter"
              required
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="primary-action"
              style={{ width: "auto", padding: "0 1rem" }}
              disabled={saving || !editingName.trim()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </label>
        {saveMessage && (
          <p
            className={saved ? "connection-message success" : "connection-message error"}
            role={saved ? "status" : "alert"}
            style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}
          >
            {saveMessage}
          </p>
        )}
      </form>

      <div style={{ marginTop: "1.5rem" }}>
        <span className="eyebrow" style={{ marginBottom: "0.5rem", display: "block" }}>
          Connected Growth Sources
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {(["app-store-connect", "posthog", "revenuecat", "superwall"] as const).map((provider) => {
            const source = sourceConnections.find((item) => item.provider === provider);
            const providerLabel = {
              "app-store-connect": "App Store Connect",
              posthog: "PostHog",
              revenuecat: "RevenueCat",
              superwall: "Superwall",
            }[provider];
            const isConnected = source && source.status !== "not-connected";
            const isPending = source?.lastErrorCode === "apple_reports_pending";

            return (
              <div
                key={provider}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid var(--border, rgba(0,0,0,0.08))",
                  background: "var(--surface-subtle, rgba(0,0,0,0.02))",
                }}
              >
                <div>
                  <strong style={{ display: "block", fontSize: "0.9rem" }}>{providerLabel}</strong>
                  <small style={{ opacity: 0.75, fontSize: "0.8rem" }}>
                    {isPending
                      ? "Apple preparing reports"
                      : isConnected
                        ? source.accountLabel
                          ? `Connected · ${source.accountLabel}`
                          : "Connected"
                        : "Not connected"}
                  </small>
                </div>
                <button
                  type="button"
                  className="secondary-action"
                  style={{ width: "auto", padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}
                  onClick={() => {
                    onClose();
                    onOpenSource(provider);
                  }}
                >
                  Manage
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ModalDialog>
  );
}

function GrowthCiHome(props: {
  appId: string;
  demo: boolean;
  onOpenSettings: () => void;
}) {
  const [snapshot, setSnapshot] = useState<GrowthCiSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (props.demo || !props.appId) {
      setSnapshot(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/growth-ci?appId=${encodeURIComponent(props.appId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        data?: GrowthCiSnapshot;
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? `growth_ci_${response.status}`);
        setSnapshot(null);
        return;
      }
      setSnapshot(payload.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "growth_ci_unavailable");
    } finally {
      setLoading(false);
    }
  }, [props.appId, props.demo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (props.demo) {
    return (
      <div className="growth-ci-workspace">
        <section className="growth-ci-verdict growth-ci-verdict--bad">
          <div>
            <h2>Activation regressed after 2.4.1</h2>
            <p>42% → 31% · 214 vs 196 users · high confidence (synthetic demo)</p>
            <p className="growth-ci-subtle">
              Sign in and connect RevenueCat + PostHog to evaluate your real
              releases. Demo data is labeled and never used in private workspaces.
            </p>
          </div>
        </section>
        <section className="growth-ci-grid">
          <article className="growth-ci-card">
            <h3>Growth Task</h3>
            <p className="growth-ci-task-title">
              Restore first-value activation without harming trial starts
            </p>
            <p className="growth-ci-subtle">
              Status: available · agent-ready packet for Hermes / Codex / Grok /
              Claude
            </p>
          </article>
          <article className="growth-ci-card">
            <h3>Verification</h3>
            <p className="growth-ci-subtle">
              After 2.4.2 ships, AppClimb compares the fix cohort to the broken
              release and closes only from production evidence.
            </p>
          </article>
        </section>
      </div>
    );
  }

  return (
    <GrowthCiWorkspace
      snapshot={snapshot}
      loading={loading}
      error={error}
      onRefresh={() => void refresh()}
      onOpenSettings={props.onOpenSettings}
      onCopyTask={() => {
        if (!snapshot?.task?.packet) return;
        void navigator.clipboard.writeText(
          JSON.stringify(snapshot.task.packet, null, 2),
        );
      }}
      onDismissIncident={(incidentId) => {
        void (async () => {
          await fetch(`/api/growth-ci/incidents/${incidentId}/dismiss`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              appId: props.appId,
              reason: "dismissed_from_ui",
            }),
          });
          await refresh();
        })();
      }}
    />
  );
}

