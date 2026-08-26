"use client";

import { LogIn, ShieldAlert } from "lucide-react";

import { useAccount } from "@/components/account-provider";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { isAdminEmail } from "@/lib/admin";

export function AdminPageClient() {
  const { account, signedIn, loading, openAuth } = useAccount();

  if (loading) {
    return (
      <div className="admin-loading-state">
        <span className="account-menu-placeholder" aria-hidden="true" />
        <span>Verifying admin authorization…</span>
      </div>
    );
  }

  const user = account.user;
  const isAuthorized = signedIn && user && isAdminEmail(user.email);

  if (!isAuthorized) {
    return (
      <div className="admin-gate-card">
        <div className="admin-gate-icon">
          <ShieldAlert size={28} aria-hidden="true" />
        </div>
        <h2>Admin Access Required</h2>
        <p>
          This dashboard is reserved for AppClimb administrators. Sign in with your
          authorized admin account to view live analytics.
        </p>
        <button
          type="button"
          className="tracker-button-primary"
          onClick={() => openAuth("default")}
        >
          <LogIn size={16} aria-hidden="true" />
          Sign in as Admin
        </button>
      </div>
    );
  }

  return <AdminDashboard />;
}
