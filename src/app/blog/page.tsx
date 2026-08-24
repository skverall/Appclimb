import type { Metadata } from "next";
import { ArrowRight, BookOpen, CalendarDays } from "lucide-react";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing-shell";
import { ARTICLES, SITE_UPDATED } from "@/lib/site";

export const metadata: Metadata = {
  title: "Field Notes on App Store Keywords and ASO",
  description:
    "Practical notes for indie app builders: what App Store keyword data is public, how popularity and difficulty estimates work, and how to earn installs from search.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: "AppClimb Field Notes",
    description:
      "Practical notes on App Store search, keyword research, and ASO.",
    url: "/blog",
    type: "website",
  },
};

const updatedDate = new Date(`${SITE_UPDATED}T12:00:00Z`).toLocaleDateString(
  "en-US",
  { year: "numeric", month: "long", day: "numeric" },
);

export default function BlogPage() {
  return (
    <MarketingShell>
      <main className="blog-index">
        <section className="blog-index-hero marketing-container">
          <span className="marketing-eyebrow">AppClimb Field Notes</span>
          <h1>Understand App Store search before picking keywords.</h1>
          <p>
            Practical notes for independent app builders: what keyword data is
            public, how popularity and difficulty are estimated, and how to
            build a keyword list that earns installs.
          </p>
        </section>
        <section className="blog-index-grid marketing-container">
          {ARTICLES.map((article) => (
            <article key={article.slug} className="blog-card">
              <div className="blog-card-icon">
                <BookOpen aria-hidden="true" />
              </div>
              <div className="blog-card-meta">
                <span>{article.category}</span>
                <span>
                  <CalendarDays size={13} aria-hidden="true" /> {updatedDate}
                </span>
              </div>
              <h2>
                <Link href={`/blog/${article.slug}`}>{article.title}</Link>
              </h2>
              <p>{article.description}</p>
              <Link href={`/blog/${article.slug}`} className="blog-card-link">
                Read the note <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </article>
          ))}
          <article className="blog-card guide-card">
            <div className="blog-card-meta">
              <span>Definitive guide</span>
            </div>
            <h2>
              <Link href="/guides/keyword-research">
                The practical guide to App Store keyword research
              </Link>
            </h2>
            <p>
              A complete framework for finding keywords worth ranking for:
              search, estimate popularity and difficulty, track trends, and
              iterate.
            </p>
            <Link href="/guides/keyword-research" className="blog-card-link">
              Open the guide <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </article>
        </section>
      </main>
    </MarketingShell>
  );
}
