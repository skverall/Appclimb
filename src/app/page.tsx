import type { Metadata } from "next";

import { AppWorkspace } from "@/components/app-workspace";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "AppClimb — free App Store keyword tracker & explorer",
  description:
    "Explore App Store keywords: estimated popularity and difficulty, bulk list analysis, golden-keyword filter, CSV export, and local backup — plus observed position tracking for your app. Free, no account.",
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <MarketingShell>
      <AppWorkspace />
    </MarketingShell>
  );
}
