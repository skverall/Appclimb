"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
  ADMIN_OPTOUT_KEY,
  isLocalAdminOptedOut,
  setLocalAdminOptOut,
} from "@/lib/analytics-client";

export { ADMIN_OPTOUT_KEY, isLocalAdminOptedOut, setLocalAdminOptOut };

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

    let utmSource: string | null = null;
    if (typeof window !== "undefined" && window.location.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        utmSource = params.get("utm_source") || params.get("ref") || params.get("source") || null;
      } catch {
        // Ignore parsing errors
      }
    }

    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
      utmSource,
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
