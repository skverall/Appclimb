import type { Metadata } from "next";
import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import { ArticleLayout } from "@/components/article-layout";

export const metadata: Metadata = {
  title: "What App Store Keyword Data Is Public (and What Isn't)",
  description:
    "A source-of-truth map of App Store search data: what Apple publishes, what only Apple Ads shows, and how estimates are made honestly.",
  alternates: {
    canonical: "/blog/ios-subscription-analytics-stack",
  },
  openGraph: {
    title: "What App Store Keyword Data Is Public",
    description:
      "Which keyword signals are public, which live only inside Apple Search Ads, and how honest estimates are built.",
    url: "/blog/ios-subscription-analytics-stack",
    type: "article",
    publishedTime: "2026-07-25",
    modifiedTime: "2026-08-02",
  },
};

const sourceLinkClass = "article-source-link";

export default function AnalyticsStackArticle() {
  return (
    <ArticleLayout
      title="What App Store Keyword Data Is Public (and What Isn't)"
      description="A source-of-truth map of App Store search data: what Apple publishes, what only Apple Ads shows, and how estimates are made honestly."
      category="Data"
      published="2026-07-25"
      updated="2026-08-02"
      readingTime="9 min read"
      slug="ios-subscription-analytics-stack"
    >
      <p className="article-answer">
        Public App Store search data gives you four honest signals: which apps
        rank for a keyword, how many apps compete for it, how strong the top
        results are, and the keyword&apos;s result metadata. True search volume
        exists only inside Apple&apos;s paid Search Ads API. Every free tool
        that shows you a &ldquo;popularity&rdquo; number is estimating — the question is
        whether it admits it.
      </p>

      <h2>Why keyword data is split into two worlds</h2>
      <p>
        When you search the App Store, Apple runs a private ranking system over
        a private index. Two facts about that system are public: the results it
        returns, and which keywords your app appears for (visible to you in App
        Store Connect). Everything else — how many people search a term, how
        impressions convert, what competitors spend — is Apple&apos;s business
        data.
      </p>
      <p>
        The consequence is simple: <strong>there is no free source of App Store
        search volume</strong>. Paid ASO platforms license volume from Apple
        Search Ads data partnerships or model it from panels. Tools that claim
        to show &ldquo;searches per month&rdquo; without such a source are showing a
        model — sometimes a good one, sometimes a guess wearing a number.
      </p>

      <h2>The public data map</h2>
      <div className="article-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Signal</th>
              <th>Public?</th>
              <th>Where it lives</th>
              <th>What it tells you</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Top apps for a keyword</td>
              <td>Yes</td>
              <td>iTunes Search API / app store search</td>
              <td>Who you would compete with</td>
            </tr>
            <tr>
              <td>Competing app count</td>
              <td>Partly</td>
              <td>iTunes Search API (capped at 200)</td>
              <td>How crowded the term is</td>
            </tr>
            <tr>
              <td>Ratings volume of top apps</td>
              <td>Yes</td>
              <td>iTunes Search API / product pages</td>
              <td>How established the incumbents are</td>
            </tr>
            <tr>
              <td>App Store suggestions</td>
              <td>Yes</td>
              <td>iTunes autocomplete (search box)</td>
              <td>What Apple considers related</td>
            </tr>
            <tr>
              <td>Search volume / impressions</td>
              <td>No</td>
              <td>Apple Search Ads API (paid)</td>
              <td>True demand for the term</td>
            </tr>
            <tr>
              <td>Your keyword ranks</td>
              <td>Yes, for your app</td>
              <td>App Store Connect</td>
              <td>Where your app actually appears</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="article-sources">
        <strong>Primary documentation</strong>
        <a
          className={sourceLinkClass}
          href="https://developer.apple.com/documentation/apple_search_ads/"
          target="_blank"
          rel="noreferrer"
        >
          Apple: Search Ads API <ExternalLink size={14} aria-hidden="true" />
        </a>
        <a
          className={sourceLinkClass}
          href="https://developer.apple.com/documentation/appstoreconnectapi"
          target="_blank"
          rel="noreferrer"
        >
          Apple: App Store Connect API <ExternalLink size={14} aria-hidden="true" />
        </a>
        <a
          className={sourceLinkClass}
          href="https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/"
          target="_blank"
          rel="noreferrer"
        >
          Apple: iTunes Search API <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>

      <h2>How honest estimates are built</h2>
      <p>
        Without volume data, you can still rank keywords usefully — if you are
        transparent about what each number means. AppClimb&apos;s approach
        derives two estimates from the public result set:
      </p>
      <ul>
        <li>
          <strong>Popularity (estimated demand)</strong> — how much competition
          pressure and top-result strength suggest the term is searched. A
          saturated result list with strong incumbents implies an active term.
        </li>
        <li>
          <strong>Difficulty (barrier to rank)</strong> — how hard it looks to
          reach the top results: how many apps compete, how many ratings the
          incumbents hold, and whether mega-brands dominate the first page.
        </li>
      </ul>
      <p>
        These are directional, not oracle numbers. Two keywords with the same
        score can behave differently across countries and seasons. That is why
        AppClimb labels every score as an estimate and shows the underlying
        evidence (result count, top apps, ratings) next to the score instead of
        hiding it behind a single mysterious number.
      </p>

      <h2>What to never trust</h2>
      <ol>
        <li>
          <strong>Precise monthly search volume without a stated source.</strong>{" "}
          No public API exposes it.
        </li>
        <li>
          <strong>Trends with no history.</strong> A 30-day chart needs 30 days
          of observations or an openly labeled baseline.
        </li>
        <li>
          <strong>Difficulty scores with no evidence.</strong> &ldquo;72&rdquo; means
          nothing unless you can see why.
        </li>
      </ol>
      <div className="article-callout">
        <strong>A practical rule</strong>
        <p>
          If a tool won&apos;t tell you where its keyword numbers come from,
          assume they are modeled. If it tells you, you can judge whether the
          model is sane. Estimates are fine — secrecy is the problem.
        </p>
      </div>

      <h2>The smallest useful workflow</h2>
      <ol>
        <li>
          Search a candidate term and record popularity, difficulty, and result
          count.
        </li>
        <li>
          Open the top apps: are the incumbents relevant to your product, and
          how strong are their ratings?
        </li>
        <li>
          Prefer terms where difficulty is below the average of your niche and
          popularity is not near-zero.
        </li>
        <li>
          Track the same terms daily so the trend becomes real data instead of
          a one-day snapshot.
        </li>
        <li>
          Re-check after a metadata or release update and keep the history.
        </li>
      </ol>

      <h2>Where AppClimb fits</h2>
      <p>
        AppClimb is a free keyword explorer built entirely on public data. It
        shows estimated popularity and difficulty with the evidence behind
        them, stores one daily snapshot per keyword in your browser, and labels
        estimated history as estimated. No accounts, no billing, no invented
        volumes.
      </p>
      <p>
        <Link href="/">
          Open the keyword explorer <ArrowRight size={15} aria-hidden="true" />
        </Link>
        , or read{" "}
        <Link href="/guides/keyword-research">
          the guide to App Store keyword research
        </Link>
        .
      </p>
    </ArticleLayout>
  );
}
