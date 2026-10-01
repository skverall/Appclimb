import type { Metadata } from "next";
import { ArrowRight, Bot, ListChecks, Search, TrendingUp } from "lucide-react";
import Link from "next/link";

import { GuideToc, MetadataChecker } from "@/components/guide-tools";
import {
  ListMix,
  MetadataAnatomy,
  PageOneEvidence,
  PopularityScale,
  SearchFunnel,
  VerdictMatrix,
  WeeklyLoop,
} from "@/components/guide-visuals";
import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { absoluteUrl } from "@/lib/site";

const PUBLISHED = "2026-07-25";
const MODIFIED = "2026-10-01";

export const metadata: Metadata = {
  title: "The Practical Guide to App Store Keyword Research",
  description:
    "How to find App Store keywords you can actually rank for: read Apple's popularity score, judge difficulty from page one, pick with a simple matrix, write metadata that indexes, and track weekly.",
  alternates: {
    canonical: "/guides/keyword-research",
  },
  openGraph: {
    title: "The Practical Guide to App Store Keyword Research",
    description:
      "Apple's popularity score, difficulty you can see, a verdict matrix, metadata rules, and a weekly loop — with diagrams and a live metadata checker.",
    url: "/guides/keyword-research",
    type: "article",
    publishedTime: PUBLISHED,
    modifiedTime: MODIFIED,
  },
};

const SECTIONS = [
  { id: "search", label: "How App Store search works" },
  { id: "popularity", label: "Read Apple’s popularity score" },
  { id: "difficulty", label: "Judge difficulty from page one" },
  { id: "verdict", label: "Pick with the verdict matrix" },
  { id: "list", label: "Build a balanced list" },
  { id: "metadata", label: "Write metadata that indexes" },
  { id: "track", label: "Track and iterate weekly" },
] as const;

const STEP_SUMMARIES: Record<(typeof SECTIONS)[number]["id"], string> = {
  search: "Keywords decide whether you appear; your product page decides whether people install.",
  popularity: "Apple’s official 1–100 score for each category’s top searches; anything below is long tail.",
  difficulty: "Look at who holds page one: their ratings, whether the term is in their name, and big brands.",
  verdict: "Target real demand with a beatable page one; collect long-tail wins; skip what’s dominated.",
  list: "30–50 terms: a few reach bets, a middle band, and a long tail you can win now.",
  metadata: "Name, subtitle, and keyword field — no repeated words, no wasted characters.",
  track: "Check ranks weekly, change one thing at a time, and judge it after one to two weeks.",
};

const CHEAT_SHEET = [
  "Only Apple’s popularity score is real demand data — and it is relative, not search volume.",
  "“≤45 · Long tail” means below Apple’s published list: little traffic, often an easy first rank.",
  "Difficulty is an estimate: open page one and look at ratings and names before you trust it.",
  "Start with “Worth targeting” and “Long-tail win”; skip “Dominated” unless it’s your brand.",
  "Never repeat a word across name, subtitle, and keyword field. Commas, no spaces.",
  "One metadata change per update; judge it after 1–2 weeks of daily ranks.",
];

