/**
 * Privacy-first, zero-bot server analytics utilities (ADR 0005).
 */

export interface PageviewInput {
  path: string;
  referrer: string | null;
  userAgent: string;
  ip: string;
  country: string;
  screenWidth?: number;
}

export interface AnalyticsSummary {
  range: "today" | "7d" | "30d";
  totalVisitors: number;
  totalPageviews: number;
  topCountry: { code: string; name: string; flag: string; count: number } | null;
  topReferrer: { name: string; count: number } | null;
  countries: Array<{
    code: string;
    name: string;
    flag: string;
    visitors: number;
    views: number;
    percentage: number;
  }>;
  referrers: Array<{
    domain: string;
    views: number;
    percentage: number;
  }>;
  pages: Array<{
    path: string;
    views: number;
    visitors: number;
  }>;
  devices: {
    desktop: number;
    mobile: number;
    tablet: number;
  };
  timeline: Array<{
    date: string;
    visitors: number;
    views: number;
  }>;
  recent: Array<{
    timestamp: number;
    timeAgo: string;
    country: string;
    flag: string;
    path: string;
    referrer: string;
    device: string;
    browser: string;
  }>;
}

const BOT_PATTERNS = [
  "bot",
  "crawler",
  "spider",
  "googlebot",
  "bingbot",
  "yandex",
  "duckduckbot",
  "slurp",
  "baiduspider",
  "headless",
  "phantomjs",
  "lighthouse",
  "curl",
  "wget",
  "python",
  "postman",
  "node-fetch",
  "axios",
  "go-http-client",
  "bytespider",
  "gptbot",
  "claudebot",
  "semrush",
  "ahrefs",
];

/** Check if User-Agent belongs to an automated crawler or bot */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length === 0) return true;
  const lower = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** Extract root domain or clean category from referrer URL */
export function sanitizeReferrer(referrer: string | null | undefined): string {
  if (!referrer || referrer.trim().length === 0) return "direct";
  try {
    const parsed = new URL(referrer);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (
      host === "appclimb.app" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".appclimb.app")
    ) {
      return "direct";
    }
    if (
      host === "t.co" ||
      host === "x.com" ||
      host.endsWith(".x.com") ||
      host === "twitter.com" ||
      host.endsWith(".twitter.com")
    ) {
      return "x.com";
    }
    if (host.includes("google.")) return "google.com";
    if (host.includes("bing.")) return "bing.com";
    if (host.includes("yandex.")) return "yandex.ru";
    if (host.includes("duckduckgo.")) return "duckduckgo.com";
    if (host.includes("reddit.com")) return "reddit.com";
    if (host.includes("linkedin.com")) return "linkedin.com";
    if (host.includes("github.com")) return "github.com";
    if (host.includes("news.ycombinator.com")) return "hacker-news";
    if (host.includes("producthunt.com")) return "producthunt.com";
    return host;
  } catch {
    return "direct";
  }
}

/** Classify device type */
export function classifyDevice(
  userAgent: string,
  screenWidth?: number,
): "desktop" | "mobile" | "tablet" {
  if (typeof screenWidth === "number" && Number.isFinite(screenWidth)) {
    if (screenWidth < 640) return "mobile";
    if (screenWidth < 1024) return "tablet";
    return "desktop";
  }
  const lower = userAgent.toLowerCase();
  if (lower.includes("ipad") || lower.includes("tablet")) return "tablet";
  if (lower.includes("mobile") || lower.includes("iphone") || lower.includes("android")) {
    return "mobile";
  }
  return "desktop";
}

/** Classify browser */
export function classifyBrowser(
  userAgent: string,
): "chrome" | "safari" | "firefox" | "edge" | "other" {
  const lower = userAgent.toLowerCase();
  if (lower.includes("edg/")) return "edge";
  if (lower.includes("firefox")) return "firefox";
  if (lower.includes("chrome") || lower.includes("crios")) return "chrome";
  if (lower.includes("safari")) return "safari";
  return "other";
}

