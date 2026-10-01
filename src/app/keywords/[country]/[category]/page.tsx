import type { Metadata } from "next";
import Link from "next/link";
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
import {
  categoryLabel,
  categoryPath,
  countryFromSlug,
  countryInText,
  countryPath,
  formatWeekLong,
  genreFromSlug,
} from "@/lib/keyword-pages";
import { loadKeywordPage } from "@/lib/keyword-pages-server";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

// Apple's data lives in D1 at request time, never at build time.
export const dynamic = "force-dynamic";

type Params = Promise<{ country: string; category: string }>;

async function resolve(params: Params) {
  const { country: countrySlug, category: categorySlug } = await params;
  const country = countryFromSlug(countrySlug);
  const genre = genreFromSlug(categorySlug);
  return country && genre ? { country, genre } : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { country, genre } = resolved;
  const label = categoryLabel(genre);
  const result = await loadKeywordPage(country.code, genre);
  const path = categoryPath(country.code, genre);
  const title = `Top ${label} App Store Keywords in ${countryInText(country)}`;
  const leaders =
    result.status === "ok"
      ? result.data.top
          .slice(0, 3)
          .map((row) => `“${row.term}”`)
          .join(", ")
      : "";
  const description =
    result.status === "ok"
      ? `The ${result.data.termCount} most-searched ${label} terms on the App Store in ${countryInText(country)}, week of ${formatWeekLong(result.data.week)} — ${leaders} and more. Apple Ads popularity (1–100), rising and new searches.`
      : `The most-searched ${label} terms on the App Store in ${countryInText(country)}, from Apple Ads Insights: popularity (1–100), rising and new searches.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website" },
    robots: result.status === "ok" ? undefined : { index: false, follow: true },
  };
}

export default async function CategoryKeywordsPage({ params }: { params: Params }) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { country, genre } = resolved;
  const label = categoryLabel(genre);
  const result = await loadKeywordPage(country.code, genre);
  const path = categoryPath(country.code, genre);
  const data = result.status === "ok" ? result.data : null;

  const faq = data
    ? [
        {
          question: `What are the most-searched ${label} keywords on the App Store in ${countryInText(country)}?`,
          answer: `For the week of ${formatWeekLong(data.week)}, Apple Ads ranks ${data.top
            .slice(0, 5)
            .map((row) => `“${row.term}” (${row.popularity})`)
            .join(", ")} highest in ${label}. The full list of ${data.termCount} published terms is above.`,
        },
        {
          question: "Is popularity the same as search volume?",
          answer:
            "No. Apple Ads popularity is a relative score from 1 to 100. Apple does not publish search counts. A higher score means more searches relative to other terms, not a specific number of searches.",
        },
        {
          question: "Why are app and brand names on the list?",
          answer:
            "Because people search for apps by name. Those terms are hard to rank for unless you are the brand. Generic terms (for example “sleep tracker”) are where new apps can compete — open one in the explorer to see its difficulty and who ranks today.",
        },
      ]
    : [];

  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Top searches", item: absoluteUrl("/keywords") },
            {
              "@type": "ListItem",
              position: 3,
              name: country.label,
              item: absoluteUrl(countryPath(country.code)),
            },
            { "@type": "ListItem", position: 4, name: label, item: absoluteUrl(path) },
          ],
        }}
      />
      {data && (
        <>
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "ItemList",
              name: `Most-searched ${label} terms on the App Store in ${countryInText(country)}`,
              itemListOrder: "https://schema.org/ItemListOrderDescending",
              numberOfItems: data.top.length,
              itemListElement: data.top.slice(0, 20).map((row, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: row.term,
              })),
            }}
          />
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((item) => ({
                "@type": "Question",
                name: item.question,
                acceptedAnswer: { "@type": "Answer", text: item.answer },
              })),
            }}
          />
        </>
      )}
      <main className="kp marketing-container">
        <KeywordBreadcrumbs
          items={[
            { label: "AppClimb", href: "/" },
            { label: "Top searches", href: "/keywords" },
            { label: country.label, href: countryPath(country.code) },
            { label },
          ]}
        />
        <header className="kp-head">
          <p className="kp-eyebrow">
            <span aria-hidden="true">{country.flag}</span> {country.label} App Store · {label}
            {data ? ` · week of ${formatWeekLong(data.week)}` : ""}
          </p>
          <h1>
            Top {label} keywords on the App Store in {countryInText(country)}
          </h1>
          <p className="kp-deck">
            {data
              ? `Apple's list of the ${data.termCount} most-searched ${label} terms this week, ranked by Apple Ads popularity — plus what's climbing and what's new. Click a term for its weekly Apple history, or Analyze to see its difficulty and the apps that rank for it.`
              : `Apple's weekly list of the most-searched ${label} terms, ranked by Apple Ads popularity.`}
          </p>
        </header>

        {data ? (
          <>
            <div className="kp-movers-grid">
              <MoverList
                title="Rising over 4 weeks"
                icon="rising"
                rows={data.rising}
                country={country.code}
                empty="No term in this category gained popularity over the last four weeks."
              />
              <MoverList
                title="New in the top 500"
                icon="new"
                rows={data.newcomers}
                country={country.code}
                empty="No new terms entered this category's list this month."
              />
            </div>
            <section className="kp-section" aria-labelledby="kp-top">
              <h2 id="kp-top">
                Top {data.top.length} {label} search terms
              </h2>
              <TermTable
                rows={data.top}
                country={country.code}
                showGenre={false}
                caption={`Top ${data.top.length} ${label} search terms on the App Store in ${countryInText(country)}`}
              />
            </section>
            <ExplorerCta country={country.code} />
            <DataNote week={data.week} compareWeek={data.compareWeek} />
            <section className="kp-section kp-faq" aria-labelledby="kp-faq">
              <h2 id="kp-faq">Questions</h2>
              <dl>
                {faq.map((item) => (
                  <div key={item.question}>
                    <dt>{item.question}</dt>
                    <dd>{item.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        ) : (
          <UnavailableNotice />
        )}

        <section className="kp-section" aria-labelledby="kp-categories">
          <h2 id="kp-categories">Other categories in {country.label}</h2>
          <CategoryLinks country={country.code} current={genre} counts={data?.genreCounts} />
        </section>
        <section className="kp-section" aria-labelledby="kp-countries">
          <h2 id="kp-countries">{label} in other storefronts</h2>
          <CountryLinks current={country.code} genre={genre} />
        </section>
        <p className="kp-muted">
          Want the whole picture? <Link href="/guides/keyword-research">Read the keyword research guide</Link>.
        </p>
      </main>
    </MarketingShell>
  );
}
