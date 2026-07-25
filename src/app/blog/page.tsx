import type { Metadata } from "next";
import { ArrowRight, BookOpen, CalendarDays } from "lucide-react";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing-shell";
import { ARTICLES } from "@/lib/site";

export const metadata: Metadata = {
  title: "Field Notes on iOS Subscription Growth",
  description:
    "Evidence-first guides for independent builders working on iOS subscription growth, analytics, conversion, and retention.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "AppClimb Field Notes",
    description:
      "Practical, source-aware guides for diagnosing iOS subscription growth.",
    url: "/blog",
    type: "website",
  },
};

export default function BlogPage() {
  return (
    <MarketingShell>
      <main className="blog-index">
        <section className="blog-index-hero marketing-container">
          <span className="marketing-eyebrow">AppClimb Field Notes</span>
          <h1>Understand the system before changing the metric.</h1>
          <p>
            Practical guides for independent iOS subscription app builders:
            source ownership, funnel diagnosis, conversion, retention, and
            evidence-based experiments.
          </p>
        </section>
        <section className="blog-index-grid marketing-container">
          {ARTICLES.map((article, index) => (
            <article
              key={article.slug}
              className={index === 0 ? "blog-card featured" : "blog-card"}
            >
              <div className="blog-card-icon">
                <BookOpen aria-hidden="true" />
              </div>
              <div className="blog-card-meta">
                <span>{article.category}</span>
                <span>
                  <CalendarDays size={13} aria-hidden="true" /> July 25, 2026
                </span>
              </div>
              <h2>
                <Link href={`/blog/${article.slug}`}>{article.title}</Link>
              </h2>
              <p>{article.description}</p>
              <Link href={`/blog/${article.slug}`} className="blog-card-link">
                Read the guide <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </article>
          ))}
          <article className="blog-card guide-card">
            <div className="blog-card-meta">
              <span>Definitive guide</span>
            </div>
            <h2>
              <Link href="/guides/ios-subscription-growth">
                The practical guide to iOS subscription growth
              </Link>
            </h2>
            <p>
              A complete framework for locating the earliest constraint across
              discovery, activation, paywalls, trials, paid conversion, and
              renewal.
            </p>
            <Link
              href="/guides/ios-subscription-growth"
              className="blog-card-link"
            >
              Open the guide <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </article>
        </section>
      </main>
    </MarketingShell>
  );
}
