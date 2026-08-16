import { MarketingShell } from "@/components/marketing-shell";

export const metadata = {
  title: "Terms",
  description:
    "AppClimb terms of service: free plan with honest limits, Pro subscription, estimates not guarantees.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">Legal</span>
        <h1>Terms of service</h1>
        <p className="legal-updated">Last updated August 16, 2026</p>
        <section>
          <h2>The service</h2>
          <p>
            AppClimb provides an App Store keyword research tool. Difficulty
            comes from Apple&apos;s public iTunes Search API. Popularity is
            Apple Ads official (relative 1–100) when available, otherwise an
            iTunes estimate. The free plan has daily limits (8 keyword checks,
            5 assistant messages, one tracked app); the Pro plan lifts these
            limits and adds cloud sync.
          </p>
        </section>
        <section>
          <h2>Subscriptions and billing</h2>
          <p>
            Pro costs $8/month or $64/year, billed through Paddle, the merchant
            of record. You can cancel anytime from your account menu; Pro stays
            active until the end of the period you paid for, after which limits
            revert to the free plan. Your synced data remains in your account.
            Refunds follow the policy on the refunds page and Paddle&apos;s
            buyer protections.
          </p>
        </section>
        <section>
          <h2>Estimates, not guarantees</h2>
          <p>
            Difficulty is always an estimate. Popularity is either Apple Ads
            official (relative 1–100) or an estimate, and is labeled with its
            source. AppClimb does not claim to show search volume and is not
            affiliated with Apple. Rankings and results are snapshots and may
            change at any time.
          </p>
        </section>
        <section>
          <h2>Acceptable use</h2>
          <p>
            You agree to use the tool only for lawful purposes and not to
            overload Apple&apos;s public interfaces or AppClimb&apos;s
            infrastructure with automated, abusive, or bulk requests beyond
            normal human use, and not to attempt to bypass plan limits.
          </p>
        </section>
        <section>
          <h2>No warranty</h2>
          <p>
            The service is provided &ldquo;as is&rdquo; without warranties of any kind.
            AppClimb is not liable for decisions made based on the estimates or
            for temporary unavailability of the service or of Apple&apos;s
            public APIs.
          </p>
        </section>
        <p className="legal-note">
          By using AppClimb you accept these terms. Questions can be raised via
          the GitHub repository linked on this site.
        </p>
      </main>
    </MarketingShell>
  );
}
