"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

import { AuthModal } from "@/components/auth-modal";
import { UpgradeModal } from "@/components/upgrade-modal";
import { WelcomeProModal, type WelcomeProStatus } from "@/components/welcome-pro-modal";
import {
  anonymousAccount,
  fetchAccountState,
  signOutRequest,
  type AccountState,
} from "@/lib/account";
import {
  accountsAreLive,
  type AccessRole,
  type AuthIntent,
  resolveAccessRole,
} from "@/lib/access";
import { proEnabled } from "@/lib/flags";
import { trackAppEvent } from "@/lib/analytics-client";
import {
  clearLocalWorkspaceData,
  explorerHasData,
  explorerLocalJson,
  pushSyncBlob,
  reconcileSyncBlob,
  trackerHasData,
  trackerLocalJson,
} from "@/lib/sync-engine";
import { SYNC_CHANGE_EVENT, type SyncBlobKey } from "@/lib/sync-client";
import {
  isUpgradeReason,
  savePendingUpgrade,
  takePendingUpgrade,
  type BillingCycle,
  type UpgradeReason,
} from "@/lib/upgrade";

export type SyncState = "off" | "syncing" | "synced" | "error";

export type { AuthIntent, AccessRole, UpgradeReason };

export interface AccountContextValue {
  account: AccountState;
  loading: boolean;
  signedIn: boolean;
  isPro: boolean;
  /** True when sign-in is a real product surface (flag on or backend configured). */
  accountsLive: boolean;
  role: AccessRole;
  /** Cloud sync availability and status (Pro only). */
  syncState: SyncState;
  /** Bumped whenever a remote pull rewrote local data. */
  syncVersion: number;
  refresh: () => Promise<void>;
  openAuth: (intent?: AuthIntent) => void;
  /**
   * If the visitor may proceed, returns true. If a free account is required
   * and they are a guest, opens sign-in and returns false.
   */
  requireAccount: (intent?: AuthIntent) => boolean;
  /**
   * Opens the upgrade dialog. `reason` names the limit the visitor met, so the
   * dialog leads with it; safe to pass straight to `onClick` (events are ignored).
   */
  openUpgrade: (reason?: UpgradeReason) => void;
  /** Opens the upgrade dialog with monthly or yearly billing preselected. */
  openUpgradeWith: (cycle: BillingCycle, reason?: UpgradeReason) => void;
  /** True while the upgrade or post-checkout welcome dialog is showing. */
  upgradeFlowActive: boolean;
  signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

export function useAccount(): AccountContextValue {
  const value = useContext(AccountContext);
  if (!value) {
    throw new Error("useAccount must be used within an AccountProvider");
  }
  return value;
}

function cleanUrlParams(...names: string[]) {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  for (const name of names) {
    if (params.has(name)) {
      params.delete(name);
      changed = true;
    }
  }
  if (!changed) return;
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountState>(anonymousAccount());
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<AuthIntent>("default");
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeCycle, setUpgradeCycle] = useState<BillingCycle>("yearly");
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("default");
  const [welcomeStatus, setWelcomeStatus] = useState<WelcomeProStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("off");
  const [syncVersion, setSyncVersion] = useState(0);
  const syncTimersRef = useRef<Partial<Record<SyncBlobKey, number>>>({});

  const refresh = useCallback(async () => {
    const state = await fetchAccountState();
    setAccount(state);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const syncAvailable = account.user !== null && account.plan === "pro";

  const runSyncPass = useCallback(async () => {
    if (!syncAvailable) return;
    setSyncState("syncing");
    const storage = window.localStorage;
    const tracker = await reconcileSyncBlob(
      storage,
      "tracker",
      trackerHasData(storage),
      trackerHasData(storage) ? trackerLocalJson(storage) : null,
    );
    const explorer = await reconcileSyncBlob(
      storage,
      "explorer",
      explorerHasData(storage),
      explorerHasData(storage) ? explorerLocalJson(storage) : null,
    );
    if (tracker.pulled || explorer.pulled) {
      setSyncVersion((previous) => previous + 1);
    }
    setSyncState(tracker.ok || explorer.ok ? "synced" : "error");
  }, [syncAvailable]);

  // Reconcile cloud sync whenever a signed-in Pro account becomes known.
  useEffect(() => {
    if (!syncAvailable) {
      let cancelled = false;
      void (async () => {
        await Promise.resolve();
        if (cancelled) return;
        setSyncState("off");
      })();
      return () => {
        cancelled = true;
      };
    }
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await runSyncPass();
    })();
    return () => {
      cancelled = true;
    };
  }, [syncAvailable, runSyncPass]);

