const siteUrl = "https://appclimb.app";
const key = "b7e33997f6f0ea3c7353982140fcfc0c";
const sitemapUrl = `${siteUrl}/sitemap.xml`;
// Per-term pages built from Apple's weekly data; optional, so a data outage
// never blocks notifying the core pages.
const termSitemapUrl = `${siteUrl}/keywords/sitemap.xml`;

async function sitemapUrls(url, { required }) {
  const response = await fetch(url, {
    headers: { "user-agent": "AppClimb-IndexNow/1.0" },
  });
  if (!response.ok) {
    if (required) throw new Error(`Could not read ${url}: HTTP ${response.status}`);
    console.warn(`Skipping ${url}: HTTP ${response.status}`);
    return [];
  }
  const body = await response.text();
  return [...body.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .filter((entry) => entry.startsWith(siteUrl));
}

const urlList = [
  ...(await sitemapUrls(sitemapUrl, { required: true })),
  ...(await sitemapUrls(termSitemapUrl, { required: false })),
].slice(0, 10_000);

if (urlList.length === 0) {
  throw new Error("The production sitemap did not contain canonical URLs.");
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: "appclimb.app",
    key,
    keyLocation: `${siteUrl}/${key}.txt`,
    urlList,
  }),
});

if (!response.ok && response.status !== 202) {
  throw new Error(`IndexNow rejected the request: HTTP ${response.status}`);
}

console.log(`IndexNow accepted ${urlList.length} canonical AppClimb URLs.`);
