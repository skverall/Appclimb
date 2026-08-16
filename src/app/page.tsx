import type { Metadata } from "next";

import { AppWorkspace } from "@/components/app-workspace";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "AppClimb — official Apple Ads keyword popularity",
  description:
    "See Apple’s official Ads popularity (1–100) for any App Store keyword. Competitors hide the source. We label it. Estimated difficulty, bulk lists, local trends. Free plan with honest limits; Pro at $8/month adds cloud sync.",
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
