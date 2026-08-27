/**
 * Client-side fire-and-forget product event tracking (signup funnel, ADR 0005).
 *
 * Same privacy model as pageviews: no emails, no IPs, the server derives a
 * daily-rotating anonymous visitor hash. Deduping happens here so a funnel
 * counts unique visitors rather than clicks.
 */

export const ADMIN_OPTOUT_KEY = "appclimb:admin:optout";

export function isLocalAdminOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ADMIN_OPTOUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setLocalAdminOptOut(optOut: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (optOut) {
      window.localStorage.setItem(ADMIN_OPTOUT_KEY, "1");
      document.cookie = "appclimb_admin_optout=1; path=/; max-age=31536000; SameSite=Lax";
    } else {
      window.localStorage.removeItem(ADMIN_OPTOUT_KEY);
      document.cookie = "appclimb_admin_optout=; path=/; max-age=0; SameSite=Lax";
    }
  } catch {
    // Ignore storage issues
  }
}

export interface AppEventMeta {
  [key: string]: string | number | boolean;
}

const EVT_PREFIX = "appclimb:evt:";

function dayKey(name: string, scope: string): string {
  return `${EVT_PREFIX}${name}:day:${scope}`;
}

function everKey(name: string, scope: string): string {
  return `${EVT_PREFIX}${name}:ever:${scope}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Day flags expire: they match only when written today. */
function readDayFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === today();
  } catch {
    return false;
  }
}

function readEverFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, today());
  } catch {
    // Storage unavailable — worst case the same visitor is recorded twice.
  }
}

/**
 * Send a product event. Never throws, never blocks the UI.
 *
 * `oncePerDay` and `onceEver` take a scope string (e.g. the auth intent) so
 * the same event name can still be recorded for distinct scopes.
 */
export function trackAppEvent(
  name: string,
  meta?: AppEventMeta | null,
  opts: { oncePerDay?: string; onceEver?: string } = {},
): void {
  if (typeof window === "undefined") return;
  if (isLocalAdminOptedOut()) return;
  if (opts.oncePerDay) {
    const key = dayKey(name, opts.oncePerDay);
    if (readDayFlag(key)) return;
    writeFlag(key);
  }
  if (opts.onceEver) {
    const key = everKey(name, opts.onceEver);
    if (readEverFlag(key)) return;
    writeFlag(key);
  }

  const payload = JSON.stringify({
    name,
    path: window.location.pathname,
    meta: meta ?? null,
    screenWidth: window.innerWidth,
  });

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/track", blob);
    } else {
      void fetch("/api/analytics/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    // Non-blocking, ignore failure.
  }
}
