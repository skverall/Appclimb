import { MarketingShell } from "@/components/marketing-shell";

export const metadata = {
  title: "Privacy",
  description:
    "AppClimb privacy principles: no account, no tracking, no server-side storage of your keyword data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">Legal</span>
        <h1>Privacy principles</h1>
        <p className="legal-updated">Last updated August 2, 2026</p>
        <section>
          <h2>No account, no personal data</h2>
          <p>
            AppClimb is a public tool. There is no registration, no login, and
            no server-side user profile. We have nothing to associate with an
            individual.
          </p>
        </section>
        <section>
          <h2>Keyword data stays in your browser</h2>
          <p>
            The keyword explorer queries Apple&apos;s public iTunes Search API
            directly from your browser. Your keyword list, history, and trend
            charts are stored in your browser&apos;s localStorage and never
            uploaded to AppClimb servers. Clearing your browser data removes
            them permanently.
          </p>
        </section>
        <section>
          <h2>No tracking</h2>
          <p>
            This site does not run third-party analytics, advertising, or
            fingerprinting scripts. We do not use cookies for marketing or
            measurement purposes. The hosting provider may keep standard
            infrastructure logs (for example, for abuse prevention), which are
            not used to profile visitors.
          </p>
        </section>
        <section>
          <h2>Third parties</h2>
          <p>
            When you search a keyword, your browser sends the query directly to
            Apple&apos;s iTunes Search API. Apple&apos;s handling of those
            requests is governed by Apple&apos;s own privacy policy.
          </p>
        </section>
        <p className="legal-note">
          If you have questions about this policy, contact us via the GitHub
          repository linked on this site.
        </p>
      </main>
    </MarketingShell>
  );
}
