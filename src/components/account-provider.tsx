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

export type SyncState = "off" | "syncing" | "synced" | "error";

export type { AuthIntent, AccessRole };

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
  openUpgrade: () => void;
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
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const params = new URLSearchParams(window.location.search);
      const auth = params.get("auth");
      const checkout = params.get("checkout");

      if (checkout === "success") {
        setNotice("Welcome to Pro! Your upgrade is being activated.");
        cleanUrlParams("checkout");
        void refresh();
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

  const openAuth = useCallback((intent: AuthIntent = "default") => {
    setAuthIntent(intent);
    setAuthOpen(true);
  }, []);

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
      openUpgrade: () => setUpgradeOpen(true),
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
      />
      <UpgradeModal
        open={upgradeOpen}
        user={account.user}
        onClose={() => setUpgradeOpen(false)}
        onRequireAuth={() => {
          setUpgradeOpen(false);
          openAuth("upgrade");
        }}
      />
    </AccountContext.Provider>
  );
}
