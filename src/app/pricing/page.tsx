import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { PricingPlans } from "@/components/pricing-plans";
import { absoluteUrl } from "@/lib/site";

export const metadata = {
  title: "Pricing",
  description:
    "AppClimb pricing: search App Store keywords free (8 checks/day, Apple Ads popularity, difficulty evidence). Pro is $8/month: unlimited checks, 52 weeks of Apple history, unlimited tracking, cloud sync.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "AppClimb Pricing",
    description:
      "Free plan with honest limits. Pro $8/month: unlimited keyword checks, 52 weeks of Apple popularity history, cloud sync.",
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
      "It's the real tool with honest daily limits: 8 new keyword checks a day (re-checking your list is free), Apple Ads popularity with 12 weeks of history, difficulty with its evidence, trending searches, and — after a free sign-in — one tracked app and 5 AI messages. Your keyword data stays in your browser unless you upgrade to Pro sync.",
  },
  {
    question: "What does Pro unlock?",
    answer:
      "Unlimited keyword checks and tracked apps, a full year (52 weeks) of Apple popularity history per keyword, 90 days of rank history, cloud sync across devices, and 200 AI messages/day.",
  },
  {
    question: "Why do some keywords show “≤48 · Long tail” instead of a number?",
    answer:
      "Apple publishes popularity for the 500 most-searched terms in each category. For anything below that list, the honest answer is “at or below the lowest published score” — so that's what we show, on every plan. Difficulty is always labeled as an estimate. Nothing is ever relabeled as search volume.",
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
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "AppClimb",
              item: absoluteUrl("/"),
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Pricing",
              item: absoluteUrl("/pricing"),
            },
          ],
        }}
      />
      <main className="marketing-page pricing-page">
        <section className="pricing-hero">
          <p className="eyebrow">Pricing</p>
          <h1>Search free. Go Pro when keywords become a habit.</h1>
          <p>
            Apple&apos;s own popularity data and an explained difficulty score on
            every plan. Pro is $8/month — versus $89–$4,000/month for black-box
            ASO suites.
          </p>
        </section>

        <div className="marketing-container">
          <PricingPlans />
        </div>

        <section className="pricing-comparison marketing-container" aria-label="Feature comparison">
          <h2>Plan comparison</h2>
          <div className="article-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">Free Plan</th>
                  <th scope="col">Pro ($8/mo · $64/yr)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>New keyword checks</strong></td>
                  <td>8 / day (no sign-up)</td>
                  <td><strong>Unlimited</strong></td>
                </tr>
                <tr>
                  <td><strong>Apple Ads popularity, difficulty evidence, verdict</strong></td>
                  <td>Included</td>
                  <td><strong>Included</strong></td>
                </tr>
                <tr>
                  <td><strong>Apple popularity history per keyword</strong></td>
                  <td>12 weeks</td>
                  <td><strong>52 weeks</strong></td>
                </tr>
                <tr>
                  <td><strong>Trending, related &amp; autocomplete searches</strong></td>
                  <td>Included</td>
                  <td><strong>Included</strong></td>
                </tr>
                <tr>
                  <td><strong>Tracked iOS apps &amp; keywords</strong></td>
                  <td>1 app · 25 keywords (free sign-in)</td>
                  <td><strong>Unlimited apps &amp; keywords</strong></td>
                </tr>
                <tr>
                  <td><strong>Your daily checks &amp; rank history</strong></td>
                  <td>30 days in this browser</td>
                  <td><strong>90 days, synced</strong></td>
                </tr>
                <tr>
                  <td><strong>ASO AI assistant</strong></td>
                  <td>5 messages / day (free sign-in)</td>
                  <td><strong>200 messages / day</strong></td>
                </tr>
                <tr>
                  <td><strong>100-character keyword field builder</strong></td>
                  <td>Included</td>
                  <td><strong>Included</strong></td>
                </tr>
                <tr>
                  <td><strong>Cloud sync across devices</strong></td>
                  <td>Local browser only</td>
                  <td><strong>Cloud sync</strong></td>
                </tr>
                <tr>
                  <td><strong>CSV export &amp; JSON backups</strong></td>
                  <td>Included</td>
                  <td><strong>Included</strong></td>
                </tr>
                <tr>
                  <td><strong>Payment &amp; cancellation</strong></td>
                  <td>No card required</td>
                  <td><strong>Cancel anytime</strong> (runs to period end)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

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
