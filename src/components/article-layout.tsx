import { ArrowLeft, ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { iconUrl } from "@/lib/brand";
import { absoluteUrl } from "@/lib/site";

export function ArticleLayout({
  title,
  description,
  category,
  published,
  updated,
  readingTime,
  slug,
  children,
}: {
  title: string;
  description: string;
  category: string;
  published: string;
  updated: string;
  readingTime: string;
  slug: string;
  children: React.ReactNode;
}) {
  const articleUrl = absoluteUrl(`/blog/${slug}`);

  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: title,
          description,
          datePublished: published,
          dateModified: updated,
          mainEntityOfPage: articleUrl,
          url: articleUrl,
          image: absoluteUrl("/opengraph-image"),
          author: {
            "@type": "Organization",
            name: "AppClimb",
            url: absoluteUrl("/about"),
          },
          publisher: {
            "@type": "Organization",
            name: "AppClimb",
            url: absoluteUrl("/"),
            logo: {
              "@type": "ImageObject",
              url: absoluteUrl(iconUrl("icon-512.png")),
              width: 512,
              height: 512,
            },
          },
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
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "AppClimb",
              item: absoluteUrl("/"),
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Field notes",
              item: absoluteUrl("/blog"),
            },
            {
              "@type": "ListItem",
              position: 3,
              name: title,
              item: articleUrl,
            },
          ],
        }}
      />
      <main className="article-page">
        <div className="article-hero marketing-container">
          <Link href="/blog" className="article-back">
            <ArrowLeft size={15} aria-hidden="true" /> All field notes
          </Link>
          <span className="marketing-eyebrow">{category}</span>
          <h1>{title}</h1>
          <p className="article-deck">{description}</p>
          <div className="article-meta">
            <span>
              <CalendarDays size={15} aria-hidden="true" /> Updated{" "}
              <time dateTime={updated}>July 25, 2026</time>
            </span>
            <span>
              <Clock3 size={15} aria-hidden="true" /> {readingTime}
            </span>
            <span>By the AppClimb product team</span>
          </div>
        </div>
        <div className="article-layout marketing-container">
          <article className="article-body">{children}</article>
          <aside className="article-aside">
            <span className="marketing-eyebrow">Try the tool</span>
            <h2>See keyword data yourself.</h2>
            <p>
              Official Apple Ads popularity and estimated difficulty for any App Store keyword
              and a 30-day trend — free, without an account.
            </p>
            <Link href="/">
              Open the keyword explorer <ArrowRight size={15} aria-hidden="true" />
            </Link>
            <small>
              Popularity and difficulty are estimates from public App Store
              data, clearly labeled in the UI.
            </small>
          </aside>
        </div>
      </main>
    </MarketingShell>
  );
}
