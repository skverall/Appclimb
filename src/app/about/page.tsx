import type { Metadata } from "next";
import { ArrowRight, Eye, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "About AppClimb",
  description:
    "Why AppClimb leads with official Apple Ads popularity instead of unexplained search volume — free, labeled, no account.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About AppClimb",
    description:
      "The product direction, principles, and honest status behind AppClimb's App Store keyword explorer.",
    url: "/about",
  },
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About AppClimb",
          url: absoluteUrl("/about"),
          description:
            "AppClimb is a free App Store keyword explorer that leads with official Apple Ads popularity.",
          mainEntity: {
            "@id": "https://appclimb.app/#organization",
          },
        }}
      />
      <main className="about-page">
        <section className="about-hero marketing-container">
          <span className="marketing-eyebrow">Why AppClimb exists</span>
          <h1>Keyword tools hide their data. We show Apple&apos;s.</h1>
          <p>
            Paid ASO tools sell &ldquo;search volume&rdquo; with no source. AppClimb
            leads with Apple&apos;s official Ads popularity (relative 1–100)
            when the term is in that storefront and genre — labeled on every
            row. Difficulty stays an estimate from public iTunes results. Free,
            no account.
          </p>
        </section>

        <section className="about-principles marketing-container">
          <article className="about-principle-card">
            <div className="about-card-icon">
              <Eye aria-hidden="true" size={22} />
            </div>
            <h2>No visitor account</h2>
            <p>
              Difficulty and top apps come from the public iTunes Search API,
              queried from your browser. Official popularity uses a
              founder-owned Apple Ads Insights key on the server. You never
              connect Ads or create an AppClimb account.
            </p>
          </article>
          <article className="about-principle-card">
            <div className="about-card-icon">
              <ShieldCheck aria-hidden="true" size={22} />
            </div>
            <h2>Apple Ads popularity, labeled</h2>
            <p>
              Popularity is Apple&apos;s official relative 1–100 score when
              Apple has the term. Otherwise we show a labeled iTunes estimate.
              Difficulty is always estimated. We never invent monthly search
              volume.
            </p>
          </article>
          <article className="about-principle-card">
            <div className="about-card-icon">
              <Sparkles aria-hidden="true" size={22} />
            </div>
            <h2>No account, no tracking</h2>
            <p>
              Your keyword list and history live in your browser. There is no
              login, no billing, and no analytics collection on this site.
            </p>
          </article>
        </section>

        <section className="marketing-container">
          <div className="about-story-card">
            <div className="about-story-header">
              <span className="marketing-eyebrow">Initial focus</span>
              <h2>One honest App Store keyword tool first.</h2>
            </div>
            <div className="about-story-content">
              <p>
                AppClimb starts with independent developers and micro-teams who
                publish iOS apps and need to pick keywords without paying for a
                data subscription they can&apos;t verify.
              </p>
              <p>
                The tool records one daily snapshot per keyword in your browser,
                so a 30-day trend builds itself over time — and the first check
                gets an estimated baseline so the chart is useful immediately.
              </p>
            </div>
          </div>
        </section>

        <section className="about-status-section">
          <div className="marketing-container about-status-inner">
            <span className="marketing-eyebrow">Current status</span>
            <h2>The keyword explorer is live and free.</h2>
            <p>
              Official Apple Ads popularity when Apple has the term, estimated
              difficulty, 30-day trend charts, related keywords, and top-app
              breakdowns. No visitor accounts, no billing, no tracking.
            </p>
            <div className="marketing-hero-actions">
              <Link href="/" className="marketing-primary-action large">
                Search keywords <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a
                href="https://github.com/skverall/Appclimb"
                target="_blank"
                rel="noreferrer"
                className="marketing-secondary-action large"
              >
                View GitHub
              </a>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
