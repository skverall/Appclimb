import { ArrowLeft, Check, Clock3, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Pricing",
  description:
    "Start AppClimb early access free for 14 days, with demo and live-data status clearly labeled.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "AppClimb Pricing",
    description:
      "14-day no-card early access, then $12.99 monthly or $129 yearly.",
    url: "/pricing",
  },
};

const accessDetails = [
  {
    status: "Available now",
    detail: "interactive River Atlas demo with clearly labeled synthetic data",
    inDevelopment: false,
  },
  {
    status: "Available now",
    detail: "account, 14-day trial, pricing and secure source setup",
    inDevelopment: false,
  },
  {
    status: "Foundation available",
    detail:
      "read-only setup for App Store Connect, RevenueCat, PostHog and Superwall",
    inDevelopment: false,
  },
  {
    status: "In development",
    detail: "complete live imports, real diagnosis and Growth Replay",
    inDevelopment: true,
  },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "AppClimb",
          url: absoluteUrl("/pricing"),
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any modern web browser",
          offers: [
            {
              "@type": "Offer",
              name: "AppClimb Monthly",
              price: "12.99",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
            },
            {
              "@type": "Offer",
              name: "AppClimb Yearly",
              price: "129",
              priceCurrency: "USD",
              availability: "https://schema.org/InStock",
            },
          ],
        }}
      />
      <main className="pricing-page">
        <nav className="pricing-nav" aria-label="Pricing navigation">
          <Link href="/" aria-label="Back to AppClimb">
            <BrandMark />
          </Link>
          <Link href="/" className="pricing-back">
            <ArrowLeft size={16} aria-hidden="true" /> Explore the interactive
            demo
          </Link>
        </nav>

        <section className="pricing-hero">
          <span className="eyebrow">Stage 0 early access</span>
          <h1>Try the River Atlas concept with product status made clear.</h1>
          <p>
            The 14-day trial includes the labeled interactive demo and available
            account and source setup. Complete live funnel coverage is still in
            development.
          </p>
        </section>

        <section className="pricing-card" aria-labelledby="pricing-title">
          <div>
            <span className="eyebrow">AppClimb early access</span>
            <h2 id="pricing-title">One plan for the River Atlas foundation.</h2>
            <ul>
              {accessDetails.map(({ status, detail, inDevelopment }) => {
                const StatusIcon = inDevelopment ? Clock3 : Check;

                return (
                  <li key={status + detail}>
                    <StatusIcon size={16} aria-hidden="true" />
                    <span>
                      <strong>{status}:</strong> {detail}
                    </span>
                  </li>
                );
              })}
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
              Start 14-day early access
            </Link>
            <p>
              <ShieldCheck size={15} aria-hidden="true" />
              Billing and taxes are handled securely by Paddle.
            </p>
          </div>
        </section>

        <footer className="pricing-footer">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refunds">Refunds</Link>
          <Link href="/pricing.md">Machine-readable pricing</Link>
        </footer>
      </main>
    </>
  );
}