export default function KeywordResearchGuide() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "The Practical Guide to App Store Keyword Research",
          description:
            "How to find App Store keywords you can actually rank for, with Apple's popularity score, visible difficulty, and a weekly loop.",
          datePublished: PUBLISHED,
          dateModified: MODIFIED,
          url: absoluteUrl("/guides/keyword-research"),
          mainEntityOfPage: absoluteUrl("/guides/keyword-research"),
          author: { "@type": "Organization", name: "AppClimb", url: absoluteUrl("/about") },
          publisher: { "@type": "Organization", name: "AppClimb", url: absoluteUrl("/") },
          proficiencyLevel: "Beginner to advanced",
          about: ["App Store keyword research", "ASO", "keyword popularity", "keyword difficulty"],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How to do App Store keyword research",
          description: "A seven-step method for finding App Store keywords your app can rank for.",
          step: SECTIONS.map((section) => ({
            "@type": "HowToStep",
            name: section.label,
            text: STEP_SUMMARIES[section.id],
            url: absoluteUrl(`/guides/keyword-research#${section.id}`),
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "AppClimb", item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Keyword Research Guide", item: absoluteUrl("/guides/keyword-research") },
          ],
        }}
      />
      <main className="gd">
        <section className="gd-hero marketing-container">
          <div className="gd-hero-text">
            <p className="gd-eyebrow">ASO guide · updated October 2026</p>
            <h1>The practical guide to App Store keyword research.</h1>
            <p className="gd-lede">
              How to find keywords your app can actually rank for — using Apple&rsquo;s own popularity
              data, difficulty you can check with your own eyes, and a loop that takes ten minutes a week.
            </p>
            <p className="gd-meta">
              <span>By the AppClimb team</span>
              <span>10 min read</span>
              <span>7 steps</span>
            </p>
            <div className="gd-hero-actions">
              <a href="#search" className="gd-btn gd-btn--primary gd-btn--lg">
                Start reading <ArrowRight size={16} aria-hidden="true" />
              </a>
              <Link href="/" className="gd-btn gd-btn--lg">
                <Search size={16} aria-hidden="true" /> Try a keyword
              </Link>
            </div>
          </div>
          <ol className="gd-hero-steps" aria-label="The method in seven steps">
            {SECTIONS.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{section.label}</strong>
                    <small>{STEP_SUMMARIES[section.id]}</small>
                  </div>
                </a>
              </li>
            ))}
          </ol>
        </section>

        <div className="gd-layout marketing-container">
          <aside className="gd-aside">
            <GuideToc sections={SECTIONS} />
            <Link href="/" className="gd-aside-cta">
              <Search size={15} aria-hidden="true" />
              <span>
                <strong>Check a keyword</strong>
                <small>Apple popularity, difficulty, verdict</small>
              </span>
            </Link>
          </aside>

          <article className="gd-body">
            <p className="gd-answer">
              App Store keyword research is the hunt for search terms people really type that your app can
              reach page one for. Apple now publishes an official popularity score for each category&rsquo;s
              most-searched terms, so demand no longer has to be guessed. Difficulty still does, which is
              why you check it against the apps that hold page one today.
            </p>

            <section id="search" className="gd-step">
              <p className="gd-step-num">Step 1</p>
              <h2>How App Store search works</h2>
              <p>
                Every install from search goes through four steps. Keyword work wins the first two: being
                relevant enough to appear, and high enough to be seen. The last two are your product
                page&rsquo;s job.
              </p>
              <SearchFunnel />
              <p>
                If people see your app but don&rsquo;t install it, more keywords won&rsquo;t help. Fix the
                icon, screenshots, and reviews first, then come back to keywords.
              </p>
            </section>

            <section id="popularity" className="gd-step">
              <p className="gd-step-num">Step 2</p>
              <h2>Read Apple&rsquo;s popularity score</h2>
              <p>
                Apple Ads publishes, every week and for every storefront, the most-searched terms in each
                category with a popularity score from 1 to 100. It&rsquo;s the only demand number that
                comes from Apple, and AppClimb shows it on every keyword, with up to a year of weekly
                history.
              </p>
              <PopularityScale />
              <ul className="gd-points">
                <li>
                  <strong>It&rsquo;s relative.</strong>{" "}70 means far more searches than 40, but Apple
                  doesn&rsquo;t say how many. Any tool showing a precise &ldquo;search volume&rdquo; is
                  modelling it.
                </li>
                <li>
                  <strong>The long tail is honest, not missing.</strong>{" "}A term below Apple&rsquo;s list is
                  shown as &ldquo;≤45&rdquo;: at or below the category&rsquo;s lowest published score. Low
                  traffic, but often the easiest first ranks.
                </li>
                <li>
                  <strong>Watch the history.</strong>{" "}Seasonal terms look dead in summer and huge in
                  December. A year of weekly data shows the pattern before you commit.
                </li>
              </ul>
              <p className="gd-try">
                See what people search in your category this week:{" "}
                <Link href="/keywords">top App Store searches by country and category</Link>.
              </p>
            </section>

            <section id="difficulty" className="gd-step">
              <p className="gd-step-num">Step 3</p>
              <h2>Judge difficulty from page one</h2>
              <p>
                Nobody outside Apple knows exactly how ranking works, so difficulty is always an estimate.
                Make it a good one by looking at the evidence: the apps that rank for the term today.
              </p>
              <PageOneEvidence />
              <ul className="gd-points">
                <li>
                  <strong>Rating weight, by position.</strong>{" "}Thousands of ratings at #1–#3 are harder to
                  pass than the same total spread lower down.
                </li>
                <li>
                  <strong>The term in their name.</strong>{" "}When most of page one has the exact term in the
                  app name, Apple sees strong relevance. You&rsquo;ll need it in yours too.
                </li>
                <li>
                  <strong>Big brands and brand searches.</strong>{" "}If people type a term to find one specific
                  app, nobody else wins it. AppClimb marks those as dominated.
                </li>
                <li>
                  <strong>The weakest app on page one.</strong>{" "}One app with a few hundred ratings in the top
                  10 means the door is open, whatever the average says.
                </li>
              </ul>
            </section>

            <section id="verdict" className="gd-step">
              <p className="gd-step-num">Step 4</p>
              <h2>Pick with the verdict matrix</h2>
              <p>
                Put popularity and difficulty together and every keyword lands in one of four places.
                AppClimb gives each keyword this verdict, so you can sort a list in seconds.
              </p>
              <VerdictMatrix />
              <p>
                New apps win fastest in the bottom row: real demand with a beatable page one, and long-tail
                terms nobody defends. Climbing those earns the ratings and relevance that later unlock the
                competitive terms.
              </p>
            </section>

            <section id="list" className="gd-step">
              <p className="gd-step-num">Step 5</p>
              <h2>Build a balanced list</h2>
              <p>Treat your keywords like a portfolio, not a wish list.</p>
              <ListMix />
              <ol className="gd-numbered">
                <li>
                  <strong>Start with the words you&rsquo;d use.</strong>{" "}What would someone type to find
                  your app? Check each one.
                </li>
                <li>
                  <strong>Expand with Apple&rsquo;s own list.</strong>{" "}Related searches and autocomplete
                  come straight from Apple&rsquo;s published terms, so every idea has real demand behind it.
                </li>
                <li>
                  <strong>Read page one.</strong>{" "}The names and subtitles of apps that rank are a free list
                  of terms that work in your niche.
                </li>
                <li>
                  <strong>Catch what&rsquo;s rising.</strong>{" "}Terms climbing in your category this month are
                  cheap to win before everyone notices.
                </li>
                <li>
                  <strong>Repeat per storefront.</strong>{" "}A term that&rsquo;s easy in the US can be crowded in
                  Germany, and the other way round.
                </li>
              </ol>
            </section>

            <section id="metadata" className="gd-step">
              <p className="gd-step-num">Step 6</p>
              <h2>Write metadata that indexes</h2>
              <p>
                Apple reads three fields for search. Every word you put there should earn its place.
              </p>
              <MetadataAnatomy />
              <ul className="gd-rules">
                <li>Put your most important keyword in the app name — it carries the most weight.</li>
                <li>Never repeat a word across the three fields; a second copy adds nothing.</li>
                <li>Keyword field: single words, commas, no spaces. Apple combines them into phrases.</li>
                <li>One of singular or plural is usually enough. Skip “app”, “free”, and your category.</li>
                <li>Many storefronts also index an extra language (the US store reads Spanish (Mexico) too) — more room for words.</li>
                <li>Name, subtitle, and keywords only change with an app update. Plan them together.</li>
              </ul>
              <MetadataChecker />
            </section>

            <section id="track" className="gd-step">
              <p className="gd-step-num">Step 7</p>
              <h2>Track and iterate weekly</h2>
              <p>
                A keyword decision is a bet; tracking tells you if it paid. Keep the loop small enough that
                you actually run it.
              </p>
              <WeeklyLoop />
              <ul className="gd-points">
                <li>
                  <strong>Real ranks only.</strong>{" "}Check positions on real days and keep those snapshots.
                  A smooth line that was filled in for you is a guess, not history.
                </li>
                <li>
                  <strong>One change at a time.</strong>{" "}Change the name and the keyword field together and
                  you won&rsquo;t know which one worked.
                </li>
                <li>
                  <strong>Give it time.</strong>{" "}Ranks settle over one to two weeks after an update. Judge
                  the trend, not the first day.
                </li>
              </ul>
            </section>

            <section className="gd-cheat" aria-labelledby="gd-cheat">
              <h2 id="gd-cheat">
                <ListChecks size={20} aria-hidden="true" /> The cheat sheet
              </h2>
              <ul>
                {CHEAT_SHEET.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            <section className="gd-next" aria-labelledby="gd-next">
              <h2 id="gd-next">Put it to work</h2>
              <div className="gd-next-grid">
                <Link href="/">
                  <Search size={20} aria-hidden="true" />
                  <strong>Check a keyword</strong>
                  <span>Apple popularity, difficulty with its evidence, and a verdict. Free, no sign-up.</span>
                </Link>
                <Link href="/keywords">
                  <TrendingUp size={20} aria-hidden="true" />
                  <strong>Browse top searches</strong>
                  <span>Apple&rsquo;s most-searched and rising terms by country and category.</span>
                </Link>
                <Link href="/assistant">
                  <Bot size={20} aria-hidden="true" />
                  <strong>Ask the assistant</strong>
                  <span>Keyword ideas checked against Apple data, and metadata that fits the limits.</span>
                </Link>
              </div>
            </section>
          </article>
        </div>
      </main>
    </MarketingShell>
  );
}
