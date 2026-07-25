import { ARTICLES, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function GET() {
  const items = ARTICLES.map(
    (article) => `<item>
      <title>${escapeXml(article.title)}</title>
      <link>${absoluteUrl(`/blog/${article.slug}`)}</link>
      <guid isPermaLink="true">${absoluteUrl(`/blog/${article.slug}`)}</guid>
      <description>${escapeXml(article.description)}</description>
      <pubDate>${new Date(`${article.published}T12:00:00Z`).toUTCString()}</pubDate>
    </item>`,
  ).join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${SITE_NAME} Field Notes</title>
    <link>${SITE_URL}/blog</link>
    <description>Evidence-first guides for independent iOS subscription app builders.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date("2026-07-25T12:00:00Z").toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
