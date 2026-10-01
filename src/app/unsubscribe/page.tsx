import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing-shell";

export const metadata: Metadata = {
  title: "Weekly email",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ u?: string; t?: string; done?: string; error?: string }>;

/**
 * Confirmation step for the weekly email's unsubscribe link. A button (not
 * the link itself) unsubscribes, so mail scanners that open links can't.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const { u = "", t = "", done, error } = await searchParams;
  return (
    <MarketingShell>
      <main className="marketing-container unsub">
        {done ? (
          <>
            <h1>You’re unsubscribed</h1>
            <p>
              AppClimb won’t send you the weekly email anymore. You can turn it back on any time
              from the account menu.
            </p>
            <Link href="/" className="unsub-link">
              Back to AppClimb
            </Link>
          </>
        ) : error || !u || !t ? (
          <>
            <h1>This link doesn’t work</h1>
            <p>
              The unsubscribe link is incomplete or expired. Sign in and turn off “Weekly email” in
              the account menu instead.
            </p>
            <Link href="/" className="unsub-link">
              Back to AppClimb
            </Link>
          </>
        ) : (
          <>
            <h1>Stop the weekly email?</h1>
            <p>
              You’ll stop getting AppClimb’s weekly summary of your keyword ranks, Apple
              popularity changes, and rising searches. Your account and data stay as they are.
            </p>
            <form method="post" action="/api/digest/unsubscribe">
              <input type="hidden" name="u" value={u} />
              <input type="hidden" name="t" value={t} />
              <button type="submit" className="unsub-button">
                Unsubscribe
              </button>
            </form>
          </>
        )}
      </main>
    </MarketingShell>
  );
}
