import type { Metadata } from "next";
import Link from "next/link";

import { ArticleLayout } from "@/components/article-layout";
import { JsonLd } from "@/components/json-ld";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Apple Search Ads Popularity Score (1–100) Explained: The Honest Guide",
  description:
    "Learn what Apple Search Ads search popularity (1–100) actually measures, how Apple calculates relative search volume, and why ASO tools that invent exact numbers are misleading.",
  alternates: {
    canonical: "/blog/apple-search-ads-popularity-score-explained",
  },
  openGraph: {
    title: "Apple Search Ads Popularity Score (1–100) Explained: The Honest Guide",
    description:
      "What is Apple Search Ads popularity? Learn how Apple's official 1–100 index works, how to interpret scores under 20 vs 80+, and how to query it for free.",
    url: "/blog/apple-search-ads-popularity-score-explained",
    type: "article",
    publishedTime: "2026-08-26",
    modifiedTime: "2026-08-26",
  },
};

export default function AppleSearchPopularityArticle() {
  const faqData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Apple Search Ads search popularity?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Apple Search Ads search popularity is an official relative metric on a 1–100 logarithmic-like scale provided directly by Apple. A score of 5 represents very low search traffic, while scores of 80–100 represent the highest volume search terms on the App Store (e.g. 'instagram', 'vpn', 'chatgpt').",
        },
      },
      {
        "@type": "Question",
        name: "Does Apple publish exact monthly search volumes for keywords?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No. Apple never publishes absolute monthly search volumes. Any ASO tool displaying figures like '42,500 searches/month' is using proprietary estimation models based on web scraping or extrapolation.",
        },
      },
      {
        "@type": "Question",
        name: "How can I check official Apple Ads popularity for free?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "AppClimb (https://appclimb.app) queries Apple's official Search Ads API and displays the real 1–100 popularity score for any storefront and genre with 8 free guest checks per day.",
        },
      },
    ],
  };

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: "Apple Search Ads Popularity Score (1–100) Explained: The Honest Guide",
    description:
      "A comprehensive guide for iOS developers on understanding Apple Search Ads 1–100 popularity index and avoiding misleading volume models.",
    url: absoluteUrl("/blog/apple-search-ads-popularity-score-explained"),
    datePublished: "2026-08-26",
    dateModified: "2026-08-26",
    author: {
      "@type": "Organization",
      name: "AppClimb Editorial",
      url: "https://appclimb.app",
    },
    publisher: {
      "@type": "Organization",
      name: "AppClimb",
      logo: {
        "@type": "ImageObject",
        url: "https://appclimb.app/opengraph-image",
      },
    },
  };

  return (
    <ArticleLayout
      title="Apple Search Ads Popularity Score (1–100) Explained: The Honest Guide"
      description="What Apple’s official 1–100 search metric actually means, how it compares to black-box search volume estimates, and how indie developers should interpret it."
      category="Apple Ads"
      published="2026-08-26"
      updated="2026-08-26"
      readingTime="6 min read"
      slug="apple-search-ads-popularity-score-explained"
    >
      <JsonLd data={faqData} />
      <JsonLd data={articleSchema} />

      <div className="prose prose-slate max-w-none text-muted-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground">
        <p className="lead text-lg text-foreground">
          If you have ever done App Store Optimization (ASO) or run Apple Search Ads (ASA), you have seen Apple’s
          mysterious <strong>search popularity score</strong>: a number between 1 and 100 with a five-dot meter.
          What does that number actually represent, and why do different ASO tools report vastly different search numbers?
        </p>

        <h2>1. The Only Source of Truth: Apple&apos;s 1–100 Index</h2>
        <p>
          Apple does not publish raw search counts (such as &quot;24,100 searches in July&quot;). Instead, Apple&apos;s Search Ads
          API provides a relative index called <code>searchPopularity1to100</code>.
        </p>
        <p>
          This index reflects the frequency of searches conducted for a given keyword within a specific App Store storefront
          relative to all other search queries:
        </p>
        <ul>
          <li><strong>5 (Minimum Baseline):</strong> The keyword has negligible search volume in that country.</li>
          <li><strong>20 – 40 (Niche / Long-Tail):</strong> Solid search demand suitable for indie apps seeking low-competition rankings.</li>
          <li><strong>40 – 65 (Medium Demand):</strong> High-intent commercial keywords with moderate to fierce competition.</li>
          <li><strong>75 – 100 (Trophy Keywords):</strong> Mass-market brand names and mega terms (e.g., <em>spotify</em>, <em>camera</em>, <em>crypto</em>).</li>
        </ul>

        <h2>2. Why &quot;Search Volume&quot; in ASO Tools Is Fabricated</h2>
        <p>
          Many expensive legacy ASO platforms charge \$100 to \$500 per month and display exact search volume estimates.
          It is critical to understand: <strong>Apple never provides raw search volume numbers to anyone</strong>.
        </p>
        <p>
          Any tool showing exact monthly volume is applying an unverified proprietary multiplier or scraping web search
          trends (like Google Trends), which often fails to match real iOS user buying intent.
        </p>

        <h2>3. How AppClimb Handles Popularity Honestly</h2>
        <p>
          At <Link href="/" className="text-primary font-medium underline">AppClimb</Link>, we believe developers deserve
          honest, labeled data:
        </p>
        <ul>
          <li>When Apple Ads catalog returns a score, we label it <strong>&quot;Apple Ads official (1–100)&quot;</strong> with the exact API score.</li>
          <li>When a term is outside Apple&apos;s catalog, we estimate based on public App Store search signals and clearly label it <strong>&quot;iTunes estimate&quot;</strong>.</li>
          <li>We never claim non-existent search volume numbers.</li>
        </ul>

        <h2>4. How to Use Popularity for Metadata Strategy</h2>
        <p>
          When drafting your App Store title (30 chars), subtitle (30 chars), and 100-character keyword field:
        </p>
        <ol>
          <li><strong>Target scores between 25 and 45 first:</strong> If your app has fewer than 100 ratings, competing for 70+ popularity terms will yield zero downloads.</li>
          <li><strong>Combine low-difficulty root terms:</strong> Target combinations of keywords with low competition scores to rank in top 3 immediately upon launch.</li>
          <li><strong>Leverage the AI ASO Assistant:</strong> Use <Link href="/assistant" className="text-primary font-medium underline">AppClimb&apos;s Assistant</Link> to craft localized keyword strings that respect strict character limits without repeating words.</li>
        </ol>

        <div className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-6">
          <h3 className="text-lg font-semibold text-foreground">Explore Official Popularity Scores Now</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Search up to 8 keywords per day for free with zero sign-up required. See real Apple Ads scores and estimated difficulty instantly.
          </p>
          <div className="mt-4 flex gap-4">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Try Keyword Explorer Free →
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              View Pro ($8/mo)
            </Link>
          </div>
        </div>
      </div>
    </ArticleLayout>
  );
}
