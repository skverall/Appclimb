import type { Metadata } from "next";
import { ArrowRight, Eye, ListPlus, Search, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { SITE_DESCRIPTION, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "App Store Keyword Research: Popularity and Difficulty Estimates",
  description:
    "How AppClimb estimates keyword popularity and difficulty from public App Store data, and how to use bulk analysis, the golden-keyword filter, CSV export, and local backup to pick keywords worth ranking for.",
  alternates: {
    canonical: "/app-store-keywords",
  },
  openGraph: {
    title: "App Store Keyword Research · AppClimb",
    description:
      "Estimated popularity, difficulty, and trends for any App Store keyword — bulk list analysis, golden-keyword filtering, and CSV export from public data, free and without an account.",
    url: "/app-store-keywords",
  },
};

const steps = [
  {
    title: "Search any keyword",
    text: "Type a term and AppClimb pulls the live result set from the public iTunes Search API — no account, no API key, nothing stored on a server.",
    icon: Search,
  },
  {
    title: "Read the estimates",
    text: "Popularity (estimated demand) and difficulty (barrier to rank) are scored 0–100, with the evidence — result count, top apps, ratings — shown right next to them.",
    icon: Eye,
  },
  {
    title: "Track the trend",
    text: "One daily snapshot per keyword builds a 30-day chart in your browser. The first check gets an estimated baseline so the chart is useful immediately.",
    icon: TrendingUp,
  },
  {
    title: "Filter, export, back up",
    text: "Paste up to 50 keywords at once, filter for golden opportunities (solid demand, low barrier), export rows to CSV, and keep a local JSON backup you can restore on any browser.",
    icon: ListPlus,
  },
];

const faq = [
  {
    question: "Where does the keyword data come from?",
    answer:
      "Exclusively from Apple's public iTunes Search API, queried from your browser. AppClimb has no hidden data sources and no third-party data brokers in the middle.",
  },
  {
    question: "Is popularity the same as search volume?",
    answer:
      "No. True App Store search volume only exists inside Apple's paid Search Ads API. AppClimb's popularity is an estimate derived from competition pressure and top-result strength, and it is always labeled as an estimate.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. There is no login, no billing, and no tracking. Your keyword list and history live in your browser's localStorage.",
  },
  {
    question: "Can I analyze a whole list at once?",
    answer:
      "Yes. Paste up to 50 keywords — one per line or comma-separated — and AppClimb analyzes them in small paced batches so the public API doesn't rate-limit you. Rows that fail are reported in a summary while the rest of the queue keeps running.",
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
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
        }}
      />
      <main className="marketing-page">
        <section className="marketing-hero marketing-container">
          <div className="marketing-hero-copy">
            <span className="marketing-eyebrow">App Store keyword research</span>
            <h1>Pick keywords worth ranking for.</h1>
            <p>
              Every keyword gets an estimated popularity score, an estimated
              difficulty score, and a 30-day trend — built from public App Store
              data. Free, no account, no invented volumes.
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
              <span>✅ Public iTunes data only</span>
              <span>✅ Estimates labeled honestly</span>
              <span>✅ Bulk lists, CSV export & backup</span>
              <span>✅ No account or tracking</span>
            </div>
          </div>
        </section>

        <section className="marketing-definition-band">
          <div className="marketing-definition marketing-container">
            <h2>What the scores mean</h2>
            <div>
              <p>
                <strong>Popularity</strong> is an estimate of demand: how much
                competition pressure and top-result strength suggest a term is
                actively searched. <strong>Difficulty</strong> is an estimate of
                the barrier: how many apps compete, how many ratings the
                incumbents hold, and whether mega-brands dominate the first
                page. Both are directional, and both come with the underlying
                evidence instead of a mysterious single number.
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
            <span className="marketing-eyebrow">Why estimates, not volume</span>
            <h2 className="marketing-section-heading">
              Nobody free can show you real search volume. We say so.
            </h2>
            <p>
              True App Store search volume is Apple&apos;s business data,
              available only through the paid Search Ads API. Tools that show
              precise monthly searches without a stated source are showing a
              model — often without admitting it. AppClimb estimates from public
              signals, labels every number, and shows you the result count, top
              apps, and ratings behind each score. You can judge the estimate
              instead of trusting a black box.
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
          <p>Free. No account. Data you can verify.</p>
          <Link href="/" className="marketing-primary-action large">
            <Sparkles size={17} aria-hidden="true" /> Search keywords
          </Link>
        </section>
      </main>
    </MarketingShell>
  );
}
