import type { Metadata } from "next";

import { KeywordExplorer } from "@/components/keyword-explorer";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "App Store Keyword Explorer — free popularity & difficulty estimates",
  description:
    "Search any App Store keyword and see an estimated popularity score, difficulty, and a 30-day trend — built from public App Store data, free and without an account.",
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <MarketingShell>
      <KeywordExplorer />
    </MarketingShell>
  );
}
