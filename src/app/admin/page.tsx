import type { Metadata } from "next";

import { AdminPageClient } from "@/components/admin/admin-page-client";
import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Admin Analytics · AppClimb Pulse",
  description: "Real-time, zero-bot analytics and visitor insights for AppClimb.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <MarketingShell>
      <main className="tool-page marketing-container">
        <AdminPageClient />
      </main>
    </MarketingShell>
  );
}
