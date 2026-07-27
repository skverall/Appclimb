import { ArrowLeft, Check, Clock3, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Pricing",
  description:
    "Growth CI for iOS subscription apps. First complete release verdict free, then $12.99/month or $129/year for ongoing monitoring and Agent Bridge.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "AppClimb Pricing",
    description:
      "First release verdict free. Pro is $12.99 monthly or $129 yearly for automatic Growth CI and Agent Bridge.",
    url: "/pricing",
  },
};

const accessDetails = [
  {
    status: "Free",
    detail:
      "one iOS app, RevenueCat + PostHog, first complete release verdict, one Growth Task export",
    inDevelopment: false,
  },
  {
    status: "Pro",
    detail:
      "automatic six-hour monitoring, ongoing verdicts, Agent Bridge, verification loop, 90-day history",
    inDevelopment: false,
  },
  {
    status: "Core sources",
    detail: "RevenueCat (money) and PostHog (behavior) only for measurement activation",
    inDevelopment: false,
  },
  {
    status: "Honest limits",
    detail:
      "low-volume apps get collecting / inconclusive — never fabricated advice",
    inDevelopment: false,
  },
];

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "AppClimb Growth CI",
          description:
            "Growth CI for AI-built iOS subscription apps. Connect RevenueCat and PostHog, evaluate releases, and verify agent fixes with production data.",
          brand: { "@type": "Brand", name: "AppClimb" },
          offers: [
            {
              "@type": "Offer",
              name: "Free first verdict",
              price: "0",
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
            {
              "@type": "Offer",
              name: "Pro monthly",
              price: "12.99",
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
            {
              "@type": "Offer",
              name: "Pro yearly",
              price: "129",
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
          ],
        }}
      />
      <main className="marketing-page pricing-page">
        <header className="marketing-top">
          <Link href="/" className="marketing-brand">
            <BrandMark />
          </Link>
          <Link href="/" className="marketing-back">
            <ArrowLeft size={16} /> Back
          </Link>
        </header>

        <section className="pricing-hero">
          <p className="eyebrow">Pricing</p>
          <h1>Growth CI for AI-built iOS subscription apps.</h1>
          <p>
            Your agents ship. AppClimb proves whether the release helped. First
            complete release verdict free — then Pro for continuous monitoring
            and Agent Bridge.
          </p>
        </section>

        <section className="pricing-grid" aria-labelledby="pricing-title">
          <div className="pricing-card">
            <h2 id="pricing-title">Free</h2>
            <p className="price">
              $0 <span>first verdict</span>
            </p>
            <ul>
              <li>
                <Check size={16} /> One iOS app
              </li>
              <li>
                <Check size={16} /> RevenueCat + PostHog
              </li>
              <li>
                <Check size={16} /> First complete release verdict
              </li>
              <li>
                <Check size={16} /> One Growth Task export/copy
              </li>
            </ul>
          </div>
          <div className="pricing-card pricing-card-featured">
            <h2>Pro</h2>
            <p className="price">
              $12.99 <span>/ month</span>
            </p>
            <p className="price-alt">or $129 / year</p>
            <ul>
              <li>
                <Check size={16} /> Automatic six-hour monitoring
              </li>
              <li>
                <Check size={16} /> Ongoing release verdicts
              </li>
              <li>
                <Check size={16} /> Agent Bridge + skill/cron
              </li>
              <li>
                <Check size={16} /> Verification loop + 90-day history
              </li>
            </ul>
            <Link href="/login" className="primary-action">
              Start with free verdict
            </Link>
          </div>
        </section>

        <section className="pricing-status" aria-labelledby="status-title">
          <h2 id="status-title">What you get</h2>
          <ul>
            {accessDetails.map((item) => (
              <li key={item.detail}>
                <span className="status-pill">
                  {item.inDevelopment ? (
                    <Clock3 size={14} />
                  ) : (
                    <ShieldCheck size={14} />
                  )}
                  {item.status}
                </span>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
