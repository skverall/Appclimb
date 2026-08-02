import type { Metadata } from "next";

import { AppWorkspace } from "@/components/app-workspace";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "App Store Keyword Explorer — free popularity & difficulty estimates",
  description:
    "Search any App Store keyword, track your apps, and see estimated popularity, difficulty, and observed position — built from public App Store data, free and without an account.",
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
