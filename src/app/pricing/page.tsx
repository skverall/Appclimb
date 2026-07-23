import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export const metadata = {
  title: "Pricing",
  description:
    "Start AppClimb free for 14 days, then choose monthly or annual billing.",
};

const benefits = [
  "Four read-only data connectors",
  "River Atlas and evidence-backed diagnosis",
  "Growth Replay and experiment drafts",
  "90 days of normalized metric history",
];

export default function PricingPage() {
  return (
    <main className="pricing-page">
      <nav className="pricing-nav" aria-label="Pricing navigation">
        <Link href="/" aria-label="Back to AppClimb">
          <BrandMark />
        </Link>
        <Link href="/" className="pricing-back">
          <ArrowLeft size={16} /> Explore the demo
        </Link>
      </nav>

      <section className="pricing-hero">
        <span className="eyebrow">Simple pricing</span>
        <h1>Find the bottleneck before you buy more traffic.</h1>
        <p>
          Start with a 14-day trial. No card is required until you choose to
          keep your workspace running.
        </p>
      </section>

      <section className="pricing-card" aria-labelledby="pricing-title">
        <div>
          <span className="eyebrow">AppClimb Pro</span>
          <h2 id="pricing-title">One plan. Every growth stage.</h2>
          <ul>
            {benefits.map((benefit) => (
              <li key={benefit}>
                <Check size={16} /> {benefit}
              </li>
            ))}
          </ul>
        </div>
        <div className="pricing-options">
          <article>
            <span>Monthly</span>
            <strong>$12.99</strong>
            <small>per month</small>
          </article>
          <article className="recommended">
            <span>Yearly · save 17%</span>
            <strong>$129</strong>
            <small>per year</small>
          </article>
          <Link href="/login" className="pricing-cta">
            Start 14-day trial
          </Link>
          <p>
            <ShieldCheck size={15} />
            Billing and taxes are handled securely by Paddle.
          </p>
        </div>
      </section>

      <footer className="pricing-footer">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/refunds">Refunds</Link>
      </footer>
    </main>
  );
}
