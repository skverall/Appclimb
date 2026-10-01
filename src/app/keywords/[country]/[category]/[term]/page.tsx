import type { Metadata } from "next";
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { JsonLd } from "@/components/json-ld";
import { LineChart } from "@/components/keyword-charts";
import { DataNote, KeywordBreadcrumbs, UnavailableNotice } from "@/components/keyword-pages";
import { MarketingShell } from "@/components/marketing-shell";
import {
  categoryLabel,
  categoryPath,
  countryFromSlug,
  countryInText,
  countryPath,
  decodeTermSlug,
  explorerLink,
  formatWeekLong,
  genreFromSlug,
  termPath,
  type TermPageData,
} from "@/lib/keyword-pages";
import { loadTermPage } from "@/lib/keyword-pages-server";
import { SITE_NAME, absoluteUrl } from "@/lib/site";

// Apple's data lives in D1 at request time, never at build time.
export const dynamic = "force-dynamic";

type Params = Promise<{ country: string; category: string; term: string }>;

async function resolve(params: Params) {
  const { country: countrySlug, category: categorySlug, term } = await params;
  const country = countryFromSlug(countrySlug);
  const genre = genreFromSlug(categorySlug);
  return country && genre ? { country, genre, slug: term } : null;
}

/** "Sep 20, 2026" — chart labels carry the year because the range spans one. */
function shortWeek(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return week;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** "habit-tracker" → "habit tracker" for pages Apple no longer lists. */
function readableSlug(slug: string): string {
  return decodeTermSlug(slug).replace(/-/gu, " ").slice(0, 80);
}

/** Where the term sits in its category's published list, in plain words. */
function listPosition(rank: number | null, size: number): string {
  if (!rank || size === 0) return "on Apple’s published list, so it has real, steady searches";
  const share = rank / size;
  if (share <= 0.1) return "one of the most-searched terms in its category";
  if (share <= 0.5) return "in the upper half of Apple’s list";
  return "in the lower half of Apple’s list, which still means steady searches";
}

function rangeOf(data: TermPageData): { low: number; high: number } | null {
  if (data.history.length < 4) return null;
  const values = data.history.map((point) => point.popularity);
  return { low: Math.min(...values), high: Math.max(...values) };
}

function summary(data: TermPageData, place: string): string {
  const label = categoryLabel(data.genre);
  const rank = data.rankInGenre
    ? `It ranks #${data.rankInGenre} of the ${data.genreSize} most-searched ${label} terms — ${listPosition(data.rankInGenre, data.genreSize)}.`
    : `It is one of the ${data.genreSize} most-searched ${label} terms.`;
  const change =
    data.previousPopularity === null
      ? " It is new to Apple’s list since four weeks ago."
      : data.popularity === data.previousPopularity
        ? " That is unchanged from four weeks ago."
        : ` That is ${data.popularity > data.previousPopularity ? "up" : "down"} ${Math.abs(data.popularity - data.previousPopularity)} from four weeks ago.`;
  return `“${data.term}” scores ${data.popularity} out of 100 on Apple Ads popularity in ${place} for the week of ${formatWeekLong(data.week)}. ${rank}${change}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const resolved = await resolve(params);
  if (!resolved) return {};
  const { country, genre, slug } = resolved;
  const result = await loadTermPage(country.code, genre, slug);
  if (result.status !== "ok") {
    return { title: `“${readableSlug(slug)}” App Store keyword`, robots: { index: false, follow: true } };
  }
  const { data } = result;
  const path = termPath(country.code, data.genre, data.term);
  const title = `“${data.term}” App Store Keyword Popularity (${country.code})`;
  const description = `${summary(data, countryInText(country))} See its weekly Apple history, related searches, and how hard it is to rank.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, type: "website" },
  };
}

