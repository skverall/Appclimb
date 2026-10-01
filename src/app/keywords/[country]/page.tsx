import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import {
  CategoryLinks,
  CountryLinks,
  DataNote,
  ExplorerCta,
  KeywordBreadcrumbs,
  MoverList,
  TermTable,
  UnavailableNotice,
} from "@/components/keyword-pages";
import { MarketingShell } from "@/components/marketing-shell";
import { countryFromSlug, countryInText, countryPath, formatWeekLong } from "@/lib/keyword-pages";
import { loadKeywordPage } from "@/lib/keyword-pages-server";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

// Apple's data lives in D1 at request time, never at build time.
export const dynamic = "force-dynamic";

type Params = Promise<{ country: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { country: slug } = await params;
  const country = countryFromSlug(slug);
  if (!country) return {};
  const result = await loadKeywordPage(country.code, null);
  const path = countryPath(country.code);
  const title = `Top App Store Searches in ${countryInText(country)}`;
  const leaders =
    result.status === "ok"
      ? result.data.top
          .slice(0, 3)
          .map((row) => `“${row.term}”`)
          .join(", ")
      : "";
  const description =
    result.status === "ok"
      ? `The most-searched App Store terms in ${countryInText(country)} for the week of ${formatWeekLong(result.data.week)} — led by ${leaders}. Apple Ads popularity (1–100), rising searches, and new entries across 15 categories.`
      : `The most-searched App Store terms in ${countryInText(country)}, from Apple Ads Insights: popularity (1–100), rising searches, and new entries across 15 categories.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website" },
    robots: result.status === "ok" ? undefined : { index: false, follow: true },
  };
}

export default async function CountryKeywordsPage({ params }: { params: Params }) {
  const { country: slug } = await params;
  const country = countryFromSlug(slug);
  if (!country) notFound();
  const result = await loadKeywordPage(country.code, null);
  const path = countryPath(country.code);

  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Top searches", item: absoluteUrl("/keywords") },
            { "@type": "ListItem", position: 3, name: country.label, item: absoluteUrl(path) },
          ],
        }}
      />
      {result.status === "ok" && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `Most-searched App Store terms in ${country.label}`,
            itemListOrder: "https://schema.org/ItemListOrderDescending",
            numberOfItems: result.data.top.length,
            itemListElement: result.data.top.slice(0, 20).map((row, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: row.term,
            })),
          }}
        />
      )}
      <main className="kp marketing-container">
        <KeywordBreadcrumbs
          items={[
            { label: "AppClimb", href: "/" },
            { label: "Top searches", href: "/keywords" },
            { label: country.label },
          ]}
        />
        <header className="kp-head">
          <p className="kp-eyebrow">
            <span aria-hidden="true">{country.flag}</span> {country.label} App Store
            {result.status === "ok" ? ` · week of ${formatWeekLong(result.data.week)}` : ""}
          </p>
          <h1>Top App Store searches in {countryInText(country)}</h1>
          <p className="kp-deck">
            The biggest search terms across every category on the App Store in {countryInText(country)}, straight
            from Apple Ads. Open a category for its full top 100, or click any term to see how hard it
            is to rank for.
          </p>
        </header>

        <section className="kp-section" aria-labelledby="kp-categories">
          <h2 id="kp-categories">Browse by category</h2>
          <CategoryLinks
            country={country.code}
            counts={result.status === "ok" ? result.data.genreCounts : undefined}
          />
        </section>

        {result.status === "ok" ? (
          <>
            <div className="kp-movers-grid">
              <MoverList
                title="Rising over 4 weeks"
                icon="rising"
                rows={result.data.rising}
                country={country.code}
                empty="No term gained popularity over the last four weeks."
              />
              <MoverList
                title="New in the top 500"
                icon="new"
                rows={result.data.newcomers}
                country={country.code}
                empty="No new terms entered the published lists this month."
              />
            </div>
            <section className="kp-section" aria-labelledby="kp-top">
              <h2 id="kp-top">Most-searched terms in {countryInText(country)}</h2>
              <TermTable
                rows={result.data.top}
                country={country.code}
                showGenre
                caption={`Top ${result.data.top.length} App Store search terms in ${country.label}`}
              />
            </section>
            <ExplorerCta country={country.code} />
            <DataNote week={result.data.week} compareWeek={result.data.compareWeek} />
          </>
        ) : (
          <UnavailableNotice />
        )}

        <section className="kp-section" aria-labelledby="kp-countries">
          <h2 id="kp-countries">Other storefronts</h2>
          <CountryLinks current={country.code} />
        </section>
      </main>
    </MarketingShell>
  );
}
