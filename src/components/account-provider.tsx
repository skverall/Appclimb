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
  explorerHasData,
  explorerLocalJson,
  pushSyncBlob,
  reconcileSyncBlob,
  trackerHasData,
  trackerLocalJson,
} from "@/lib/sync-engine";
import { SYNC_CHANGE_EVENT, type SyncBlobKey } from "@/lib/sync-client";

export type SyncState = "off" | "syncing" | "synced" | "error";

export interface AccountContextValue {
  account: AccountState;
  loading: boolean;
  isPro: boolean;
  /** Cloud sync availability and status (Pro only). */
  syncState: SyncState;
  /** Bumped whenever a remote pull rewrote local data. */
  syncVersion: number;
  refresh: () => Promise<void>;
  openAuth: () => void;
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

  const signOut = useCallback(async () => {
    await signOutRequest();
    setNotice("Signed out.");
    await refresh();
  }, [refresh]);

  const value = useMemo<AccountContextValue>(
    () => ({
      account,
      loading,
      isPro: account.plan === "pro",
      syncState,
      syncVersion,
      refresh,
      openAuth: () => setAuthOpen(true),
      openUpgrade: () => setUpgradeOpen(true),
      signOut,
    }),
    [account, loading, refresh, signOut, syncState, syncVersion],
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

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <UpgradeModal
        open={upgradeOpen}
        user={account.user}
        onClose={() => setUpgradeOpen(false)}
        onRequireAuth={() => {
          setUpgradeOpen(false);
          setAuthOpen(true);
        }}
      />
    </AccountContext.Provider>
  );
}
