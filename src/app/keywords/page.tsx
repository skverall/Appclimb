import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { KeywordBreadcrumbs } from "@/components/keyword-pages";
import { MarketingShell } from "@/components/marketing-shell";
import { PAGE_COUNTRIES, categoryLabel, categoryPath, countryPath } from "@/lib/keyword-pages";
import { DATASET_GENRES } from "@/lib/search-terms";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

const TITLE = "Top App Store Search Terms by Country and Category";
const DESCRIPTION =
  "Apple's own weekly list of the most-searched App Store terms, for 15 storefronts and 15 categories — with Apple Ads popularity (1–100), rising searches, and new entries.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/keywords" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/keywords", type: "website" },
};

export default function KeywordsIndexPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: TITLE,
          description: DESCRIPTION,
          url: absoluteUrl("/keywords"),
          hasPart: PAGE_COUNTRIES.map((country) => ({
            "@type": "WebPage",
            name: `Top App Store search terms in ${country.label}`,
            url: absoluteUrl(countryPath(country.code)),
          })),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Top searches", item: absoluteUrl("/keywords") },
          ],
        }}
      />
      <main className="kp marketing-container">
        <KeywordBreadcrumbs items={[{ label: "AppClimb", href: "/" }, { label: "Top searches" }]} />
        <header className="kp-head">
          <p className="kp-eyebrow">Apple Ads Insights · updated weekly</p>
          <h1>What people search on the App Store</h1>
          <p className="kp-deck">
            Every week Apple publishes the 500 most-searched terms in each App Store category, with a
            relative popularity score from 1 to 100. Pick a storefront and a category to see the
            biggest searches, what&apos;s rising, and what just broke into the list.
          </p>
        </header>

        <div className="kp-country-grid">
          {PAGE_COUNTRIES.map((country) => (
            <section key={country.code} className="kp-country-card" aria-labelledby={`kp-${country.code}`}>
              <h2 id={`kp-${country.code}`}>
                <Link href={countryPath(country.code)}>
                  <span aria-hidden="true">{country.flag}</span> {country.label}
                </Link>
              </h2>
              <ul>
                {DATASET_GENRES.map((genre) => (
                  <li key={genre}>
                    <Link href={categoryPath(country.code, genre)}>{categoryLabel(genre)}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </MarketingShell>
  );
}
