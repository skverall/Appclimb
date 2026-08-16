import { Check } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Pricing",
  description:
    "AppClimb is free: official Apple Ads popularity (1–100) plus estimated difficulty. No account or payment.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "AppClimb Pricing",
    description:
      "Free. No accounts. No billing. Official Apple Ads popularity, estimated difficulty.",
    url: "/pricing",
  },
};

const accessDetails = [
  {
    status: "Free",
    detail:
      "unlimited keyword searches, Apple Ads popularity, estimated difficulty, 30-day trends",
    inDevelopment: false,
  },
  {
    status: "No account",
    detail:
      "your keyword list and history stay in your browser's localStorage",
    inDevelopment: false,
  },
  {
    status: "Apple source",
    detail:
      "popularity is Apple Ads official (relative 1–100) when Apple has the term — not invented volume",
    inDevelopment: false,
  },
  {
    status: "Honest limits",
    detail:
      "estimates are labeled as estimates; trends start with an estimated baseline and grow with real daily snapshots",
    inDevelopment: false,
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "AppClimb Keyword Explorer",
          description:
            "Free App Store keyword research: Apple Ads popularity, estimated difficulty, and 30-day trends.",
          brand: { "@type": "Brand", name: "AppClimb" },
          offers: [
            {
              "@type": "Offer",
              name: "Free forever",
              price: "0",
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
          ],
        }}
      />
      <main className="marketing-page pricing-page">
        <section className="pricing-hero">
          <p className="eyebrow">Pricing</p>
          <h1>Free forever. That&apos;s the whole plan.</h1>
          <p>
            AppClimb is a public App Store keyword explorer. There is no paid
            tier, no trial, no card required — the tool is the product.
          </p>
        </section>

        <section className="pricing-grid" aria-labelledby="pricing-title">
          <div className="pricing-card pricing-card-featured">
            <h2 id="pricing-title">Keyword Explorer</h2>
            <p className="price">
              $0 <span>forever</span>
            </p>
            <ul>
              <li>
                <Check size={16} /> Unlimited keyword searches
              </li>
              <li>
                <Check size={16} /> Estimated popularity (0–100)
              </li>
              <li>
                <Check size={16} /> Estimated difficulty (0–100)
              </li>
              <li>
                <Check size={16} /> 30-day trend charts
              </li>
              <li>
                <Check size={16} /> Related keywords + top-app breakdowns
              </li>
            </ul>
            <Link href="/" className="primary-action">
              Search keywords
            </Link>
          </div>
        </section>

        <section className="pricing-status" aria-labelledby="status-title">
          <h2 id="status-title">What you get</h2>
          <ul>
            {accessDetails.map((item) => (
              <li key={item.detail}>
                <span className="status-pill">
                  <Check size={14} />
                  {item.status}
                </span>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </MarketingShell>
  );
}
