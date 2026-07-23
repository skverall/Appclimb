import Link from "next/link";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link href="/">← AppClimb</Link>
      <span className="eyebrow">Legal</span>
      <h1>Terms of service</h1>
      <p className="legal-updated">Last updated July 23, 2026</p>
      <section>
        <h2>Decision support, not execution</h2>
        <p>
          AppClimb provides observations, derived diagnoses, hypotheses and
          action proposals. The MVP cannot change App Store metadata, ads,
          paywalls or experiments in external systems.
        </p>
      </section>
      <section>
        <h2>Trials and billing</h2>
        <p>
          New workspaces receive a 14-day trial without a card. Continued
          access is offered at $12.99 per month or $129 per year through Paddle.
        </p>
      </section>
      <section>
        <h2>Data availability</h2>
        <p>
          Provider delays, privacy thresholds, revoked scopes and low sample
          sizes can reduce confidence. AppClimb presents confidence and evidence
          lineage so these limits stay visible.
        </p>
      </section>
      <p className="legal-note">
        By creating a workspace, you agree to use AppClimb only with data
        sources and applications you are authorized to access.
      </p>
    </main>
  );
}
