import type { Metadata } from "next";
import { ArrowRight, Compass, Search } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "The Practical Guide to App Store Keyword Research",
  description:
    "A source-aware framework for finding keywords worth ranking for: search, estimate popularity and difficulty, track trends, and iterate.",
  alternates: {
    canonical: "/guides/keyword-research",
  },
  openGraph: {
    title: "The Practical Guide to App Store Keyword Research",
    description:
      "Find keywords worth ranking for without paying for data you cannot verify.",
    url: "/guides/keyword-research",
    type: "article",
    publishedTime: "2026-07-25",
    modifiedTime: "2026-08-02",
  },
};

const guideSections = [
  { id: "model", label: "1. Model the search funnel" },
  { id: "data", label: "2. Know what is public" },
  { id: "scores", label: "3. Read popularity & difficulty" },
  { id: "list", label: "4. Build a balanced list" },
  { id: "track", label: "5. Track and iterate" },
  { id: "weekly", label: "6. Run the weekly loop" },
] as const;

export default function KeywordResearchGuide() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "The Practical Guide to App Store Keyword Research",
          description:
            "A source-aware framework for finding App Store keywords worth ranking for.",
          datePublished: "2026-07-25",
          dateModified: "2026-08-02",
          url: absoluteUrl("/guides/keyword-research"),
          mainEntityOfPage: absoluteUrl("/guides/keyword-research"),
          author: {
            "@type": "Organization",
            name: "AppClimb",
            url: absoluteUrl("/about"),
          },
          publisher: {
            "@type": "Organization",
            name: "AppClimb",
            url: absoluteUrl("/"),
          },
          proficiencyLevel: "Beginner to advanced",
          about: [
            "App Store keyword research",
            "ASO",
            "keyword popularity",
            "keyword difficulty",
          ],
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How to Perform App Store Keyword Research",
          description:
            "A source-aware framework for finding App Store keywords worth ranking for.",
          step: [
            {
              "@type": "HowToStep",
              name: "Model the search funnel",
              text: "Understand user search intent and how App Store search leads to app views and installs.",
              url: absoluteUrl("/guides/keyword-research#model"),
            },
            {
              "@type": "HowToStep",
              name: "Inspect public signals",
              text: "Query public iTunes Search results to check total app counts and top incumbent ratings.",
              url: absoluteUrl("/guides/keyword-research#data"),
            },
            {
              "@type": "HowToStep",
              name: "Evaluate Popularity & Difficulty",
              text: "Compare estimated demand against competition barrier to select achievable target terms.",
              url: absoluteUrl("/guides/keyword-research#scores"),
            },
            {
              "@type": "HowToStep",
              name: "Track daily rank snapshots",
              text: "Record local daily snapshots to measure real rank trends over 30 days.",
              url: absoluteUrl("/guides/keyword-research#track"),
            },
          ],
        }}
      />
      <main className="guide-page">
        <section className="guide-hero marketing-container">
          <div>
            <span className="marketing-eyebrow">
              Definitive field guide · August 2026
            </span>
            <h1>The practical guide to App Store keyword research.</h1>
            <p>
              A complete, source-aware method for turning public App Store data
              into a keyword list your app can actually rank for.
            </p>
            <div className="article-meta">
              <span>By the AppClimb product team</span>
              <span>12 min read</span>
              <span>Last updated August 2, 2026</span>
            </div>
          </div>
          <div className="guide-hero-card">
            <Compass aria-hidden="true" />
            <strong>Core principle</strong>
            <p>
              Pick keywords by balancing estimated demand against estimated
              difficulty — and always prefer a term whose numbers you can
              verify over a precise-looking number with no source.
            </p>
          </div>
        </section>

        <div className="guide-layout marketing-container">
          <nav className="guide-toc" aria-label="Guide sections">
            <strong>In this guide</strong>
            {guideSections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
            <Link href="/">
              Open the explorer <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </nav>

          <article className="article-body guide-body">
            <p className="article-answer">
              App Store keyword research is the search for terms that sit in
              the sweet spot: popular enough that ranking for them brings
              installs, but not so contested that a small app has no chance.
              Because true search volume is private to Apple, good research
              relies on estimates it can verify — and on a repeatable process
              that turns today&apos;s snapshot into tomorrow&apos;s decision.
            </p>

            <section id="model">
              <span className="guide-step">Step 1</span>
              <h2>Model the search funnel</h2>
              <p>
                Before picking keywords, understand the journey one search
                creates:
              </p>
              <ul className="guide-stage-list">
                <li>
                  <strong>Query</strong> — a shopper types a term; the App
                  Store decides which apps are relevant.
                </li>
                <li>
                  <strong>Impression</strong> — your app appears in results;
                  relevance of title, subtitle, and keyword field decides this.
                </li>
                <li>
                  <strong>Tap</strong> — the result convinces the shopper to
                  open the product page (icon, title, rating, screenshots).
                </li>
                <li>
                  <strong>Install</strong> — the page converts. Weak conversion
                  here is a listing problem, not a keyword problem.
                </li>
              </ul>
              <p>
                Keyword research optimizes the first two steps. If your
                impressions are healthy but installs are weak, fix the listing
                before adding more keywords — otherwise you are filling a leaky
                funnel.
              </p>
            </section>

            <section id="data">
              <span className="guide-step">Step 2</span>
              <h2>Know what data is public</h2>
              <p>
                Everything below is available for free from Apple&apos;s public
                interfaces — and everything else is not:
              </p>
              <ul className="guide-check-list">
                <li>
                  <CheckIcon /> Which apps rank for a keyword, in order
                  (iTunes Search API, top 200).
                </li>
                <li>
                  <CheckIcon /> Result density: how many apps compete, and
                  whether the list hits the 200-app cap.
                </li>
                <li>
                  <CheckIcon /> Incumbent strength: ratings count and average
                  rating of the top results.
                </li>
                <li>
                  <CheckIcon /> Related phrases from app metadata and genres.
                </li>
              </ul>
              <div className="article-callout">
                <strong>What is NOT public</strong>
                <p>
                  Real search volume, impression share, and competitive
                  keyword spend exist only inside Apple&apos;s paid Search Ads
                  API. Any tool claiming free precise volume is modeling — the
                  only question is whether it tells you.
                </p>
              </div>
              <p>
                This is why{" "}
                <Link href="/">
                  AppClimb&apos;s keyword explorer
                </Link>{" "}
                labels its scores as estimates and always shows the underlying
                evidence next to the number.
              </p>
            </section>

            <section id="scores">
              <span className="guide-step">Step 3</span>
              <h2>Read popularity and difficulty</h2>
              <p>
                Two directional scores summarize each keyword:
              </p>
              <ul>
                <li>
                  <strong>Popularity (0–100)</strong> — estimated demand. How
                  much competition pressure and top-result strength suggest the
                  term is actively searched. A saturated result list with
                  strong incumbents implies an active term.
                </li>
                <li>
                  <strong>Difficulty (0–100)</strong> — estimated barrier. How
                  hard it looks to reach the top results: how many apps
                  compete, how many ratings the incumbents hold, and whether
                  mega-brands dominate the first page.
                </li>
              </ul>
              <p>How to read the combination:</p>
              <div className="guide-question-grid">
                <div>
                  <strong>High popularity + low difficulty</strong>
                  <p>Best case — but rare and contested by everyone.</p>
                </div>
                <div>
                  <strong>High popularity + high difficulty</strong>
                  <p>
                    Only chase if you have an unfair advantage (unique brand,
                    huge rating base).
                  </p>
                </div>
                <div>
                  <strong>Low popularity + low difficulty</strong>
                  <p>
                    Long-tail territory: few searches, but you can rank quickly
                    and they convert well.
                  </p>
                </div>
                <div>
                  <strong>Low popularity + high difficulty</strong>
                  <p>
                    Skip. A term nobody searches that is also hard is pure
                    waste.
                  </p>
                </div>
              </div>
              <p>
                Scores are directional, not oracle numbers. Countries and
                seasons shift them — which is why tracking beats one-time
                analysis.
              </p>
            </section>

            <section id="list">
              <span className="guide-step">Step 4</span>
              <h2>Build a balanced list</h2>
              <p>A healthy keyword list mixes reach and safety:</p>
              <ol>
                <li>
                  <strong>Start with your product&apos;s core nouns.</strong>{" "}
                  What would a user type to find your app? Search each one and
                  record the scores.
                </li>
                <li>
                  <strong>Add category phrases.</strong>{" "}
                  Your genre plus the
                  core noun (&quot;meditation timer&quot;, &quot;invoice
                  scanner&quot;).
                </li>
                <li>
                  <strong>Harvest related keywords.</strong> Open the top apps
                  for a strong term — their titles and genres are your
                  suggestion engine.
                </li>
                <li>
                  <strong>Check competitors&apos; titles.</strong> Terms your
                  competitors rank for that you are missing.
                </li>
                <li>
                  <strong>Localize.</strong> Run the same research per
                  storefront; keywords that are easy in the US can be crowded
                  in Germany and vice versa.
                </li>
              </ol>
              <p>
                Aim for a working list of 30–50 terms: a few high-reach bets, a
                middle band, and a long tail you expect to win fast.
              </p>
            </section>

            <section id="track">
              <span className="guide-step">Step 5</span>
              <h2>Track and iterate</h2>
              <p>
                A keyword decision is only as good as its trend. AppClimb
                records one snapshot per keyword per day in your browser; the
                first check seeds an estimated 30-day baseline, and every visit
                replaces estimates with real observations.
              </p>
              <ul>
                <li>
                  Re-check your list after every metadata or release update —
                  relevance changes move rankings.
                </li>
                <li>
                  Watch popularity drift: a term can cool off in weeks.
                </li>
                <li>
                  Watch difficulty drift: a new mega-app can land in the top 10
                  and change the game overnight.
                </li>
                <li>
                  Keep history even for dropped keywords — they often cycle
                  back.
                </li>
              </ul>
            </section>

            <section id="weekly">
              <span className="guide-step">Step 6</span>
              <h2>Run the weekly loop</h2>
              <ol>
                <li>Refresh your tracked keywords (one pass, a few minutes).</li>
                <li>Note any term whose popularity or difficulty moved by 10+ points.</li>
                <li>Check the top apps behind the changed terms — the why is usually visible.</li>
                <li>Pick one metadata change (title, subtitle, or keyword field) with the strongest evidence.</li>
                <li>Ship it, wait a week, compare the trend. Keep what worked.</li>
              </ol>
              <p>
                The loop is deliberately small. Consistency beats occasional
                deep-dives, and real history beats any one-time audit.
              </p>
            </section>

            <div className="marketing-final-cta">
              <h2>Start with one search.</h2>
              <p>
                Free plan with honest limits, estimates labeled honestly.
              </p>
              <Link href="/" className="marketing-primary-action large">
                <Search size={17} aria-hidden="true" /> Open the keyword explorer
              </Link>
            </div>
          </article>
        </div>
      </main>
    </MarketingShell>
  );
}

function CheckIcon() {
  return (
    <span aria-hidden="true" style={{ color: "var(--teal-500)", fontWeight: 700 }}>
      ✓
    </span>
  );
}
