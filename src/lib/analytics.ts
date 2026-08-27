/**
 * Privacy-first, zero-bot server analytics & AI referral intelligence (ADR 0005).
 */

export interface PageviewInput {
  path: string;
  referrer: string | null;
  utmSource?: string | null;
  userAgent: string;
  ip: string;
  country: string;
  screenWidth?: number;
}

export interface AiModelStat {
  name: string;
  icon: string;
  domain: string;
  visits: number;
  percentage: number;
}

export interface AiTrafficSummary {
  totalVisits: number;
  percentage: number;
  models: AiModelStat[];
  topPages: Array<{
    path: string;
    visits: number;
  }>;
}

export interface RegisteredUserSummary {
  id: string;
  email: string;
  name: string | null;
  provider: "google" | "email";
  plan: string;
  subscriptionStatus: string;
  createdAt: string;
  timeAgo: string;
  lastSeenAt: string;
  lastSeenAgo: string;
  syncCount: number;
}

export interface UserAnalyticsSummary {
  totalUsers: number;
  newUsersInRange: number;
  proUsersCount: number;
  freeUsersCount: number;
  conversionRate: number;
  recentUsers: RegisteredUserSummary[];
}

export interface AnalyticsSummary {
  range: "today" | "7d" | "30d";
  totalVisitors: number;
  totalPageviews: number;
  topCountry: { code: string; name: string; flag: string; count: number } | null;
  topReferrer: { name: string; count: number } | null;
  aiTraffic: AiTrafficSummary;
  userAnalytics: UserAnalyticsSummary;
  signupFunnel: SignupFunnelSummary;
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
    isAi: boolean;
    aiName: string | null;
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
    aiViews: number;
  }>;
  recent: Array<{
    timestamp: number;
    timeAgo: string;
    country: string;
    flag: string;
    path: string;
    referrer: string;
    isAi: boolean;
    aiName: string | null;
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

export interface ReferrerMeta {
  domain: string;
  category: "ai" | "search" | "social" | "direct" | "referral";
  isAi: boolean;
  aiName: string | null;
}

/** Check if a domain or UTM represents an AI engine / assistant */
export function classifyReferrer(
  referrer: string | null | undefined,
  utmSource?: string | null | undefined,
): ReferrerMeta {
  const utm = (utmSource || "").toLowerCase().trim();
  if (utm.includes("chatgpt") || utm.includes("openai")) {
    return { domain: "chatgpt.com", category: "ai", isAi: true, aiName: "ChatGPT" };
  }
  if (utm.includes("perplexity")) {
    return { domain: "perplexity.ai", category: "ai", isAi: true, aiName: "Perplexity AI" };
  }
  if (utm.includes("claude") || utm.includes("anthropic")) {
    return { domain: "claude.ai", category: "ai", isAi: true, aiName: "Claude" };
  }
  if (utm.includes("gemini") || utm.includes("bard")) {
    return { domain: "gemini.google.com", category: "ai", isAi: true, aiName: "Google Gemini" };
  }
  if (utm.includes("copilot")) {
    return { domain: "copilot.microsoft.com", category: "ai", isAi: true, aiName: "Microsoft Copilot" };
  }
  if (utm.includes("deepseek")) {
    return { domain: "chat.deepseek.com", category: "ai", isAi: true, aiName: "DeepSeek" };
  }
  if (utm.includes("grok") || utm.includes("xai")) {
    return { domain: "grok.com", category: "ai", isAi: true, aiName: "Grok" };
  }
  if (utm.includes("cursor") || utm.includes("phind") || utm.includes("v0")) {
    return { domain: "cursor.com", category: "ai", isAi: true, aiName: "Developer AI" };
  }

  if (!referrer || referrer.trim().length === 0) {
    return { domain: "direct", category: "direct", isAi: false, aiName: null };
  }

  const raw = referrer.toLowerCase().trim();

  // In-app deep link schemes (e.g. android-app://com.openai.chat)
  if (raw.includes("com.openai.chat") || raw.includes("chatgpt")) {
    return { domain: "chatgpt.com", category: "ai", isAi: true, aiName: "ChatGPT" };
  }
  if (raw.includes("ai.perplexity.app") || raw.includes("perplexity")) {
    return { domain: "perplexity.ai", category: "ai", isAi: true, aiName: "Perplexity AI" };
  }
  if (raw.includes("com.anthropic.claude") || raw.includes("claude")) {
    return { domain: "claude.ai", category: "ai", isAi: true, aiName: "Claude" };
  }
  if (raw.includes("deepseek")) {
    return { domain: "chat.deepseek.com", category: "ai", isAi: true, aiName: "DeepSeek" };
  }

  try {
    const parsed = new URL(referrer);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (
      host === "appclimb.app" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".appclimb.app")
    ) {
      return { domain: "direct", category: "direct", isAi: false, aiName: null };
    }

    // AI Engines
    if (
      host === "chatgpt.com" ||
      host === "chat.openai.com" ||
      host === "openai.com" ||
      host.endsWith(".openai.com")
    ) {
      return { domain: "chatgpt.com", category: "ai", isAi: true, aiName: "ChatGPT" };
    }
    if (host === "perplexity.ai" || host.endsWith(".perplexity.ai")) {
      return { domain: "perplexity.ai", category: "ai", isAi: true, aiName: "Perplexity AI" };
    }
    if (host === "claude.ai" || host === "anthropic.com" || host.endsWith(".anthropic.com")) {
      return { domain: "claude.ai", category: "ai", isAi: true, aiName: "Claude" };
    }
    if (host === "gemini.google.com" || host === "bard.google.com") {
      return { domain: "gemini.google.com", category: "ai", isAi: true, aiName: "Google Gemini" };
    }
    if (host === "copilot.microsoft.com") {
      return { domain: "copilot.microsoft.com", category: "ai", isAi: true, aiName: "Microsoft Copilot" };
    }
    if (host === "deepseek.com" || host.endsWith(".deepseek.com")) {
      return { domain: "chat.deepseek.com", category: "ai", isAi: true, aiName: "DeepSeek" };
    }
    if (host === "grok.com" || host === "x.ai") {
      return { domain: "grok.com", category: "ai", isAi: true, aiName: "Grok" };
    }
    if (host === "cursor.com" || host === "phind.com" || host === "v0.dev" || host === "devin.ai") {
      return { domain: host, category: "ai", isAi: true, aiName: "Developer AI" };
    }

    // Search engines
    if (host.includes("google.")) return { domain: "google.com", category: "search", isAi: false, aiName: null };
    if (host.includes("bing.")) return { domain: "bing.com", category: "search", isAi: false, aiName: null };
    if (host.includes("yandex.")) return { domain: "yandex.ru", category: "search", isAi: false, aiName: null };
    if (host.includes("duckduckgo.")) return { domain: "duckduckgo.com", category: "search", isAi: false, aiName: null };

    // Social & Dev
    if (
      host === "t.co" ||
      host === "x.com" ||
      host.endsWith(".x.com") ||
      host === "twitter.com" ||
      host.endsWith(".twitter.com")
    ) {
      return { domain: "x.com", category: "social", isAi: false, aiName: null };
    }
    if (host.includes("reddit.com")) return { domain: "reddit.com", category: "social", isAi: false, aiName: null };
    if (host.includes("linkedin.com")) return { domain: "linkedin.com", category: "social", isAi: false, aiName: null };
    if (host.includes("github.com")) return { domain: "github.com", category: "social", isAi: false, aiName: null };
    if (host.includes("news.ycombinator.com")) return { domain: "hacker-news", category: "social", isAi: false, aiName: null };
    if (host.includes("producthunt.com")) return { domain: "producthunt.com", category: "social", isAi: false, aiName: null };

    return { domain: host, category: "referral", isAi: false, aiName: null };
  } catch {
    return { domain: "direct", category: "direct", isAi: false, aiName: null };
  }
}

