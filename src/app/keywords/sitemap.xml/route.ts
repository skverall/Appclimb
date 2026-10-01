import { termSitemapEntries } from "@/lib/keyword-pages";
import { searchTermDeps } from "@/lib/search-terms-server";
import { latestDataset } from "@/lib/search-terms-store";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/** Storefronts and depth listed for crawlers; every other term page is reachable by links. */
const SITEMAP_COUNTRIES = ["US"] as const;
const TERMS_PER_CATEGORY = 100;

function escapeXml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

/** Per-term pages for the most-searched terms, from Apple's latest week in D1. */
export async function GET() {
  const deps = searchTermDeps();
  const urls: string[] = [];
  if (deps) {
    for (const country of SITEMAP_COUNTRIES) {
      try {
        const dataset = await latestDataset(deps, country);
        if (!dataset) continue;
        for (const path of termSitemapEntries(dataset, TERMS_PER_CATEGORY)) {
          urls.push(
            `<url><loc>${escapeXml(absoluteUrl(path))}</loc><lastmod>${dataset.week}</lastmod><changefreq>weekly</changefreq></url>`,
          );
        }
      } catch {
        // Skip a storefront Apple can't serve right now.
      }
    }
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