  // Push local changes (debounced) while Pro sync is active.
  useEffect(() => {
    if (!syncAvailable) return;
    const onSyncChange = (event: Event) => {
      const blobKey = (event as CustomEvent<{ blobKey?: SyncBlobKey }>).detail?.blobKey;
      if (!blobKey) return;
      const storage = window.localStorage;
      const existing = syncTimersRef.current[blobKey];
      if (existing) window.clearTimeout(existing);
      syncTimersRef.current[blobKey] = window.setTimeout(() => {
        const hasData = blobKey === "tracker" ? trackerHasData(storage) : explorerHasData(storage);
        if (!hasData) return;
        const json = blobKey === "tracker" ? trackerLocalJson(storage) : explorerLocalJson(storage);
        void (async () => {
          const result = await pushSyncBlob(storage, blobKey, json);
          if (result && !result.applied) {
            // Another device pushed first; adopt the newer remote state.
            const pulled = await reconcileSyncBlob(
              storage,
              blobKey,
              blobKey === "tracker" ? trackerHasData(storage) : explorerHasData(storage),
              json,
            );
            if (pulled.pulled) setSyncVersion((previous) => previous + 1);
          }
          setSyncState(result ? "synced" : "error");
        })();
      }, 1500);
    };
    window.addEventListener(SYNC_CHANGE_EVENT, onSyncChange);
    return () => {
      window.removeEventListener(SYNC_CHANGE_EVENT, onSyncChange);
      for (const timer of Object.values(syncTimersRef.current)) {
        if (timer) window.clearTimeout(timer);
      }
      syncTimersRef.current = {};
    };
  }, [syncAvailable]);

  // React to auth/checkout redirects (?auth=ok, ?checkout=success, …).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    // The Paddle webhook can arrive a beat after the checkout redirect lands.
    // Poll /api/me so the welcome dialog and plan chip flip to Pro without a
    // reload; after ~40 seconds the dialog says activation is delayed. This
    // effect runs once per page load, so account updates never cancel it.
    const waitForPro = async () => {
      const delays = [1200, 1600, 2400, 3200, 4800, 6400, 8000, 10000];
      for (let attempt = 0; attempt <= delays.length && !cancelled; attempt += 1) {
        const state = await fetchAccountState();
        if (cancelled) return;
        setAccount(state);
        setLoading(false);
        if (state.user && state.plan === "pro") {
          setWelcomeStatus((current) => (current ? "active" : current));
          return;
        }
        if (attempt === delays.length) break;
        await new Promise((resolve) => window.setTimeout(resolve, delays[attempt]));
      }
      if (!cancelled) setWelcomeStatus((current) => (current ? "delayed" : current));
    };

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const params = new URLSearchParams(window.location.search);
      const auth = params.get("auth");
      const checkout = params.get("checkout");

      if (checkout === "success") {
        trackAppEvent("checkout_completed", null, { onceEver: "default" });
        setWelcomeStatus("activating");
        cleanUrlParams("checkout");
        void waitForPro();
      } else if (auth === "ok") {
        setNotice("Signed in.");
        cleanUrlParams("auth");
        void refresh();
      } else if (auth === "invalid") {
        setNotice("That sign-in link was invalid or expired. Request a new one.");
        cleanUrlParams("auth");
      } else if (auth === "unavailable") {
        setNotice("Accounts are not configured on this deployment yet.");
        cleanUrlParams("auth");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  /**
   * Sign out and remove account-scoped workspace data from this device.
   * Pro data is flushed to the cloud first, so it returns on the next
   * sign-in; free-plan data exists only locally, so its removal is confirmed.
   */
  const signOut = useCallback(async () => {
    const wasPro = account.plan === "pro";
    const hadUser = account.user !== null;
    if (hadUser && !wasPro) {
      const ok = window.confirm(
        "Sign out and clear this browser's tracked apps, keywords, and history? " +
          "Free-plan data is not synced — it cannot be recovered after this.",
      );
      if (!ok) return;
    }

    if (hadUser && wasPro) {
      // Flush pending local changes so nothing lives only on this device.
      const storage = window.localStorage;
      let flushOk = true;
      if (trackerHasData(storage)) {
        flushOk = (await pushSyncBlob(storage, "tracker", trackerLocalJson(storage))) !== null && flushOk;
      }
      if (explorerHasData(storage)) {
        flushOk = (await pushSyncBlob(storage, "explorer", explorerLocalJson(storage))) !== null && flushOk;
      }
      if (!flushOk) {
        // Never destroy the only copy: sign out but keep this device's data.
        await signOutRequest();
        setNotice(
          "Signed out. Cloud sync was unreachable, so this browser's data was kept — clear it from My Apps if others use this device.",
        );
        setSyncVersion((previous) => previous + 1);
        await refresh();
        return;
      }
    }

    clearLocalWorkspaceData(window.localStorage);
    await signOutRequest();
    setNotice(
      hadUser
        ? wasPro
          ? "Signed out. Your synced data was cleared from this device — it will be restored when you sign back in."
          : "Signed out. Local tracking data was cleared from this device."
        : "Signed out.",
    );
    // Force every consumer to reload from the (now empty) local storage.
    setSyncVersion((previous) => previous + 1);
    await refresh();
  }, [account.plan, account.user, refresh]);

  const signedIn = account.user !== null;
  const isPro = account.plan === "pro";
  const live = accountsAreLive(proEnabled(), account.configured);
  const role = resolveAccessRole({ signedIn, isPro });

  const showUpgrade = useCallback(
    (cycle: BillingCycle, rawReason: unknown) => {
      const reason: UpgradeReason = isUpgradeReason(rawReason) ? rawReason : "default";
      if (isPro) {
        setNotice("You’re already on Pro — every limit is lifted.");
        return;
      }
      trackAppEvent("upgrade_opened", { cycle, reason }, { oncePerDay: reason });
      setUpgradeCycle(cycle);
      setUpgradeReason(reason);
      setUpgradeOpen(true);
    },
    [isPro],
  );

  // A guest who chose a plan signed in first: reopen the dialog where they
  // left it (Google redirects and magic links both land back here).
  useEffect(() => {
    if (loading || !signedIn) return;
    const pending = takePendingUpgrade(window.localStorage);
    if (!pending || isPro) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) showUpgrade(pending.cycle, pending.reason);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, signedIn, isPro, showUpgrade]);

