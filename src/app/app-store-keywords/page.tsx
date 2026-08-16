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
      "Difficulty, top apps, and observed position come from Apple's public iTunes Search API, queried from your browser. Popularity is Apple Ads official (relative 1–100) when the term appears in that storefront and genre, via a founder-owned Platform API v1 lookup — visitors never connect an Ads account. If Apple has no row, AppClimb falls back to the iTunes estimate.",
  },
  {
    question: "Is popularity the same as search volume?",
    answer:
      "No. Search volume (query counts) is still private. AppClimb shows Apple's official relative popularity (1–100) when available, or an iTunes estimate otherwise. The UI labels the source. Neither number is volume.",
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
              Every keyword gets an Apple Ads popularity score when available,
              an estimated difficulty score, and a 30-day trend. Free, no
              account, no invented volumes.
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
              <span>✅ Official Ads popularity when Apple has the term</span>
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
                <strong>Popularity</strong> is Apple&apos;s official relative
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
            <span className="marketing-eyebrow">Why not volume</span>
            <h2 className="marketing-section-heading">
              Official popularity is still not search volume. We say so.
            </h2>
            <p>
              Apple Ads Platform API v1 returns a relative 1–100 popularity
              score, not monthly query counts. Tools that show precise search
              volumes without a stated source are showing a model. AppClimb
              uses the official relative score when Apple has the term, falls
              back to a labeled iTunes estimate otherwise, and still shows the
              result count, top apps, and ratings behind difficulty.
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
