"use client";

import { useEffect, useRef, useState } from "react";
import { CreditCard, LogIn, LogOut, Sparkles } from "lucide-react";

import { useAccount } from "@/components/account-provider";
import { fetchPortalLinks } from "@/lib/account";

/** Compact initial for the signed-in avatar chip. */
function initialOf(email: string, name: string | null): string {
  const source = (name ?? email).trim();
  return source.charAt(0).toUpperCase() || "?";
}

export function AccountMenu() {
  const { account, loading, isPro, openAuth, openUpgrade, signOut } = useAccount();
  const [open, setOpen] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading) {
    return <span className="account-menu-placeholder" aria-hidden="true" />;
  }

  if (!account.user) {
    return (
      <div className="account-menu-anonymous">
        <button type="button" className="tracker-button-secondary" onClick={openAuth}>
          <LogIn size={15} aria-hidden="true" /> Sign in
        </button>
        <button type="button" className="tracker-button-primary" onClick={openUpgrade}>
          <Sparkles size={15} aria-hidden="true" /> Go Pro
        </button>
      </div>
    );
  }

  const manageSubscription = async () => {
    setManageBusy(true);
    const links = await fetchPortalLinks();
    setManageBusy(false);
    const url = links?.updatePaymentMethod ?? links?.cancel;
    if (url) {
      window.open(url, "_blank", "noopener");
    }
    setOpen(false);
  };

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className="account-menu-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="account-menu-avatar" aria-hidden="true">
          {initialOf(account.user.email, account.user.name)}
        </span>
        <span className={`account-plan-chip ${isPro ? "is-pro" : "is-free"}`}>
          {isPro ? "Pro" : "Free"}
        </span>
      </button>

      {open && (
        <div className="account-menu-dropdown" role="menu">
          <div className="account-menu-identity">
            <strong>{account.user.name ?? "AppClimb user"}</strong>
            <span>{account.user.email}</span>
            <span className={`account-plan-chip ${isPro ? "is-pro" : "is-free"}`}>
              {isPro ? "Pro plan" : "Free plan"}
            </span>
          </div>

          {!isPro && (
            <button
              type="button"
              role="menuitem"
              className="tracker-button-primary account-menu-action"
              onClick={() => {
                setOpen(false);
                openUpgrade();
              }}
            >
              <Sparkles size={15} aria-hidden="true" /> Upgrade to Pro
            </button>
          )}

          {isPro && (
            <button
              type="button"
              role="menuitem"
              className="tracker-button-secondary account-menu-action"
              onClick={() => void manageSubscription()}
              disabled={manageBusy}
            >
              <CreditCard size={15} aria-hidden="true" />
              {manageBusy ? "Loading…" : "Manage subscription"}
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className="account-menu-signout"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
