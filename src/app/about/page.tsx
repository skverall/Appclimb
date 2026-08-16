import type { Metadata } from "next";
import { ArrowRight, Eye, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "About AppClimb",
  description:
    "Why AppClimb is building a free, honest App Store keyword tool on public data — no invented volumes, no dark patterns.",
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
            "AppClimb is a free App Store keyword explorer built on public data.",
          mainEntity: {
            "@id": "https://appclimb.app/#organization",
          },
        }}
      />
      <main className="about-page">
        <section className="about-hero marketing-container">
          <span className="marketing-eyebrow">Why AppClimb exists</span>
          <h1>Keyword tools hide their data. We show ours.</h1>
          <p>
            Every serious ASO tool sells &ldquo;search volume&rdquo; — but true App Store
            query counts stay inside Apple Ads. AppClimb is a free keyword
            explorer: official Apple Ads popularity (relative 1–100) when the
            term is in that storefront and genre, estimated difficulty from
            public iTunes data, and a source label on every score.
          </p>
        </section>

        <section className="about-principles marketing-container">
          <article>
            <Eye aria-hidden="true" />
            <h2>No visitor account</h2>
            <p>
              Difficulty and top apps come from the public iTunes Search API,
              queried from your browser. Official popularity uses a
              founder-owned Apple Ads Insights key on the server. You never
              connect Ads or create an AppClimb account.
            </p>
          </article>
          <article>
            <ShieldCheck aria-hidden="true" />
            <h2>Estimates, never invented volumes</h2>
            <p>
              Popularity and difficulty are derived from competition pressure
              and top-result strength. They are clearly labeled as estimates and
              never presented as Apple Ads data.
            </p>
          </article>
          <article>
            <Sparkles aria-hidden="true" />
            <h2>No account, no tracking</h2>
            <p>
              Your keyword list and history live in your browser. There is no
              login, no billing, and no analytics collection on this site.
            </p>
          </article>
        </section>

        <section className="about-story marketing-container">
          <div>
            <span className="marketing-eyebrow">Initial focus</span>
            <h2>One honest App Store keyword tool first.</h2>
          </div>
          <div>
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
        </section>

        <section className="about-status">
          <div className="marketing-container">
            <span className="marketing-eyebrow">Current status</span>
            <h2>The keyword explorer is live and free.</h2>
            <p>
              Keyword search, Apple Ads popularity when available, estimated
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
                className="marketing-secondary-action"
              >
                View the technical foundation
              </a>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