/** Extract root domain or clean category from referrer URL */
export function sanitizeReferrer(
  referrer: string | null | undefined,
  utmSource?: string | null | undefined,
): string {
  return classifyReferrer(referrer, utmSource).domain;
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
  VN: "Vietnam",
  PH: "Philippines",
  TH: "Thailand",
  MY: "Malaysia",
  MX: "Mexico",
  AR: "Argentina",
  IL: "Israel",
  NG: "Nigeria",
  EG: "Egypt",
  ZA: "South Africa",
  NZ: "New Zealand",
  AT: "Austria",
  BE: "Belgium",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PT: "Portugal",
  IE: "Ireland",
  GR: "Greece",
  CZ: "Czech Republic",
  RO: "Romania",
  HU: "Hungary",
  PK: "Pakistan",
  BD: "Bangladesh",
  CO: "Colombia",
  CL: "Chile",
  PE: "Peru",
  HK: "Hong Kong",
  TW: "Taiwan",
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

/**
 * Whitelist of product events (signup funnel). Keeping this closed stops the
 * table from filling with junk names from a stray client or script.
 */
export const APP_EVENT_NAMES = [
  "signup_intent_shown",
  "auth_started",
  "auth_completed",
  "explorer_limit_hit",
  "keyword_analyzed_first",
  "account_nudge_shown",
  "account_nudge_cta",
] as const;

export type AppEventName = (typeof APP_EVENT_NAMES)[number];

export function isAppEventName(name: unknown): name is AppEventName {
  return (
    typeof name === "string" &&
    (APP_EVENT_NAMES as readonly string[]).includes(name)
  );
}

export interface AppEventInput {
  name: AppEventName;
  path: string;
  userAgent: string;
  ip: string;
  country: string;
  screenWidth?: number;
  meta?: Record<string, string | number | boolean> | null;
}

/** Record a product event in D1 (same anonymity model as pageviews). */
export async function recordEvent(
  db: D1Database,
  input: AppEventInput,
): Promise<boolean> {
  if (isBotUserAgent(input.userAgent)) return false;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timestamp = Math.floor(now.getTime() / 1000);
  const visitorHash = await generateVisitorHash(
    input.ip,
    input.userAgent,
    dateStr,
  );
  const country = (input.country || "US").toUpperCase().slice(0, 2);
  const device = classifyDevice(input.userAgent, input.screenWidth);

  let path = input.path.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.split("?")[0].split("#")[0];
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.length === 0) path = "/";

  let meta = "{}";
  if (input.meta && typeof input.meta === "object") {
    try {
      meta = JSON.stringify(input.meta).slice(0, 200);
    } catch {
      meta = "{}";
    }
  }

  try {
    await db
      .prepare(
        `INSERT INTO analytics_events (date, timestamp, visitor_hash, name, path, country, device, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(dateStr, timestamp, visitorHash, input.name, path, country, device, meta)
      .run();
    return true;
  } catch (err) {
    console.error("Failed to record event:", err);
    return false;
  }
}

export interface SignupFunnelSummary {
  /** Unique visitors who opened the auth modal for any reason. */
  signupIntents: number;
  /** Unique visitors who actually started a sign-in (Google or email). */
  authStarted: number;
  /** Unique visitors who finished sign-in. */
  authCompleted: number;
  /** Unique visitors who hit the free daily checks limit. */
  limitHits: number;
  /** Unique guests who completed their first keyword analysis. */
  firstAnalyses: number;
  /** Unique guests shown the account value nudge. */
  nudgeShown: number;
  /** Unique guests who clicked the nudge CTA. */
  nudgeCta: number;
}

/** Unique visitors per funnel event inside the analytics range. */
export async function querySignupFunnel(
  db: D1Database,
  range: "today" | "7d" | "30d" = "7d",
): Promise<SignupFunnelSummary> {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  let startDateStr = todayStr;
  if (range === "7d") {
    startDateStr = new Date(now.getTime() - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
  } else if (range === "30d") {
    startDateStr = new Date(now.getTime() - 30 * 86400000)
      .toISOString()
      .slice(0, 10);
  }

  const zero: SignupFunnelSummary = {
    signupIntents: 0,
    authStarted: 0,
    authCompleted: 0,
    limitHits: 0,
    firstAnalyses: 0,
    nudgeShown: 0,
    nudgeCta: 0,
  };

  try {
    const { results } = await db
      .prepare(
        `SELECT name, count(DISTINCT visitor_hash) AS visitors
         FROM analytics_events
         WHERE date >= ? AND name IN ('signup_intent_shown','auth_started','auth_completed','explorer_limit_hit','keyword_analyzed_first','account_nudge_shown','account_nudge_cta')
         GROUP BY name`,
      )
      .bind(startDateStr)
      .all<{ name: string; visitors: number }>();

    for (const row of results ?? []) {
      if (row.name === "signup_intent_shown") zero.signupIntents = row.visitors;
      else if (row.name === "auth_started") zero.authStarted = row.visitors;
      else if (row.name === "auth_completed") zero.authCompleted = row.visitors;
      else if (row.name === "explorer_limit_hit") zero.limitHits = row.visitors;
      else if (row.name === "keyword_analyzed_first") zero.firstAnalyses = row.visitors;
      else if (row.name === "account_nudge_shown") zero.nudgeShown = row.visitors;
      else if (row.name === "account_nudge_cta") zero.nudgeCta = row.visitors;
    }
  } catch (err) {
    console.error("Failed to query signup funnel:", err);
  }
  return zero;
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
  const referrer = sanitizeReferrer(input.referrer, input.utmSource);
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

/** AI models icon map */
const AI_ICONS: Record<string, string> = {
  ChatGPT: "🟢",
  "Perplexity AI": "🔵",
  Claude: "🟣",
  "Google Gemini": "🟠",
  "Microsoft Copilot": "🔷",
  DeepSeek: "🔴",
  Grok: "⚪",
  "Developer AI": "💻",
};

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

  // 3. Referrers & AI Categorization
  const referrersResult = await db
    .prepare(
      `SELECT referrer, COUNT(*) as views
       FROM analytics_pageviews
       WHERE date >= ?
       GROUP BY referrer
       ORDER BY views DESC
       LIMIT 20`,
    )
    .bind(startDateStr)
    .all<{ referrer: string; views: number }>();

  const referrers = (referrersResult?.results || []).map((row) => {
    const meta = classifyReferrer(`https://${row.referrer}`);
    return {
      domain: row.referrer,
      views: row.views,
      percentage: totalPageviews > 0 ? Math.round((row.views / totalPageviews) * 100) : 0,
      isAi: meta.isAi,
      aiName: meta.aiName,
    };
  });

  const topReferrer = referrers.length > 0
    ? { name: referrers[0].domain, count: referrers[0].views }
    : null;

  // 4. AI Traffic Intelligence
  const aiReferrers = referrers.filter((r) => r.isAi);
  const totalAiVisits = aiReferrers.reduce((acc, curr) => acc + curr.views, 0);
  const aiPercentage = totalPageviews > 0 ? Math.round((totalAiVisits / totalPageviews) * 100) : 0;

  const aiModelsMap: Record<string, { visits: number; domain: string }> = {};
  for (const r of aiReferrers) {
    const name = r.aiName || "AI Assistant";
    if (!aiModelsMap[name]) {
      aiModelsMap[name] = { visits: 0, domain: r.domain };
    }
    aiModelsMap[name].visits += r.views;
  }

  const aiModels: AiModelStat[] = Object.entries(aiModelsMap).map(([name, stat]) => ({
    name,
    icon: AI_ICONS[name] || "🤖",
    domain: stat.domain,
    visits: stat.visits,
    percentage: totalAiVisits > 0 ? Math.round((stat.visits / totalAiVisits) * 100) : 0,
  }));

  // Top pages referred by AI
  const aiPagesResult = await db
    .prepare(
      `SELECT path, COUNT(*) as visits
       FROM analytics_pageviews
       WHERE date >= ?
         AND (
           referrer LIKE '%chatgpt%' OR
           referrer LIKE '%openai%' OR
           referrer LIKE '%perplexity%' OR
           referrer LIKE '%claude%' OR
           referrer LIKE '%anthropic%' OR
           referrer LIKE '%gemini%' OR
           referrer LIKE '%copilot%' OR
           referrer LIKE '%deepseek%' OR
           referrer LIKE '%grok%' OR
           referrer LIKE '%cursor%'
         )
       GROUP BY path
       ORDER BY visits DESC
       LIMIT 6`,
    )
    .bind(startDateStr)
    .all<{ path: string; visits: number }>();

  const topAiPages = (aiPagesResult?.results || []).map((row) => ({
    path: row.path,
    visits: row.visits,
  }));

  // 5. Pages
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

  // 6. Device breakdown
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

  // 7. Timeline (daily buckets)
  const timelineResult = await db
    .prepare(
      `SELECT date,
              COUNT(DISTINCT visitor_hash) as visitors,
              COUNT(*) as views,
              SUM(CASE WHEN (
                referrer LIKE '%chatgpt%' OR
                referrer LIKE '%openai%' OR
                referrer LIKE '%perplexity%' OR
                referrer LIKE '%claude%' OR
                referrer LIKE '%anthropic%' OR
                referrer LIKE '%gemini%' OR
                referrer LIKE '%copilot%' OR
                referrer LIKE '%deepseek%' OR
                referrer LIKE '%grok%' OR
                referrer LIKE '%cursor%'
              ) THEN 1 ELSE 0 END) as ai_views
       FROM analytics_pageviews
       WHERE date >= ?
       GROUP BY date
       ORDER BY date ASC`,
    )
    .bind(startDateStr)
    .all<{ date: string; visitors: number; views: number; ai_views: number }>();

  const timeline = (timelineResult?.results || []).map((row) => ({
    date: row.date,
    visitors: row.visitors,
    views: row.views,
    aiViews: row.ai_views || 0,
  }));

  // 8. Recent live feed
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

  const recent = (recentResult?.results || []).map((row) => {
    const meta = classifyReferrer(`https://${row.referrer}`);
    return {
      timestamp: row.timestamp,
      timeAgo: timeAgo(row.timestamp, nowSecs),
      country: row.country,
      flag: countryFlag(row.country),
      path: row.path,
      referrer: row.referrer,
      isAi: meta.isAi,
      aiName: meta.aiName,
      device: row.device,
      browser: row.browser,
    };
  });

  // 9. User Accounts & Registration Intelligence
  let totalUsers = 0;
  let newUsersInRange = 0;
  let proUsersCount = 0;
  let recentUsers: RegisteredUserSummary[] = [];

  try {
    const totalUsersRes = await db
      .prepare(`SELECT COUNT(*) as count FROM users`)
      .first<{ count: number }>();
    totalUsers = totalUsersRes?.count || 0;

    const newUsersRes = await db
      .prepare(`SELECT COUNT(*) as count FROM users WHERE created_at >= ?`)
      .bind(startDateStr)
      .first<{ count: number }>();
    newUsersInRange = newUsersRes?.count || 0;

    const proUsersRes = await db
      .prepare(
        `SELECT COUNT(*) as count FROM subscriptions WHERE plan = 'pro' AND status = 'active'`,
      )
      .first<{ count: number }>();
    proUsersCount = proUsersRes?.count || 0;

    const recentUsersRes = await db
      .prepare(
        `SELECT 
           u.id,
           u.email,
           u.name,
           u.google_sub,
           u.created_at,
           u.last_seen_at,
           COALESCE(s.plan, 'free') as plan,
           COALESCE(s.status, 'free') as subscription_status,
           (SELECT COUNT(*) FROM sync_blobs sb WHERE sb.user_id = u.id) as sync_count
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id
         ORDER BY u.created_at DESC
         LIMIT 15`,
      )
      .all<{
        id: string;
        email: string;
        name: string | null;
        google_sub: string | null;
        created_at: string;
        last_seen_at: string;
        plan: string;
        subscription_status: string;
        sync_count: number;
      }>();

    recentUsers = (recentUsersRes?.results || []).map((u) => {
      const cStr = u.created_at.includes("T") ? u.created_at : `${u.created_at.replace(" ", "T")}Z`;
      const lStr = u.last_seen_at.includes("T") ? u.last_seen_at : `${u.last_seen_at.replace(" ", "T")}Z`;
      const createdTs = Math.floor(new Date(cStr).getTime() / 1000) || nowSecs;
      const lastSeenTs = Math.floor(new Date(lStr).getTime() / 1000) || nowSecs;

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        provider: u.google_sub ? "google" : "email",
        plan: u.plan,
        subscriptionStatus: u.subscription_status,
        createdAt: u.created_at,
        timeAgo: timeAgo(createdTs, nowSecs),
        lastSeenAt: u.last_seen_at,
        lastSeenAgo: timeAgo(lastSeenTs, nowSecs),
        syncCount: u.sync_count || 0,
      };
    });
  } catch (userErr) {
    // If users table is not queried or fails, gracefully fallback
    console.error("Failed to query user accounts for analytics:", userErr);
  }

  const freeUsersCount = Math.max(0, totalUsers - proUsersCount);
  const conversionRate =
    totalVisitors > 0 ? Math.round((newUsersInRange / totalVisitors) * 1000) / 10 : 0;

  const signupFunnel = await querySignupFunnel(db, range);

  return {
    range,
    totalVisitors,
    totalPageviews,
    topCountry,
    topReferrer,
    aiTraffic: {
      totalVisits: totalAiVisits,
      percentage: aiPercentage,
      models: aiModels,
      topPages: topAiPages,
    },
    userAnalytics: {
      totalUsers,
      newUsersInRange,
      proUsersCount,
      freeUsersCount,
      conversionRate,
      recentUsers,
    },
    signupFunnel,
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
