"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  FlaskConical,
  Gauge,
  HelpCircle,
  LogOut,
  PlugZap,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";

import { logout } from "@/app/actions";
import { BrandMark } from "@/components/brand-mark";
import { PlanCheckout } from "@/components/plan-checkout";
import { PulseView } from "@/components/pulse-view";
import {
  DiagnoseView,
  LabView,
  SourcesView,
} from "@/components/workspace-views";
import type { DashboardSnapshot, Insight } from "@/lib/contracts";
import type { BackendIdentity } from "@/lib/backend";

type Section = "pulse" | "diagnose" | "lab" | "sources";

const NAV_ITEMS: {
  id: Section;
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
  session,
  trialDaysRemaining,
}: {
  initialSnapshot: DashboardSnapshot;
  session?: BackendIdentity;
  trialDaysRemaining?: number;
}) {
  const [activeSection, setActiveSection] = useState<Section>("pulse");
  const [selectedInsightId, setSelectedInsightId] = useState(
    initialSnapshot.insights[0]?.id ?? "",
  );
  const [replayIndex, setReplayIndex] = useState(initialSnapshot.events.length);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountError, setAccountError] = useState("");

  const selectedInsight = useMemo<Insight | undefined>(
    () =>
      initialSnapshot.insights.find(
        (insight) => insight.id === selectedInsightId,
      ),
    [initialSnapshot.insights, selectedInsightId],
  );

  const openInsight = (insightId: string) => {
    setSelectedInsightId(insightId);
    setActiveSection("diagnose");
  };
  const trialDays = trialDaysRemaining ?? 12;
  const profileName = session
    ? session.email.split("@")[0]
    : "Demo";
  const profileInitials = profileName.slice(0, 2).toUpperCase();
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <BrandMark />
          <div className="workspace-switcher">
            <div className="app-avatar" aria-hidden="true">
              <span>CD</span>
            </div>
            <div>
              <strong>{initialSnapshot.app.name}</strong>
              <span>{initialSnapshot.app.platform}</span>
            </div>
            <span className="workspace-chevron">⌄</span>
          </div>

          <nav className="main-nav" aria-label="Primary navigation">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                className={activeSection === id ? "nav-item active" : "nav-item"}
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                aria-current={activeSection === id ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{label}</span>
                {id === "sources" && <span className="nav-status-dot" />}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="trial-card">
            <div>
              <span className="eyebrow">
                {session ? "Free trial" : "Demo workspace"}
              </span>
              <strong>
                {session ? `${trialDays} days left` : "Explore River Atlas"}
              </strong>
            </div>
            <div className="trial-track">
              <span />
            </div>
            <PlanCheckout
              workspaceId={session?.workspaceId}
              customerEmail={session?.email}
            />
          </div>
          <button
            className="footer-link"
            type="button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={17} /> Settings
          </button>
          {session ? (
            <form action={logout}>
              <button className="profile-row" type="submit">
                <span className="profile-avatar">{profileInitials}</span>
                <span>
                  <strong>{profileName}</strong>
                  <small>Solo workspace</small>
                </span>
                <LogOut size={16} />
              </button>
            </form>
          ) : (
            <Link className="profile-row" href="/login">
              <span className="profile-avatar">DE</span>
              <span>
                <strong>Start your trial</strong>
                <small>No card required</small>
              </span>
              <LogOut size={16} />
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
            <button
              className="icon-button"
              type="button"
              aria-label="Help"
              onClick={() => setHelpOpen(true)}
            >
              <HelpCircle size={19} />
            </button>
            <div className="readonly-pill">
              <span />
              Read-only
            </div>
          </div>
        </header>

        <main className="workspace-content">
          {activeSection === "pulse" && (
            <PulseView
              snapshot={initialSnapshot}
              selectedInsightId={selectedInsightId}
              onSelectInsight={setSelectedInsightId}
              onOpenInsight={openInsight}
              replayIndex={replayIndex}
              onReplayIndexChange={setReplayIndex}
            />
          )}
          {activeSection === "diagnose" && (
            <DiagnoseView
              snapshot={initialSnapshot}
              selectedInsight={selectedInsight}
              onSelectInsight={setSelectedInsightId}
              onCreateExperiment={() => setActiveSection("lab")}
            />
          )}
          {activeSection === "lab" && (
            <LabView
              snapshot={initialSnapshot}
              selectedInsight={selectedInsight}
            />
          )}
          {activeSection === "sources" && (
            <SourcesView
              snapshot={initialSnapshot}
              authenticated={Boolean(session)}
            />
          )}
        </main>
      </div>

      {settingsOpen && (
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSettingsOpen(false);
          }}
        >
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <button
              className="settings-close"
              type="button"
              aria-label="Close settings"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={18} />
            </button>
            <span className="eyebrow">Account settings</span>
            <h2 id="settings-title">Workspace control</h2>
            <div className="settings-security-note">
              <ShieldCheck size={18} />
              <p>
                Sources are read-only. Revoking a source deletes its encrypted
                credentials immediately.
              </p>
            </div>
            {session ? (
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
            ) : (
              <div className="settings-demo-note">
                Sign in to manage sources, billing and account deletion.
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
          </section>
        </div>
      )}

      {helpOpen && (
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setHelpOpen(false);
          }}
        >
          <section
            className="settings-dialog help-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <button
              className="settings-close"
              type="button"
              aria-label="Close help"
              onClick={() => setHelpOpen(false)}
            >
              <X size={18} />
            </button>
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
          </section>
        </div>
      )}
    </div>
  );
}
