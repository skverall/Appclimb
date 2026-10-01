import type { Metadata } from "next";
import { ArrowRight, Eye, ListPlus, Search, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { SITE_DESCRIPTION, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "App Store Keyword Research: Official Apple Ads Popularity",
  description:
    "Official Apple Ads popularity (1–100) plus estimated difficulty. Competitors hide the source. AppClimb labels every score — free plan with honest limits, Pro at $8/month.",
  alternates: {
    canonical: "/app-store-keywords",
  },
  openGraph: {
    title: "Official Apple Ads popularity · AppClimb",
    description:
      "Apple’s official Ads popularity (1–100) for any App Store keyword — labeled source, not a black-box volume. Free plan with honest limits, Pro $8/month.",
    url: "/app-store-keywords",
  },
};

const steps = [
  {
    title: "Search any keyword",
    text: "Type a term and AppClimb pulls the live result set from the public iTunes Search API — no API key, and by default nothing is stored on a server.",
    icon: Search,
  },
  {
    title: "Read Apple’s score",
    text: "Popularity is Apple Ads official (1–100) for the 500 most-searched terms per category; long-tail terms show the ceiling Apple implies. Difficulty is an estimate with its evidence beside it: median ratings, the weakest app on page one, and who targets the term.",
    icon: Eye,
  },
  {
    title: "See the real trend",
    text: "Apple publishes popularity weekly, so every published term comes with its actual history — 12 weeks free, a full year on Pro. Nothing is backfilled or simulated.",
    icon: TrendingUp,
  },
  {
    title: "Filter, export, back up",
    text: "Paste up to 50 keywords at once, filter by verdict — Worth targeting, Long-tail win, Competitive, Dominated — export rows to CSV, and keep a local JSON backup you can restore on any browser.",
    icon: ListPlus,
  },
];

const faq = [
  {
    question: "Where does the keyword data come from?",
    answer:
      "Popularity comes from Apple Ads Insights: every week Apple publishes a relative 1–100 score for the 500 most-searched terms in each of 15 categories per storefront. AppClimb keeps that list (and each term's weekly history) through a founder-owned Platform API v1 connection — visitors never connect an Ads account. Difficulty, top apps, and your app's position come from Apple's public iTunes Search API, queried from your browser.",
  },
  {
    question: "Is popularity the same as search volume?",
    answer:
      "No. Search volume (query counts) is private to Apple. AppClimb shows Apple's relative popularity (1–100). For terms Apple doesn't publish, it shows “≤ ceiling · Long tail” rather than inventing a number. Neither is volume, and the UI labels which one you're looking at.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. Searching works without one — 8 new keyword checks a day, with Apple popularity, 12 weeks of history, and difficulty evidence — and your keyword list lives in your browser's localStorage. A free account adds tracking for one app and the ASO assistant. Pro ($8/month) adds unlimited checks, a full year of Apple history, unlimited tracking, and cloud sync.",
  },
  {
    question: "Can I analyze a whole list at once?",
    answer:
      "Yes. Paste up to 50 keywords — one per line or comma-separated — and AppClimb analyzes them in small paced batches so the public API doesn't rate-limit you. Each new keyword uses one of your daily checks (8/day on the free plan, unlimited on Pro). Rows that fail are reported in a summary while the rest of the queue keeps running.",
  },
  {
    question: "Can I export or back up my keyword data?",
    answer:
      "Yes. Export the table as CSV for spreadsheets, and download a JSON backup of your full keyword history that you can restore at any time — even on a fresh browser or after clearing local data. Everything stays on your device.",
  },
  {
    question: "Why does difficulty matter?",
    answer:
      "A popular keyword you cannot rank for is a waste of metadata. Difficulty estimates how hard it looks to reach the top results — how many apps compete and how strong the incumbents are — so you can balance reach against effort.",
  },
];

export default function KeywordResearchPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "AppClimb Keyword Explorer",
          url: absoluteUrl("/"),
          description: SITE_DESCRIPTION,
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Any",
          offers: [
            {
              "@type": "Offer",
              name: "Free plan",
              price: "0",
              priceCurrency: "USD",
            },
            {
              "@type": "Offer",
              name: "Pro monthly",
              price: "8",
              priceCurrency: "USD",
            },
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
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
              name: "App Store Keywords",
              item: absoluteUrl("/app-store-keywords"),
            },
          ],
        }}
      />
      <main className="marketing-page">
        <section className="marketing-hero marketing-container">
          <div className="marketing-hero-copy">
            <span className="marketing-eyebrow">Official Apple Ads data</span>
            <h1>Popularity from Apple. Not a black box.</h1>
            <p>
              Paid tools invent search volume and hide the model. AppClimb
              shows Apple&apos;s official Ads popularity (1–100) when the term
              is in that storefront and genre — labeled on every score. A free
              plan with honest daily limits; Pro is $8/month.
            </p>
            <div className="marketing-hero-actions">
              <Link href="/" className="marketing-primary-action large">
                Search keywords <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link
                href="/guides/keyword-research"
                className="marketing-secondary-action large"
              >
                Read the research guide
              </Link>
            </div>
            <div className="marketing-trust-row">
              <span>✅ Official Apple Ads popularity</span>
              <span>✅ Source labeled on every score</span>
              <span>✅ Bulk lists, CSV export & backup</span>
              <span>✅ Free plan with honest limits</span>
            </div>
          </div>
        </section>

        <section className="marketing-definition-band">
          <div className="marketing-definition marketing-container">
            <h2>What the scores mean</h2>
            <div>
              <p>
                <strong>Popularity</strong>{" "}is Apple&apos;s official relative
                Ads score (1–100) when the term appears in that storefront and
                genre; otherwise an estimate from competition and top-result
                strength. <strong>Difficulty</strong> is always an estimate of
                the barrier: how many apps compete, how many ratings the
                incumbents hold, and whether mega-brands dominate the first
                page. Neither is search volume.
              </p>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-container">
          <span className="marketing-eyebrow">How it works</span>
          <h2 className="marketing-section-heading">
            From search to a keyword list in three steps.
          </h2>
          <div className="marketing-loop-grid">
            {steps.map((step) => (
              <div key={step.title} className="blog-card">
                <div className="blog-card-icon">
                  <step.icon aria-hidden="true" />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="marketing-section marketing-section-tint">
          <div className="marketing-container">
            <span className="marketing-eyebrow">The difference</span>
            <h2 className="marketing-section-heading">
              They hide the source. We start with Apple.
            </h2>
            <p>
              Sensor Tower, AppTweak, and similar tools show a volume number
              with no public source. AppClimb uses Apple Ads Platform API v1
              — Apple&apos;s own relative popularity (1–100), not monthly
              query counts. If Apple has no row that week, we fall back to a
              labeled iTunes estimate and say so. Difficulty still shows the
              result count, top apps, and ratings behind it.
            </p>
            <div className="marketing-hero-actions">
              <Link href="/" className="marketing-primary-action">
                Try it now <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-faq marketing-container">
          <span className="marketing-eyebrow">Questions</span>
          <h2 className="marketing-section-heading">Frequently asked</h2>
          <div className="marketing-faq-list">
            {faq.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="marketing-final-cta marketing-container">
          <h2>Your first keyword is one search away.</h2>
          <p>Free plan with honest limits. Data you can verify.</p>
          <Link href="/" className="marketing-primary-action large">
            <Sparkles size={17} aria-hidden="true" /> Search keywords
          </Link>
        </section>
      </main>
    </MarketingShell>
  );
}
