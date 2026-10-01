import type { Metadata } from "next";

import { AppWorkspace } from "@/components/app-workspace";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "AppClimb — official Apple Ads keyword popularity",
  description:
    "Find App Store keywords you can rank for. Apple Ads popularity with weekly history, difficulty that shows its evidence, trending searches by category, and a verdict on every keyword. Free to search.",
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
