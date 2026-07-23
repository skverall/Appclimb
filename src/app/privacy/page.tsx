import Link from "next/link";

export const metadata = { title: "Privacy" };

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
          the provider supports them. Credentials are envelope encrypted and
          are never returned to the browser or included in AI requests.
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
        Questions about privacy or deletion can be submitted from the account
        settings in your workspace.
      </p>
    </main>
  );
}
