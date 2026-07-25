export interface AppClimbAnalyticsAPI {
  track(
    kind: "conversion",
    options: {
      goal: string;
    },
  ): void;
}

declare global {
  interface Window {
    appclimbAnalytics?: AppClimbAnalyticsAPI;
  }
}

export function trackWebConversion(
  goal: string,
  oncePerSession = false,
): boolean {
  if (typeof window === "undefined" || !window.appclimbAnalytics) {
    return false;
  }

  const storageKey = `appclimb_conversion_${goal}`;
  if (oncePerSession) {
    try {
      if (window.sessionStorage.getItem(storageKey)) return true;
    } catch {
      // Tracking still works when storage is unavailable.
    }
  }

  window.appclimbAnalytics.track("conversion", { goal });
  if (oncePerSession) {
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // The event was already sent; storage failure is non-fatal.
    }
  }
  return true;
}
