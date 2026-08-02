import { SearchX } from "lucide-react";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing-shell";

export default function NotFound() {
  return (
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">404 · Not found</span>
        <h1>This page is not in the index.</h1>
        <p>
          The address may be outdated or mistyped. Nothing was changed — you
          can return to the keyword explorer.
        </p>
        <div className="marketing-hero-actions">
          <Link href="/" className="marketing-primary-action">
            <SearchX size={16} aria-hidden="true" /> Search keywords
          </Link>
        </div>
      </main>
    </MarketingShell>
  );
}