export default async function TermKeywordPage({ params }: { params: Params }) {
  const resolved = await resolve(params);
  if (!resolved) notFound();
  const { country, genre, slug } = resolved;
  const result = await loadTermPage(country.code, genre, slug);
  if (result.status === "redirect") permanentRedirect(termPath(country.code, result.genre, result.term));

  const label = categoryLabel(genre);
  const crumbs = [
    { label: "AppClimb", href: "/" },
    { label: "Top searches", href: "/keywords" },
    { label: country.label, href: countryPath(country.code) },
    { label, href: categoryPath(country.code, genre) },
  ];

  if (result.status !== "ok") {
    const term = readableSlug(slug);
    return (
      <MarketingShell>
        <main className="kp marketing-container">
          <KeywordBreadcrumbs items={[...crumbs, { label: term }]} />
          <header className="kp-head">
            <h1>“{term}” on the App Store in {countryInText(country)}</h1>
            <p className="kp-deck">
              {result.status === "missing"
                ? `“${term}” isn’t in Apple’s list of the most-searched ${label} terms this week. That usually means it’s long tail: its popularity is at or below the lowest published score. Check it in the explorer to see its difficulty and who ranks for it.`
                : "Apple’s search-term data for this page isn’t available right now."}
            </p>
          </header>
          {result.status === "unavailable" && <UnavailableNotice />}
          <Link href={explorerLink(term, country.code)} className="kp-cta-btn" prefetch={false}>
            Check “{term}” in the explorer
          </Link>
        </main>
      </MarketingShell>
    );
  }

  const { data } = result;
  const path = termPath(country.code, data.genre, data.term);
  const range = rangeOf(data);
  const change = data.previousPopularity === null ? null : data.popularity - data.previousPopularity;
  const place = countryInText(country);

  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
            { "@type": "ListItem", position: 2, name: "Top searches", item: absoluteUrl("/keywords") },
            { "@type": "ListItem", position: 3, name: country.label, item: absoluteUrl(countryPath(country.code)) },
            { "@type": "ListItem", position: 4, name: label, item: absoluteUrl(categoryPath(country.code, genre)) },
            { "@type": "ListItem", position: 5, name: data.term, item: absoluteUrl(path) },
          ],
        }}
      />
      <main className="kp kt marketing-container">
        <KeywordBreadcrumbs items={[...crumbs, { label: data.term }]} />
        <header className="kp-head kt-head">
          <p className="kp-eyebrow">
            <span aria-hidden="true">{country.flag}</span>
            {` ${country.label} App Store · ${label} · week of ${formatWeekLong(data.week)}`}
          </p>
          <h1>
            {`“${data.term}” `}
            <span>App Store keyword popularity</span>
          </h1>
          <p className="kp-deck">{summary(data, place)}</p>
          <div className="kt-actions">
            <Link href={explorerLink(data.term, country.code)} className="kt-btn kt-btn--primary" prefetch={false}>
              <Search size={16} aria-hidden="true" /> Check difficulty &amp; top 10 apps
            </Link>
            <Link href={categoryPath(country.code, genre)} className="kt-btn">
              All top {label} searches
            </Link>
          </div>
        </header>

        <section className="kt-kpis" aria-label="Key numbers">
          <div className="kt-kpi kt-kpi--main">
            <span>Apple popularity</span>
            <strong>
              {data.popularity}
              <small>/100</small>
            </strong>
            <span className="kp-bar" aria-hidden="true">
              <i style={{ width: `${data.popularity}%` }} />
            </span>
            <em>Official Apple Ads score</em>
          </div>
          <div className="kt-kpi">
            <span>Rank in {label}</span>
            <strong>{data.rankInGenre ? `#${data.rankInGenre}` : "Top 500"}</strong>
            <em>of {data.genreSize} published terms</em>
          </div>
          <div className="kt-kpi">
            <span>4-week change</span>
            <strong className={change === null ? "is-new" : change > 0 ? "is-up" : change < 0 ? "is-down" : undefined}>
              {change === null ? "New" : change === 0 ? "±0" : `${change > 0 ? "+" : "−"}${Math.abs(change)}`}
            </strong>
            <em>
              {data.previousPopularity === null
                ? "entered Apple’s list"
                : `from ${data.previousPopularity}`}
            </em>
          </div>
          <div className="kt-kpi">
            <span>{range ? `${data.history.length}-week range` : "Weekly history"}</span>
            <strong>{range ? `${range.low}–${range.high}` : "—"}</strong>
            <em>{range ? "lowest to highest" : "not loaded yet"}</em>
          </div>
        </section>

        <section className="kp-section kt-history" aria-labelledby="kt-history">
          <h2 id="kt-history">Weekly popularity from Apple</h2>
          {data.history.length >= 2 ? (
            <>
              <LineChart
                points={data.history.map((point) => ({ label: shortWeek(point.week), value: point.popularity }))}
                color="var(--teal-600)"
                valueLabel="Apple popularity"
                height={220}
                domain={[0, 100]}
              />
              <details className="kt-weeks">
                <summary>Show the weekly numbers</summary>
                <table className="kp-table">
                  <caption className="sr-only">{`Apple Ads popularity for “${data.term}” by week`}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Week of</th>
                      <th scope="col">Popularity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.history].reverse().map((point) => (
                      <tr key={point.week}>
                        <td>{formatWeekLong(point.week)}</td>
                        <td>{point.popularity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="kp-muted">
              Apple&apos;s weekly history for this term hasn&apos;t been loaded yet. Open it in the
              explorer to see up to a year of weekly scores.
            </p>
          )}
        </section>

        <aside className="kp-cta">
          <Search size={18} aria-hidden="true" />
          <div>
            <strong>Can your app rank for “{data.term}”?</strong>
            <p>
              Popularity is demand. Difficulty depends on who holds page one — their ratings, whether
              the term is in their names, and big brands. The explorer shows that evidence and a
              verdict, free and without sign-up.
            </p>
          </div>
          <Link href={explorerLink(data.term, country.code)} className="kp-cta-btn" prefetch={false}>
            Check difficulty
          </Link>
        </aside>

        {data.related.length > 0 && (
          <section className="kp-section" aria-labelledby="kt-related">
            <h2 id="kt-related">Related searches in {place}</h2>
            <ul className="kt-related">
              {data.related.map((item) => (
                <li key={`${item.genre}:${item.term}`}>
                  <Link href={termPath(country.code, item.genre, item.term)} prefetch={false}>
                    <span className="kt-related-term">{item.term}</span>
                    <span className="kp-pop">
                      <b>{item.popularity}</b>
                      <span className="kp-bar" aria-hidden="true">
                        <i style={{ width: `${item.popularity}%` }} />
                      </span>
                    </span>
                    {item.genre !== data.genre && <small>{categoryLabel(item.genre)}</small>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.otherGenres.length > 0 && (
          <section className="kp-section" aria-labelledby="kt-genres">
            <h2 id="kt-genres">Also searched in other categories</h2>
            <ul className="kt-related">
              {data.otherGenres.map((item) => (
                <li key={item.genre}>
                  <Link href={categoryPath(country.code, item.genre)}>
                    <span className="kt-related-term">{categoryLabel(item.genre)}</span>
                    <span className="kp-pop">
                      <b>{item.popularity}</b>
                      <span className="kp-bar" aria-hidden="true">
                        <i style={{ width: `${item.popularity}%` }} />
                      </span>
                    </span>
                    {item.rankInGenre ? <small>#{item.rankInGenre}</small> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="kt-back">
          <Link href={categoryPath(country.code, genre)}>
            All top {label} searches in {place} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>

        <DataNote week={data.week} compareWeek={data.compareWeek} />
      </main>
    </MarketingShell>
  );
}
