import type { Metadata } from "next";

import { AppWorkspace } from "@/components/app-workspace";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "AppClimb — official Apple Ads keyword popularity",
  description:
    "See Apple’s official Ads popularity (1–100) for any App Store keyword — labeled on every score. Estimated difficulty, bulk lists, 30-day trends. Free plan; Pro $8/month.",
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
