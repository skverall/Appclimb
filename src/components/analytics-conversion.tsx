"use client";

import { useEffect } from "react";

import { trackWebConversion } from "@/lib/browser-analytics";

export function AnalyticsConversion({ goal }: { goal: string }) {
  useEffect(() => {
    const track = () => {
      trackWebConversion(goal, true);
    };
    if (trackWebConversion(goal, true)) return;

    window.addEventListener("appclimb:ready", track, { once: true });
    return () => window.removeEventListener("appclimb:ready", track);
  }, [goal]);

  return null;
}
