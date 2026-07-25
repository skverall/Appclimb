const siteUrl = "https://appclimb.app";
const key = "b7e33997f6f0ea3c7353982140fcfc0c";
const sitemapUrl = `${siteUrl}/sitemap.xml`;

const sitemapResponse = await fetch(sitemapUrl, {
  headers: { "user-agent": "AppClimb-IndexNow/1.0" },
});

if (!sitemapResponse.ok) {
  throw new Error(
    `Could not read ${sitemapUrl}: HTTP ${sitemapResponse.status}`,
  );
}

const sitemap = await sitemapResponse.text();
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((match) => match[1])
  .filter((url) => url.startsWith(siteUrl));

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
