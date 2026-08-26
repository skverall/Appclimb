"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

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

export function AnalyticsBeacon() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    // Don't track admin pages or internal routes
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;

    // Check if the current browser is opted out (e.g. founder testing / admin)
    if (isLocalAdminOptedOut()) return;

    // Avoid duplicate triggers for the exact same path in one cycle
    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
      screenWidth: window.innerWidth,
    });

    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/analytics/record", blob);
      } else {
        void fetch("/api/analytics/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      // Non-blocking, ignore failure
    }
  }, [pathname]);

  return null;
}
