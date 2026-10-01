import Link from "next/link";
import { ArrowRight, Search, Sparkles, TrendingUp } from "lucide-react";

import {
  PAGE_COUNTRIES,
  categoryLabel,
  categoryPath,
  countryPath,
  explorerLink,
  formatWeekLong,
} from "@/lib/keyword-pages";
import { DATASET_GENRES, type DatasetGenre, type TermMover } from "@/lib/search-terms";

export function KeywordBreadcrumbs({
  items,
}: {
  items: Array<{ label: string; href?: string }>;
}) {
  return (
    <nav className="kp-crumbs" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.label}>
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
          {index < items.length - 1 && <span aria-hidden="true"> / </span>}
        </span>
      ))}
    </nav>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="kp-delta kp-delta--new">new</span>;
  if (value === 0) return <span className="kp-delta kp-delta--flat">—</span>;
  return (
    <span className={`kp-delta ${value > 0 ? "kp-delta--up" : "kp-delta--down"}`}>
      {value > 0 ? "▲" : "▼"} {Math.abs(value)}
    </span>
  );
}

export function TermTable({
  rows,
  country,
  showGenre,
  caption,
}: {
  rows: TermMover[];
  country: string;
  showGenre: boolean;
  caption: string;
}) {
  return (
    <div className="kp-table-wrap">
      <table className="kp-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Search term</th>
            {showGenre && <th scope="col">Category</th>}
            <th scope="col" title="Apple Ads relative popularity, 1–100">
              Popularity
            </th>
            <th scope="col" title="Change in Apple's popularity score over four weeks">
              4-wk change
            </th>
            <th scope="col" className="kp-go">
              <span className="sr-only">Analyze</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.genre}:${row.term}`}>
              <td className="kp-rank">{index + 1}</td>
              <td className="kp-term">
                <Link href={explorerLink(row.term, country)} prefetch={false}>
                  {row.term}
                </Link>
              </td>
              {showGenre && (
                <td className="kp-genre">
                  <Link href={categoryPath(country, row.genre)}>{categoryLabel(row.genre)}</Link>
                </td>
              )}
              <td>
                <span className="kp-pop">
                  <b>{row.popularity}</b>
                  <span className="kp-bar" aria-hidden="true">
                    <i style={{ width: `${row.popularity}%` }} />
                  </span>
                </span>
              </td>
              <td>
                <Delta value={row.delta} />
              </td>
              <td className="kp-go">
                <Link
                  href={explorerLink(row.term, country)}
                  prefetch={false}
                  aria-label={`Analyze ${row.term}: difficulty and top apps`}
                >
                  Analyze <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MoverList({
  title,
  icon,
  rows,
  country,
  empty,
}: {
  title: string;
  icon: "rising" | "new";
  rows: TermMover[];
  country: string;
  empty: string;
}) {
  const Icon = icon === "rising" ? TrendingUp : Sparkles;
  return (
    <section className="kp-movers" aria-label={title}>
      <h2>
        <Icon size={17} aria-hidden="true" /> {title}
      </h2>
      {rows.length === 0 ? (
        <p className="kp-muted">{empty}</p>
      ) : (
        <ol>
          {rows.map((row) => (
            <li key={`${row.genre}:${row.term}`}>
              <Link href={explorerLink(row.term, country)} prefetch={false}>
                {row.term}
              </Link>
              <span className="kp-movers-meta">
                <b>{row.popularity}</b>
                <Delta value={row.delta} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function CategoryLinks({
  country,
  current,
  counts,
}: {
  country: string;
  current?: DatasetGenre | null;
  counts?: Partial<Record<DatasetGenre, number>>;
}) {
  return (
    <ul className="kp-chips">
      {DATASET_GENRES.map((genre) => (
        <li key={genre}>
          <Link
            href={categoryPath(country, genre)}
            className={genre === current ? "is-active" : undefined}
            aria-current={genre === current ? "page" : undefined}
          >
            {categoryLabel(genre)}
            {counts?.[genre] ? <small>{counts[genre]}</small> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CountryLinks({
  current,
  genre,
}: {
  current?: string;
  genre?: DatasetGenre | null;
}) {
  return (
    <ul className="kp-chips">
      {PAGE_COUNTRIES.map((country) => (
        <li key={country.code}>
          <Link
            href={genre ? categoryPath(country.code, genre) : countryPath(country.code)}
            className={country.code === current ? "is-active" : undefined}
            aria-current={country.code === current ? "page" : undefined}
          >
            <span aria-hidden="true">{country.flag}</span> {country.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ExplorerCta({ country }: { country: string }) {
  return (
    <aside className="kp-cta">
      <Search size={18} aria-hidden="true" />
      <div>
        <strong>Popularity is only half the answer.</strong>
        <p>
          Open any term in the explorer to see its difficulty, who ranks today, and whether it&apos;s
          worth targeting — free, no sign-up.
        </p>
      </div>
      <Link href={`/?country=${country}`} className="kp-cta-btn">
        Open the explorer
      </Link>
    </aside>
  );
}

export function DataNote({ week, compareWeek }: { week: string; compareWeek: string | null }) {
  return (
    <p className="kp-note">
      Source: Apple Ads Insights search-term popularity for the week of {formatWeekLong(week)}
      {compareWeek ? `, compared with the week of ${formatWeekLong(compareWeek)}` : ""}. Popularity
      is Apple&apos;s relative score from 1 to 100 — not search volume. Apple publishes the 500
      most-searched terms per category; brand and app names appear because people search for them.
    </p>
  );
}

export function UnavailableNotice() {
  return (
    <div className="kp-unavailable" role="status">
      Apple&apos;s search-term data for this page isn&apos;t available right now. Try again later, or{" "}
      <Link href="/">search a keyword in the explorer</Link>.
    </div>
  );
}
