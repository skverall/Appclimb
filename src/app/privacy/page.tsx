import Link from "next/link";

export const metadata = {
  title: "Privacy",
  description:
    "How AppClimb protects source credentials, limits identity joins, and handles deletion.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <Link href="/">← AppClimb</Link>
      <span className="eyebrow">Legal</span>
      <h1>Privacy principles</h1>
      <p className="legal-updated">Last updated July 23, 2026</p>
      <section>
        <h2>Minimal access</h2>
        <p>
          AppClimb connects to data sources with read-only credentials whenever
          the provider supports them. After submission, credentials are
          envelope encrypted at rest, are never returned in source responses
          and are not included in AI requests.
        </p>
      </section>
      <section>
        <h2>Aggregated diagnosis</h2>
        <p>
          We process aggregate store, product, paywall and subscription metrics.
          User-level joins are disabled unless a workspace explicitly confirms
          a shared App User ID across the connected sources.
        </p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>
          Metric history is retained for 90 days. Revoking a source deletes its
          stored credential envelope. Account deletion removes the user,
          workspace data and source credentials.
        </p>
      </section>
      <p className="legal-note">
        Source revocation and permanent account deletion are available from the
        account settings in an authenticated workspace.
      </p>
    </main>
  );
}
