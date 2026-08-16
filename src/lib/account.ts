/**
 * Client-side account helpers (ADR 0004). Mirrors the `GET /api/me` response
 * shape and wraps the auth/portal endpoints. Kept free of server-only imports
 * so it can be used from components.
 */
import { limitsForPlan, type PlanId, type PlanLimits } from "./plan";

export interface AccountUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AccountSubscription {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export interface AccountState {
  configured: boolean;
  user: AccountUser | null;
  plan: PlanId;
  limits: PlanLimits;
  subscription: AccountSubscription | null;
}

export function anonymousAccount(): AccountState {
  return {
    configured: false,
    user: null,
    plan: "free",
    limits: limitsForPlan("free"),
    subscription: null,
  };
}

export async function fetchAccountState(): Promise<AccountState> {
  try {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (!res.ok) return anonymousAccount();
    const data = (await res.json()) as Partial<AccountState>;
    const plan: PlanId = data.plan === "pro" ? "pro" : "free";
    return {
      configured: data.configured === true,
      user: data.user ?? null,
      plan,
      limits: limitsForPlan(plan),
      subscription: data.subscription ?? null,
    };
  } catch {
    return anonymousAccount();
  }
}

export interface MagicLinkResult {
  ok: boolean;
  configured: boolean;
  error?: string;
}

export async function requestMagicLink(email: string): Promise<MagicLinkResult> {
  try {
    const res = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; configured?: boolean };
    if (!res.ok) {
      return {
        ok: false,
        configured: data.configured !== false,
        error: data.error ?? "Could not send the sign-in email.",
      };
    }
    return { ok: true, configured: true };
  } catch {
    return { ok: false, configured: true, error: "Network error. Try again." };
  }
}

export async function signOutRequest(): Promise<void> {
  try {
    await fetch("/api/auth/signout", { method: "POST" });
  } catch {
    // Best effort; the cookie is cleared server-side regardless.
  }
}

export interface PortalLinks {
  updatePaymentMethod: string | null;
  cancel: string | null;
}

export async function fetchPortalLinks(): Promise<PortalLinks | null> {
  try {
    const res = await fetch("/api/billing/portal", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as PortalLinks;
  } catch {
    return null;
  }
}