/** Convert 2-letter ISO country code to Emoji flag */
export function countryFlag(countryCode: string): string {
  const code = (countryCode || "").toUpperCase().trim();
  if (code.length !== 2) return "🌐";
  const offset = 127397;
  const first = code.charCodeAt(0) + offset;
  const second = code.charCodeAt(1) + offset;
  return String.fromCodePoint(first, second);
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  DE: "Germany",
  FR: "France",
  CA: "Canada",
  AU: "Australia",
  RU: "Russia",
  UZ: "Uzbekistan",
  KZ: "Kazakhstan",
  UA: "Ukraine",
  JP: "Japan",
  CN: "China",
  IN: "India",
  BR: "Brazil",
  NL: "Netherlands",
  SE: "Sweden",
  CH: "Switzerland",
  ES: "Spain",
  IT: "Italy",
  TR: "Turkey",
  AE: "United Arab Emirates",
  SG: "Singapore",
  KR: "South Korea",
  ID: "Indonesia",
  PL: "Poland",
};

export function countryName(code: string): string {
  const upper = (code || "").toUpperCase().trim();
  return COUNTRY_NAMES[upper] || upper;
}

/** Generate an anonymous, non-reversible daily visitor hash */
export async function generateVisitorHash(
  ip: string,
  userAgent: string,
  dateStr: string,
): Promise<string> {
  const salt = "appclimb-v1-salt";
  const data = `${ip}|${userAgent}|${dateStr}|${salt}`;
  const encoder = new TextEncoder();
  const buffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 16);
}