  const openAuth = useCallback((intent: AuthIntent = "default") => {
    trackAppEvent("signup_intent_shown", { intent }, { oncePerDay: intent });
    setAuthIntent(intent);
    setAuthOpen(true);
  }, []);

  // One row per browser once a sign-in actually completes (per visitor, ever).
  const authCompletedRef = useRef(false);
  useEffect(() => {
    if (!signedIn || authCompletedRef.current) return;
    authCompletedRef.current = true;
    trackAppEvent("auth_completed", null, { onceEver: "default" });
  }, [signedIn]);

  const requireAccount = useCallback(
    (intent: AuthIntent = "default") => {
      if (signedIn || !live) return true;
      if (loading) return false;
      openAuth(intent);
      return false;
    },
    [signedIn, live, loading, openAuth],
  );

  const value = useMemo<AccountContextValue>(
    () => ({
      account,
      loading,
      signedIn,
      isPro,
      accountsLive: live,
      role,
      syncState,
      syncVersion,
      refresh,
      openAuth,
      requireAccount,
      openUpgrade: (reason?: UpgradeReason) => showUpgrade("yearly", reason),
      openUpgradeWith: (cycle: BillingCycle, reason?: UpgradeReason) => showUpgrade(cycle, reason),
      upgradeFlowActive: upgradeOpen || welcomeStatus !== null,
      signOut,
    }),
    [
      account,
      loading,
      signedIn,
      isPro,
      live,
      role,
      refresh,
      openAuth,
      requireAccount,
      showUpgrade,
      upgradeOpen,
      welcomeStatus,
      signOut,
      syncState,
      syncVersion,
    ],
  );

  return (
    <AccountContext.Provider value={value}>
      {children}

      {notice && (
        <div className="account-toast" role="status">
          <span>{notice}</span>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={() => setNotice(null)}
            aria-label="Dismiss notification"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      <AuthModal
        open={authOpen}
        intent={authIntent}
        onClose={() => {
          setAuthOpen(false);
          setAuthIntent("default");
        }}
        onUpgradeInstead={() => {
          setAuthOpen(false);
          setAuthIntent("default");
          showUpgrade("yearly", "checks");
        }}
      />
      <UpgradeModal
        open={upgradeOpen}
        initialCycle={upgradeCycle}
        reason={upgradeReason}
        user={account.user}
        onClose={() => setUpgradeOpen(false)}
        onRequireAuth={(pending) => {
          savePendingUpgrade(window.localStorage, pending);
          setUpgradeOpen(false);
          openAuth("upgrade");
        }}
      />
      <WelcomeProModal
        open={welcomeStatus !== null}
        status={welcomeStatus ?? "activating"}
        email={account.user?.email ?? null}
        onClose={() => setWelcomeStatus(null)}
      />
    </AccountContext.Provider>
  );
}
