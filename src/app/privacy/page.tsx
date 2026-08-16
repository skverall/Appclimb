import { MarketingShell } from "@/components/marketing-shell";

export const metadata = {
  title: "Privacy",
  description:
    "AppClimb privacy principles: local-first keyword data, minimal optional account data, no tracking.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">Legal</span>
        <h1>Privacy principles</h1>
        <p className="legal-updated">Last updated August 16, 2026</p>
        <section>
          <h2>Local-first by default</h2>
          <p>
            You do not need an account to use AppClimb. Without one, your
            keyword list, history, and trend charts are stored in your
            browser&apos;s localStorage and never uploaded to AppClimb servers.
            Clearing your browser data removes them permanently.
          </p>
        </section>
        <section>
          <h2>Account data is minimal and optional</h2>
          <p>
            Signing in is optional. An account stores only: your email address,
            an optional display name, a Google subject id when you use Google
            sign-in, hashed session tokens, your subscription status, and — if
            you enable Pro cloud sync — your own synced keyword data. We store
            nothing else about you.
          </p>
        </section>
        <section>
          <h2>No tracking</h2>
          <p>
            This site does not run third-party analytics, advertising, or
            fingerprinting scripts. We do not use cookies for marketing or
            measurement. One HttpOnly session cookie keeps you signed in; it
            contains no personal data itself. The hosting provider may keep
            standard infrastructure logs (for example, for abuse prevention),
            which are not used to profile visitors.
          </p>
        </section>
        <section>
          <h2>Payments</h2>
          <p>
            Subscriptions are processed by Paddle, the merchant of record.
            When you upgrade, Paddle collects your payment details; AppClimb
            never sees or stores your card information. Paddle&apos;s handling
            of payment data is governed by Paddle&apos;s own privacy policy.
          </p>
        </section>
        <section>
          <h2>Third parties</h2>
          <p>
            When you search a keyword, your browser sends the query directly to
            Apple&apos;s iTunes Search API. Apple&apos;s handling of those
            requests is governed by Apple&apos;s own privacy policy. Google
            processes sign-ins only when you choose to sign in with Google.
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