/** Record a pageview in D1 */
export async function recordPageview(
  db: D1Database,
  input: PageviewInput,
): Promise<boolean> {
  if (isBotUserAgent(input.userAgent)) return false;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timestamp = Math.floor(now.getTime() / 1000);
  const visitorHash = await generateVisitorHash(input.ip, input.userAgent, dateStr);
  const country = (input.country || "US").toUpperCase().slice(0, 2);
  const referrer = sanitizeReferrer(input.referrer);
  const device = classifyDevice(input.userAgent, input.screenWidth);
  const browser = classifyBrowser(input.userAgent);

  // Normalize path
  let path = input.path.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.length === 0) path = "/";

  try {
    await db
      .prepare(
        `INSERT INTO analytics_pageviews (date, timestamp, visitor_hash, path, country, referrer, device, browser)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(dateStr, timestamp, visitorHash, path, country, referrer, device, browser)
      .run();
    return true;
  } catch (err) {
    console.error("Failed to record pageview:", err);
    return false;
  }
}

function timeAgo(epochSecs: number, nowSecs: number): string {
  const diff = Math.max(0, nowSecs - epochSecs);
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Query aggregated analytics data for admin dashboard */
export async function queryAnalyticsSummary(
  db: D1Database,
  range: "today" | "7d" | "30d" = "7d",
): Promise<AnalyticsSummary> {
  const now = new Date();
  const nowSecs = Math.floor(now.getTime() / 1000);
  const todayStr = now.toISOString().slice(0, 10);

  let startDateStr = todayStr;
  if (range === "7d") {
    const d = new Date(now.getTime() - 6 * 86400000);
    startDateStr = d.toISOString().slice(0, 10);
  } else if (range === "30d") {
    const d = new Date(now.getTime() - 29 * 86400000);
    startDateStr = d.toISOString().slice(0, 10);
  }

  // 1. Total KPI metrics
  const totalsResult = await db
    .prepare(
      `SELECT COUNT(DISTINCT visitor_hash) as visitors, COUNT(*) as views
       FROM analytics_pageviews
       WHERE date >= ?`,
    )
    .bind(startDateStr)
    .first<{ visitors: number; views: number }>();

  const totalVisitors = totalsResult?.visitors ?? 0;
  const totalPageviews = totalsResult?.views ?? 0;

  // 2. Countries
  const countriesResult = await db
    .prepare(
      `SELECT country, COUNT(DISTINCT visitor_hash) as visitors, COUNT(*) as views
       FROM analytics_pageviews
       WHERE date >= ?
       GROUP BY country
       ORDER BY visitors DESC, views DESC
       LIMIT 15`,
    )
    .bind(startDateStr)
    .all<{ country: string; visitors: number; views: number }>();

  const countries = (countriesResult?.results || []).map((row) => ({
    code: row.country,
    name: countryName(row.country),
    flag: countryFlag(row.country),
    visitors: row.visitors,
    views: row.views,
    percentage: totalVisitors > 0 ? Math.round((row.visitors / totalVisitors) * 100) : 0,
  }));

  const topCountry = countries.length > 0
    ? {
        code: countries[0].code,
        name: countries[0].name,
        flag: countries[0].flag,
        count: countries[0].visitors,
      }
    : null;

  // 3. Referrers
  const referrersResult = await db
    .prepare(
      `SELECT referrer, COUNT(*) as views
       FROM analytics_pageviews
       WHERE date >= ?
       GROUP BY referrer
       ORDER BY views DESC
       LIMIT 15`,
    )
    .bind(startDateStr)
    .all<{ referrer: string; views: number }>();

  const referrers = (referrersResult?.results || []).map((row) => ({
    domain: row.referrer,
    views: row.views,
    percentage: totalPageviews > 0 ? Math.round((row.views / totalPageviews) * 100) : 0,
  }));

  const topReferrer = referrers.length > 0
    ? { name: referrers[0].domain, count: referrers[0].views }
    : null;

  // 4. Pages
  const pagesResult = await db
    .prepare(
      `SELECT path, COUNT(*) as views, COUNT(DISTINCT visitor_hash) as visitors
       FROM analytics_pageviews
       WHERE date >= ?
       GROUP BY path
       ORDER BY views DESC
       LIMIT 15`,
    )
    .bind(startDateStr)
    .all<{ path: string; views: number; visitors: number }>();

  const pages = (pagesResult?.results || []).map((row) => ({
    path: row.path,
    views: row.views,
    visitors: row.visitors,
  }));

  // 5. Device breakdown
  const devicesResult = await db
    .prepare(
      `SELECT device, COUNT(*) as count
       FROM analytics_pageviews
       WHERE date >= ?
       GROUP BY device`,
    )
    .bind(startDateStr)
    .all<{ device: string; count: number }>();

  const deviceMap: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
  for (const row of devicesResult?.results || []) {
    if (row.device in deviceMap) deviceMap[row.device] = row.count;
  }

  // 6. Timeline (daily buckets)
  const timelineResult = await db
    .prepare(
      `SELECT date, COUNT(DISTINCT visitor_hash) as visitors, COUNT(*) as views
       FROM analytics_pageviews
       WHERE date >= ?
       GROUP BY date
       ORDER BY date ASC`,
    )
    .bind(startDateStr)
    .all<{ date: string; visitors: number; views: number }>();

  const timeline = (timelineResult?.results || []).map((row) => ({
    date: row.date,
    visitors: row.visitors,
    views: row.views,
  }));

  // 7. Recent live feed
  const recentResult = await db
    .prepare(
      `SELECT timestamp, country, path, referrer, device, browser
       FROM analytics_pageviews
       ORDER BY timestamp DESC
       LIMIT 15`,
    )
    .all<{
      timestamp: number;
      country: string;
      path: string;
      referrer: string;
      device: string;
      browser: string;
    }>();

  const recent = (recentResult?.results || []).map((row) => ({
    timestamp: row.timestamp,
    timeAgo: timeAgo(row.timestamp, nowSecs),
    country: row.country,
    flag: countryFlag(row.country),
    path: row.path,
    referrer: row.referrer,
    device: row.device,
    browser: row.browser,
  }));

  return {
    range,
    totalVisitors,
    totalPageviews,
    topCountry,
    topReferrer,
    countries,
    referrers,
    pages,
    devices: {
      desktop: deviceMap.desktop,
      mobile: deviceMap.mobile,
      tablet: deviceMap.tablet,
    },
    timeline,
    recent,
  };
}
