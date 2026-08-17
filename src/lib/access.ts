/**
 * Guest / free-account / Pro access model.
 *
 * Keyword Explorer is the no-login-wall lead feature. Tracking an app and
 * the ASO assistant require a free account whenever accounts are actually
 * live (the Pro UI flag is on, or GET /api/me reports configured:true).
 */

export type AuthIntent = "default" | "track" | "assistant" | "upgrade";

export type AccessRole = "guest" | "free" | "pro";

export function accountsAreLive(proFlag: boolean, configured: boolean): boolean {
  return proFlag || configured;
}

export function resolveAccessRole(input: {
  signedIn: boolean;
  isPro: boolean;
}): AccessRole {
  if (input.signedIn && input.isPro) return "pro";
  if (input.signedIn) return "free";
  return "guest";
}

/** Explorer is always open — that is the product, not a teaser. */
export function canUseExplorer(): boolean {
  return true;
}

export function canTrackApps(role: AccessRole, live: boolean): boolean {
  if (!live) return true;
  return role !== "guest";
}

export function canUseAssistant(role: AccessRole, live: boolean): boolean {
  if (!live) return true;
  return role !== "guest";
}

/** Server-side: once D1 is bound, unsigned chat is rejected. */
export function assistantRequiresSignIn(dbConfigured: boolean, isSignedIn: boolean): boolean {
  return dbConfigured && !isSignedIn;
}

export const AUTH_COPY: Record<AuthIntent, { title: string; subtitle: string }> = {
  default: {
    title: "Sign in to AppClimb",
    subtitle:
      "A free account unlocks app tracking and the ASO assistant. Keyword search works without one.",
  },
  track: {
    title: "Sign in to track an app",
    subtitle:
      "Free accounts can track 1 app and 25 keywords. Data stays in this browser until you go Pro.",
  },
  assistant: {
    title: "Sign in to use the assistant",
    subtitle:
      "The ASO assistant is part of a free account — 5 messages a day. Sign in so the limit follows you.",
  },
  upgrade: {
    title: "Sign in to upgrade",
    subtitle:
      "Create a free account first, then subscribe to Pro for unlimited checks and cloud sync.",
  },
};
