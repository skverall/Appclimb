import type { Metadata } from "next";

import { AppWorkspace } from "@/components/app-workspace";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "AppClimb — free App Store keyword tracker & explorer",
  description:
    "Track your iOS app’s keywords locally: estimated popularity and difficulty, observed App Store position, suggestions from public metadata — free, no account, no tracking.",
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
