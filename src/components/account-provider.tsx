"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

export interface AccountContextValue {
  account: AccountState;
  loading: boolean;
  isPro: boolean;
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
      refresh,
      openAuth: () => setAuthOpen(true),
      openUpgrade: () => setUpgradeOpen(true),
      signOut,
    }),
    [account, loading, refresh, signOut],
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
