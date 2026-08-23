import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { PricingPlans } from "@/components/pricing-plans";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Pricing",
  description:
    "AppClimb pricing: a free plan with honest daily limits (8 keyword checks, AI 5/day) and Pro at $8/month with unlimited checks, cloud sync, and 90-day history.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "AppClimb Pricing",
    description:
      "Free plan with honest limits. Pro $8/month: unlimited keyword checks, cloud sync, 90-day history.",
    url: "/pricing",
  },
};

const FAQ = [
  {
    question: "Do I need an account?",
    answer:
      "Not to search keywords — Keyword Explorer is open as a guest (8 checks/day). Tracking an app and the ASO assistant need a free sign-in. Pro is optional after that.",
  },
  {
    question: "Is the free plan real or a demo?",
    answer:
      "It's the real tool with honest daily limits: 8 keyword checks, 5 AI messages after you sign in, 30 official popularity lookups, and one tracked app. Your keyword data stays in your browser unless you upgrade to Pro sync.",
  },
  {
    question: "What does Pro unlock?",
    answer:
      "Unlimited keyword checks and tracked apps, cloud sync across devices, 90-day history and charts, 200 AI messages/day, and 500 official popularity lookups/day.",
  },
  {
    question: "Why is popularity still labeled 'Apple Ads' or 'Est.' on Pro?",
    answer:
      "Because that's the truth: Apple Ads official scores are relative (1–100), and anything Apple doesn't cover is an estimate. Pro never relabels estimates as real volumes.",
  },
  {
    question: "Can I cancel?",
    answer:
      "Yes, anytime from your account menu — Pro stays active until the end of the period you paid for, then limits revert to Free. Your synced data remains in your account.",
  },
  {
    question: "Who processes payments?",
    answer:
      "Paddle, the merchant of record. AppClimb never sees or stores your card details. See the refund policy for details.",
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "AppClimb Pro",
          description:
            "App Store keyword research: official Apple Ads popularity, estimated difficulty, cloud sync.",
          brand: { "@type": "Brand", name: "AppClimb" },
          offers: [
            {
              "@type": "Offer",
              name: "Free plan",
              price: "0",
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
            {
              "@type": "Offer",
              name: "Pro monthly",
              price: "8",
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
            {
              "@type": "Offer",
              name: "Pro yearly",
              price: "64",
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }}
      />
      <main className="marketing-page pricing-page">
        <section className="pricing-hero">
          <p className="eyebrow">Pricing</p>
          <h1>Honest limits on Free. Everything unlimited on Pro.</h1>
          <p>
            Official Apple Ads popularity stays labeled on every plan. Pro is
            $8/month — the price of lunch — versus $89–$4,000/month for
            black-box ASO suites.
          </p>
        </section>

        <div className="marketing-container">
          <PricingPlans />
        </div>

        <section className="pricing-faq marketing-container" aria-label="Pricing FAQ">
          <h2>Questions, answered honestly</h2>
          <dl>
            {FAQ.map((item) => (
              <div key={item.question}>
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
    </MarketingShell>
  );
}
