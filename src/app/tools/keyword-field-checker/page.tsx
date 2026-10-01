import type { Metadata } from "next";
import { ArrowRight, BookOpen, Search, TrendingUp } from "lucide-react";
import Link from "next/link";

import { MetadataChecker } from "@/components/guide-tools";
import { MetadataAnatomy } from "@/components/guide-visuals";
import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { absoluteUrl } from "@/lib/site";

const PATH = "/tools/keyword-field-checker";
const TITLE = "App Store Keyword Field Checker";
const DESCRIPTION =
  "Free checker for your App Store app name (30 characters), subtitle (30), and keyword field (100): live character counts, repeated words, wasted spaces, every word Apple can match, and a one-click fix. No sign-up.";

export const metadata: Metadata = {
  title: `${TITLE} — Free Character Counter`,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    title: `${TITLE} — Free Character Counter`,
    description: DESCRIPTION,
    url: PATH,
    type: "website",
  },
};

const RULES = [
  "App name and subtitle: 30 characters each. Keyword field: 100.",
  "Commas only in the keyword field — a space after a comma costs a character.",
  "Never repeat a word from the name or subtitle; Apple already indexes it.",
  "Single words beat phrases: Apple combines words across all three fields.",
  "Skip “app” and your category name — Apple matches those already.",
  "One of singular or plural is usually enough in English.",
];

const FAQ = [
  {
    q: "How many characters is the App Store keyword field?",
    a: "100 characters. The app name and the subtitle get 30 characters each. All three are indexed for search, and the app name carries the most weight.",
  },
  {
    q: "Should I put spaces after the commas?",
    a: "No. Spaces count toward the 100 characters and add nothing — separate words with commas only, like todo,checklist,reminder.",
  },
  {
    q: "Should I repeat words from my app name or subtitle in the keyword field?",
    a: "No. Apple already indexes every word in the name and subtitle, so a second copy in the keyword field wastes room you could use for a new word.",
  },
  {
    q: "Single words or phrases?",
    a: "Single words, in most cases. Apple combines words from the name, subtitle, and keyword field into phrases, so “habit” in the name and “tracker” in the keyword field can still match “habit tracker”.",
  },
  {
    q: "How do I know which words are worth the space?",
    a: "Check each word’s demand and competition. AppClimb shows Apple’s official popularity score (1–100) and an estimated difficulty with its evidence for any keyword — click a word in the checker to open it.",
  },
  {
    q: "Does this checker send my metadata anywhere?",
    a: "No. It runs entirely in your browser. Nothing you type is uploaded or stored.",
  },
];

export default function KeywordFieldCheckerPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: TITLE,
          url: absoluteUrl(PATH),
          description: DESCRIPTION,
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "AppClimb", item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: TITLE, item: absoluteUrl(PATH) },
          ],
        }}
      />
      <main className="gd tl">
        <section className="tl-hero marketing-container">
          <p className="gd-eyebrow">Free ASO tool</p>
          <h1>App Store keyword field checker</h1>
          <p className="gd-lede">
            Paste your app name, subtitle, and keyword field. See the character counts, the words
            you&rsquo;re wasting, and every word Apple can match — then fix the keyword field in one
            click.
          </p>
          <p className="gd-meta">
            <span>No sign-up</span>
            <span>Runs in your browser</span>
            <span>Limits 30 · 30 · 100</span>
          </p>
        </section>

        <div className="tl-layout marketing-container">
          <div className="tl-tool">
            <MetadataChecker showIndex />
          </div>
          <aside className="tl-side" aria-labelledby="tl-rules">
            <h2 id="tl-rules">What the checker looks for</h2>
            <ul className="gd-rules">
              {RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <Link href="/" className="tl-side-cta">
              <Search size={18} aria-hidden="true" />
              <span>
                <strong>Which words are worth it?</strong>
                <small>Check Apple popularity and difficulty for any keyword — free.</small>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </aside>
        </div>

        <section className="tl-section marketing-container" aria-labelledby="tl-anatomy">
          <h2 id="tl-anatomy">Where each field counts</h2>
          <p>
            Apple reads three fields for search. The app name weighs the most, the keyword field is
            never shown to people — it exists only to be matched.
          </p>
          <MetadataAnatomy />
        </section>

        <section className="tl-section marketing-container" aria-labelledby="tl-faq">
          <h2 id="tl-faq">Questions</h2>
          <div className="tl-faq">
            {FAQ.map((item, index) => (
              <details key={item.q} open={index === 0}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="tl-section gd-next marketing-container" aria-labelledby="tl-next">
          <h2 id="tl-next">Next steps</h2>
          <div className="gd-next-grid">
            <Link href="/">
              <Search size={20} aria-hidden="true" />
              <strong>Check a keyword</strong>
              <span>Apple popularity, difficulty with its evidence, and a verdict. No sign-up.</span>
            </Link>
            <Link href="/keywords">
              <TrendingUp size={20} aria-hidden="true" />
              <strong>Browse top searches</strong>
              <span>Apple&rsquo;s most-searched and rising terms by country and category.</span>
            </Link>
            <Link href="/guides/keyword-research">
              <BookOpen size={20} aria-hidden="true" />
              <strong>Read the ASO guide</strong>
              <span>How to pick keywords you can actually rank for, step by step.</span>
            </Link>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
