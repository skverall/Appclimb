import { MarketingShell } from "@/components/marketing-shell";

export const metadata = {
  title: "Terms",
  description:
    "AppClimb terms of service for the free App Store keyword explorer.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <main className="legal-page">
        <span className="eyebrow">Legal</span>
        <h1>Terms of service</h1>
        <p className="legal-updated">Last updated August 2, 2026</p>
        <section>
          <h2>The service</h2>
          <p>
            AppClimb provides a free browser tool that estimates App Store
            keyword popularity and difficulty from Apple&apos;s public iTunes
            Search API. There is no account, no billing, and no paid tier.
          </p>
        </section>
        <section>
          <h2>Estimates, not guarantees</h2>
          <p>
            Popularity and difficulty are estimates derived from public signals
            and are labeled as such. AppClimb does not claim to show real Apple
            Search Ads volume and is not affiliated with Apple. Rankings and
            results shown are snapshots of public data and may change at any
            time.
          </p>
        </section>
        <section>
          <h2>Acceptable use</h2>
          <p>
            You agree to use the tool only for lawful purposes and not to
            overload Apple&apos;s public interfaces or AppClimb&apos;s
            infrastructure with automated, abusive, or bulk requests beyond
            normal human use.
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
