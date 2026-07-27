import { classifyCrawlerUserAgent } from "../../../src/lib/crawler-classifier";
import {
  TRACKING_INSTALL_VERSION,
  WEB_INSTALL_STEPS,
  type WebInstallStep,
} from "../../../src/components/web-tracking/web-install-state";
import { audit } from "./db";
import {
  issueTrackingToken,
  parseTrackingToken,
  type TrackingClaims,
} from "./crypto";
import { requireSecret } from "./runtime";
import type { AuthContext } from "./types";

/**
 * Verification metadata is refreshed at most once per property per minute.
 * The first accepted event always writes (last_event_at is NULL), so
 * `Tracking installed` is never delayed; steady-state traffic then costs one
 * primary-key UPDATE per minute instead of one per page view.
 */
const VERIFICATION_REFRESH_MS = 60 * 1000;

/** Baseline window used for the wizard's collection progress. */
const BASELINE_WINDOW_DAYS = 7;

const campaignMedium =
  /^(cpc|ppc|paid|paid_social|display|affiliate|email|newsletter|sms)$/iu;

export function normalizeHostname(value: string): string {
  let normalized = value.trim().toLowerCase();
  try {
    normalized = new URL(`https://${normalized}`).hostname;
  } catch {
    return "";
  }
  return normalized.replace(/\.$/u, "").replace(/^www\./u, "");
}

function matchesHost(host: string, ...domains: string[]): boolean {
  return domains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

function channelForHost(value: string): string {
  const host = normalizeHostname(value);
  if (!host) return "Direct";
  if (
    matchesHost(
      host,
      "chatgpt.com",
      "chat.openai.com",
      "perplexity.ai",
      "claude.ai",
      "gemini.google.com",
      "copilot.microsoft.com",
      "you.com",
    )
  ) {
    return "AI Referral";
  }
  if (
    matchesHost(
      host,
      "x.com",
      "t.co",
      "twitter.com",
      "instagram.com",
      "facebook.com",
      "linkedin.com",
      "reddit.com",
      "threads.net",
      "tiktok.com",
      "youtube.com",
    )
  ) {
    return "Social";
  }
  if (
    matchesHost(
      host,
      "bing.com",
      "duckduckgo.com",
      "search.brave.com",
      "yahoo.com",
      "yandex.com",
      "yandex.ru",
      "baidu.com",
    ) ||
    host.startsWith("google.") ||
    host.includes(".google.") ||
    host.startsWith("search.")
  ) {
    return "Organic Search";
  }
  return "Referral";
}

function sourceLabel(value: string): string {
  const host = normalizeHostname(value);
  if (matchesHost(host, "x.com", "t.co", "twitter.com")) return "X";
  if (matchesHost(host, "instagram.com")) return "Instagram";
  if (matchesHost(host, "facebook.com")) return "Facebook";
  if (matchesHost(host, "linkedin.com")) return "LinkedIn";
  if (matchesHost(host, "reddit.com")) return "Reddit";
  if (matchesHost(host, "chatgpt.com", "chat.openai.com")) return "ChatGPT";
  if (matchesHost(host, "perplexity.ai")) return "Perplexity";
  if (matchesHost(host, "claude.ai")) return "Claude";
  if (matchesHost(host, "gemini.google.com")) return "Gemini";
  if (matchesHost(host, "copilot.microsoft.com")) return "Microsoft Copilot";
  if (host === "google" || host.includes("google.")) return "Google";
  if (matchesHost(host, "bing.com")) return "Bing";
  if (matchesHost(host, "search.brave.com")) return "Brave Search";
  if (matchesHost(host, "duckduckgo.com")) return "DuckDuckGo";
  return host || value.trim();
}

function referrerHostname(referrer: string): string {
  try {
    return normalizeHostname(new URL(referrer).hostname);
  } catch {
    return "";
  }
}

function acquisition(
  referrer: string,
  utmSource: string,
  utmMedium: string,
): { channel: string; source: string; referrerHost: string } {
  const referrerHost = referrerHostname(referrer);
  if (utmSource.trim()) {
    let channel = channelForHost(utmSource);
    if (
      campaignMedium.test(utmMedium.trim()) ||
      channel === "Direct" ||
      channel === "Referral"
    ) {
      channel = "Campaigns";
    }
    return {
      channel,
      source: sourceLabel(utmSource),
      referrerHost,
    };
  }
  if (!referrerHost) {
    return { channel: "Direct", source: "Direct / none", referrerHost: "" };
  }
  return {
    channel: channelForHost(referrerHost),
    source: sourceLabel(referrerHost),
    referrerHost,
  };
}

function clientDevice(userAgent: string): {
  browser: string;
  os: string;
  device: string;
} {
  const ua = userAgent.toLowerCase();
  const device =
    ua.includes("ipad") || ua.includes("tablet")
      ? "Tablet"
      : ua.includes("iphone") ||
          (ua.includes("android") && ua.includes("mobile"))
        ? "Mobile"
        : "Desktop";
  const os = ua.includes("iphone") || ua.includes("ipad")
    ? "iOS"
    : ua.includes("android")
      ? "Android"
      : ua.includes("windows")
        ? "Windows"
        : ua.includes("mac os x") || ua.includes("macintosh")
          ? "macOS"
          : ua.includes("cros")
            ? "ChromeOS"
            : ua.includes("linux")
              ? "Linux"
              : "Other";
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("opr/") || ua.includes("opera")
      ? "Opera"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("chrome/") || ua.includes("crios/")
          ? "Chrome"
          : ua.includes("safari/")
            ? "Safari"
            : "Other";
  return { browser, os, device };
}

function validDomain(domain: string): boolean {
  return (
    domain === "localhost" ||
    (domain.length >= 3 &&
      domain.length <= 253 &&
      domain.includes(".") &&
      !/[ /:@?#]/u.test(domain))
  );
}

function hostMatches(host: string, propertyDomain: string): boolean {
  const normalizedHost = normalizeHostname(host);
  const normalizedDomain = normalizeHostname(propertyDomain);
  return (
    Boolean(normalizedHost) &&
    Boolean(normalizedDomain) &&
    (normalizedHost === normalizedDomain ||
      normalizedHost.endsWith(`.${normalizedDomain}`))
  );
}

function safeText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function occurredAt(value: unknown): string {
  if (typeof value !== "string") {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  const now = Date.now();
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getTime() < now - 24 * 60 * 60 * 1000 ||
    parsed.getTime() > now + 5 * 60 * 1000
  ) {
    return new Date(now).toISOString();
  }
  return parsed.toISOString();
}

function analyticsPath(value: unknown): string | null {
  const raw = typeof value === "string" && value ? value : "/";
  if (!raw.startsWith("/") || raw.length > 2048) {
    return null;
  }
  try {
    const parsed = new URL(raw, "https://appclimb.invalid");
    if (parsed.origin !== "https://appclimb.invalid") return null;
    return parsed.pathname || "/";
  } catch {
    return null;
  }
}

async function validateProperty(
  db: D1Database,
  claims: TrackingClaims,
  hostname: string,
): Promise<{ id: string; workspace_id: string; domain: string } | null> {
  const property = await db
    .prepare(
      `SELECT id,workspace_id,domain FROM web_properties
       WHERE id = ? AND workspace_id = ? AND token_version = ?`,
    )
    .bind(claims.p, claims.w, claims.v)
    .first<{ id: string; workspace_id: string; domain: string }>();
  return property && hostMatches(hostname, property.domain) ? property : null;
}

export async function createProperty(
  env: Cloudflare.Env,
  auth: AuthContext,
  nameValue: unknown,
  domainValue: unknown,
  appIdValue?: unknown,
): Promise<Record<string, unknown>> {
  const name = safeText(nameValue, 120);
  const domain = normalizeHostname(safeText(domainValue, 253));
  if (!name || !validDomain(domain)) {
    throw new Error("invalid_web_property");
  }
  // One property per domain per workspace. Any number of distinct Web SaaS
  // domains can be added (cardealertracker.app, appclimb.app, etc.).
  const existing = await env.DB.prepare(
    `SELECT id FROM web_properties
     WHERE workspace_id = ? AND domain = ? COLLATE NOCASE
     LIMIT 1`,
  )
    .bind(auth.workspaceId, domain)
    .first<{ id: string }>();
  if (existing) {
    throw new Error("web_property_exists");
  }
  const preferredAppId =
    typeof appIdValue === "string" && appIdValue.trim()
      ? appIdValue.trim()
      : null;
  const app = preferredAppId
    ? await env.DB.prepare(
        "SELECT id FROM apps WHERE workspace_id = ? AND id = ? LIMIT 1",
      )
        .bind(auth.workspaceId, preferredAppId)
        .first<{ id: string }>()
    : await env.DB.prepare(
        "SELECT id FROM apps WHERE workspace_id = ? ORDER BY created_at LIMIT 1",
      )
        .bind(auth.workspaceId)
        .first<{ id: string }>();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO web_properties(
      id,workspace_id,app_id,name,domain,token_version,retention_days,created_at,updated_at
     ) VALUES(?,?,?,?,?,1,90,?,?)`,
  )
    .bind(id, auth.workspaceId, app?.id ?? null, name, domain, now, now)
    .run();
  const trackingToken = await issueTrackingToken(
    requireSecret(env, "JWT_SECRET"),
    { w: auth.workspaceId, p: id, v: 1 },
  );
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "web_property.created",
    "web_property",
    id,
    { domain, appId: app?.id ?? null },
  );
  return {
    id,
    name,
    domain,
    trackingToken,
    tokenVersion: 1,
    retentionDays: 90,
    createdAt: now,
    appId: app?.id ?? null,
  };
}

/**
 * Ensures a first-party web property exists for a Web SaaS app so Acquisition
 * Atlas can collect visitors, UTMs, and crawlers immediately after add.
 */
export async function ensureWebPropertyForApp(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
  name: string,
  domainValue: string,
): Promise<{
  id: string;
  name: string;
  domain: string;
  trackingToken: string;
  tokenVersion: number;
  retentionDays: number;
  createdAt: string;
  created: boolean;
}> {
  const domain = normalizeHostname(safeText(domainValue, 253));
  if (!validDomain(domain)) {
    throw new Error("invalid_web_property");
  }
  const existing = await env.DB.prepare(
    `SELECT id,name,domain,token_version,retention_days,created_at,app_id
     FROM web_properties
     WHERE workspace_id = ? AND domain = ? COLLATE NOCASE
     LIMIT 1`,
  )
    .bind(auth.workspaceId, domain)
    .first<{
      id: string;
      name: string;
      domain: string;
      token_version: number;
      retention_days: number;
      created_at: string;
      app_id: string | null;
    }>();

  if (existing) {
    if (!existing.app_id) {
      await env.DB.prepare(
        `UPDATE web_properties
         SET app_id = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ? AND app_id IS NULL`,
      )
        .bind(appId, new Date().toISOString(), existing.id, auth.workspaceId)
        .run();
    }
    const trackingToken = await issueTrackingToken(
      requireSecret(env, "JWT_SECRET"),
      {
        w: auth.workspaceId,
        p: existing.id,
        v: existing.token_version,
      },
    );
    return {
      id: existing.id,
      name: existing.name,
      domain: existing.domain,
      trackingToken,
      tokenVersion: existing.token_version,
      retentionDays: existing.retention_days,
      createdAt: existing.created_at,
      created: false,
    };
  }

  const property = await createProperty(env, auth, name, domain, appId);
  return {
    id: String(property.id),
    name: String(property.name),
    domain: String(property.domain),
    trackingToken: String(property.trackingToken),
    tokenVersion: Number(property.tokenVersion) || 1,
    retentionDays: Number(property.retentionDays) || 90,
    createdAt: String(property.createdAt),
    created: true,
  };
}

export async function recordWebEvent(
  env: Cloudflare.Env,
  request: Request,
  input: Record<string, unknown>,
): Promise<"accepted" | "duplicate"> {
  const claims = await parseTrackingToken(
    requireSecret(env, "JWT_SECRET"),
    safeText(input.token, 2048),
  );
  const eventId = safeText(input.eventId, 64);
  const visitorId = safeText(input.visitorId, 64);
  const sessionId = safeText(input.sessionId, 64);
  const kind = safeText(input.kind, 24);
  const hostname = normalizeHostname(safeText(input.hostname, 253));
  const path = analyticsPath(input.path);
  if (
    !eventId ||
    !visitorId ||
    !sessionId ||
    !["page_view", "engagement", "conversion"].includes(kind) ||
    !path ||
    !validDomain(hostname)
  ) {
    throw new Error("invalid_analytics_event");
  }
  const property = await validateProperty(env.DB, claims, hostname);
  if (!property) {
    throw new Error("invalid_tracking_token");
  }
  const duration =
    typeof input.durationMs === "number" && Number.isInteger(input.durationMs)
      ? input.durationMs
      : null;
  if (duration !== null && (duration < 0 || duration > 86_400_000)) {
    throw new Error("invalid_analytics_event");
  }
  const utmSource = safeText(input.utmSource, 120);
  const utmMedium = safeText(input.utmMedium, 120);
  const source = acquisition(safeText(input.referrer, 2048), utmSource, utmMedium);
  const device = clientDevice(request.headers.get("user-agent") ?? "");
  const countryHeader =
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-appclimb-country") ??
    "";
  const countryCode = /^[A-Z]{2}$/u.test(countryHeader.toUpperCase())
    ? countryHeader.toUpperCase()
    : null;
  try {
    await env.DB.prepare(
      `INSERT INTO web_events(
         id,workspace_id,property_id,event_id,kind,visitor_id,session_id,
         occurred_at,hostname,path,referrer_host,source,channel,utm_source,
         utm_medium,utm_campaign,utm_term,utm_content,country_code,browser,
         operating_system,device,duration_ms,goal,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        crypto.randomUUID(),
        claims.w,
        property.id,
        eventId,
        kind,
        visitorId,
        sessionId,
        occurredAt(input.occurredAt),
        hostname,
        path,
        source.referrerHost || null,
        safeText(source.source, 120),
        source.channel,
        utmSource || null,
        utmMedium || null,
        safeText(input.utmCampaign, 160) || null,
        safeText(input.utmTerm, 160) || null,
        safeText(input.utmContent, 160) || null,
        countryCode,
        device.browser,
        device.os,
        device.device,
        duration,
        safeText(input.goal, 120) || null,
        new Date().toISOString(),
      )
      .run();
    await markPropertyVerified(env.DB, property.id, hostname);
    return "accepted";
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return "duplicate";
    }
    throw error;
  }
}

/**
 * Task P0.26 — persist verification metadata from the accepted-event path.
 *
 * Only real browser events reach this function: a saved domain and a
 * server-side crawler hit never mark a property as installed. The statement is
 * a single primary-key UPDATE, so there is no full-table scan, and the
 * throttle predicate keeps steady-state traffic from rewriting the row on
 * every page view.
 */
export async function markPropertyVerified(
  db: D1Database,
  propertyId: string,
  hostname: string,
  now: Date = new Date(),
): Promise<void> {
  const nowIso = now.toISOString();
  const throttleBefore = new Date(
    now.getTime() - VERIFICATION_REFRESH_MS,
  ).toISOString();
  await db
    .prepare(
      `UPDATE web_properties
       SET first_event_at = COALESCE(first_event_at, ?),
           verified_at = COALESCE(verified_at, ?),
           verified_hostname = COALESCE(verified_hostname, ?),
           installation_version = ?,
           last_event_at = ?,
           updated_at = ?
       WHERE id = ?
         AND (last_event_at IS NULL OR last_event_at < ?)`,
    )
    .bind(
      nowIso,
      nowIso,
      hostname,
      TRACKING_INSTALL_VERSION,
      nowIso,
      nowIso,
      propertyId,
      throttleBefore,
    )
    .run();
}

export async function recordCrawlerEvent(
  env: Cloudflare.Env,
  request: Request,
  input: Record<string, unknown>,
): Promise<"accepted" | "ignored" | "duplicate"> {
  const claims = await parseTrackingToken(
    requireSecret(env, "JWT_SECRET"),
    safeText(input.token, 2048),
  );
  const eventId = safeText(input.eventId, 64);
  const hostname = normalizeHostname(safeText(input.hostname, 253));
  const path = analyticsPath(input.path);
  if (!eventId || !path || !validDomain(hostname)) {
    throw new Error("invalid_crawler_event");
  }
  const property = await validateProperty(env.DB, claims, hostname);
  if (!property) {
    throw new Error("invalid_tracking_token");
  }
  const userAgent =
    request.headers.get("x-appclimb-original-user-agent") ??
    request.headers.get("user-agent") ??
    "";
  const crawler = classifyCrawlerUserAgent(userAgent);
  if (!crawler) {
    return "ignored";
  }
  const countryHeader =
    request.headers.get("cf-ipcountry") ??
    request.headers.get("x-appclimb-country") ??
    "";
  const countryCode = /^[A-Z]{2}$/u.test(countryHeader.toUpperCase())
    ? countryHeader.toUpperCase()
    : null;
  try {
    await env.DB.prepare(
      `INSERT INTO web_crawler_events(
        id,workspace_id,property_id,event_id,occurred_at,hostname,path,provider,
        agent,category,detection_method,country_code,created_at
       ) VALUES(?,?,?,?,?,?,?,?,?,?,'user_agent',?,?)`,
    )
      .bind(
        crypto.randomUUID(),
        claims.w,
        property.id,
        eventId,
        occurredAt(input.occurredAt),
        hostname,
        path,
        crawler.provider,
        crawler.agent,
        crawler.category,
        countryCode,
        new Date().toISOString(),
      )
      .run();
    return "accepted";
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint")) {
      return "duplicate";
    }
    throw error;
  }
}

interface PropertyRow {
  id: string;
  name: string;
  domain: string;
  token_version: number;
  retention_days: number;
  created_at: string;
}

async function resolveWebProperty(
  db: D1Database,
  workspaceId: string,
  appId = "",
): Promise<PropertyRow | null> {
  const selectCols =
    "id,name,domain,token_version,retention_days,created_at";
  if (appId) {
    const byApp = await db
      .prepare(
        `SELECT ${selectCols} FROM web_properties
         WHERE workspace_id = ? AND app_id = ?
         ORDER BY created_at LIMIT 1`,
      )
      .bind(workspaceId, appId)
      .first<PropertyRow>();
    if (byApp) return byApp;

    const webApp = await db
      .prepare(
        `SELECT bundle_id FROM apps
         WHERE workspace_id = ? AND id = ? AND platform = 'Web'
         LIMIT 1`,
      )
      .bind(workspaceId, appId)
      .first<{ bundle_id: string | null }>();
    if (webApp?.bundle_id) {
      const byDomain = await db
        .prepare(
          `SELECT ${selectCols} FROM web_properties
           WHERE workspace_id = ? AND domain = ? COLLATE NOCASE
           LIMIT 1`,
        )
        .bind(workspaceId, webApp.bundle_id)
        .first<PropertyRow>();
      if (byDomain) return byDomain;
    }
  }

  return db
    .prepare(
      `SELECT ${selectCols} FROM web_properties
       WHERE workspace_id = ?
       ORDER BY created_at LIMIT 1`,
    )
    .bind(workspaceId)
    .first<PropertyRow>();
}

function aliasFor(id: string): string {
  const adjectives = [
    "Amber",
    "Coral",
    "Indigo",
    "Juniper",
    "Silver",
    "Cobalt",
    "Sage",
    "Golden",
  ];
  const nouns = ["Lynx", "Fox", "Owl", "Kite", "Otter", "Puma", "Heron", "Wolf"];
  let hash = 2166136261;
  for (const character of id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const positive = hash >>> 0;
  return `${adjectives[positive % adjectives.length]} ${nouns[Math.floor(positive / adjectives.length) % nouns.length]}`;
}

export async function webAnalyticsSnapshot(
  env: Cloudflare.Env,
  workspaceId: string,
  windowDays: number,
  appId = "",
): Promise<Record<string, unknown>> {
  const generatedAt = new Date();
  const from = new Date(
    generatedAt.getTime() - windowDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const now = generatedAt.toISOString();
  const property = await resolveWebProperty(env.DB, workspaceId, appId);
  const empty = {
    generatedAt: now,
    totals: {
      visitors: 0,
      sessions: 0,
      pageviews: 0,
      engaged: 0,
      converted: 0,
      online: 0,
      averageSessionSeconds: 0,
    },
    series: [],
    channels: [],
    referrers: [],
    campaigns: [],
    utmSources: [],
    landingPages: [],
    visitors: [],
    crawlers: {
      requests: 0,
      verified: 0,
      series: [],
      providers: [],
      pages: [],
      categories: [],
      detectionLabel: "User-agent detected",
    },
  };
  if (!property) {
    return empty;
  }
  const sessionRows = await env.DB.prepare(
    `SELECT
       session_id,
       visitor_id,
       SUM(CASE WHEN kind = 'page_view' THEN 1 ELSE 0 END) AS pageviews,
       COALESCE(MAX(duration_ms),0) AS duration_ms,
       MAX(CASE WHEN kind = 'conversion' THEN 1 ELSE 0 END) AS converted,
       MAX(occurred_at) AS last_seen,
       MIN(channel) AS channel,
       MIN(source) AS source,
       MIN(COALESCE(referrer_host,'')) AS referrer_host,
       MIN(COALESCE(utm_campaign,'')) AS utm_campaign,
       MIN(COALESCE(utm_source,'')) AS utm_source,
       MIN(CASE WHEN kind = 'page_view' THEN path END) AS landing_path
     FROM web_events
     WHERE property_id = ? AND occurred_at >= ? AND occurred_at <= ?
     GROUP BY session_id, visitor_id`,
  )
    .bind(property.id, from, now)
    .all<{
      session_id: string;
      visitor_id: string;
      pageviews: number;
      duration_ms: number;
      converted: number;
      last_seen: string;
      channel: string;
      source: string;
      referrer_host: string;
      utm_campaign: string;
      utm_source: string;
      landing_path: string | null;
    }>();
  const sessions = sessionRows.results;
  const visitorIds = new Set(sessions.map((item) => item.visitor_id));
  const totals = {
    visitors: visitorIds.size,
    sessions: sessions.length,
    pageviews: sessions.reduce((sum, item) => sum + Number(item.pageviews), 0),
    engaged: sessions.filter(
      (item) => item.pageviews > 1 || item.duration_ms >= 10_000,
    ).length,
    converted: sessions.filter((item) => Boolean(item.converted)).length,
    online: sessions.filter(
      (item) => new Date(item.last_seen).getTime() >= generatedAt.getTime() - 5 * 60 * 1000,
    ).length,
    averageSessionSeconds:
      sessions.length === 0
        ? 0
        : sessions.reduce((sum, item) => sum + Number(item.duration_ms), 0) /
          sessions.length /
          1000,
  };
  const series = await env.DB.prepare(
    `SELECT
       substr(occurred_at,1,10) AS date,
       COUNT(DISTINCT visitor_id) AS visitors,
       COUNT(DISTINCT CASE WHEN kind = 'engagement' OR duration_ms >= 10000 THEN visitor_id END) AS engaged,
       COUNT(DISTINCT CASE WHEN kind = 'conversion' THEN visitor_id END) AS converted
     FROM web_events
     WHERE property_id = ? AND occurred_at >= ? AND occurred_at <= ?
     GROUP BY substr(occurred_at,1,10)
     ORDER BY date`,
  )
    .bind(property.id, from, now)
    .all<{ date: string; visitors: number; engaged: number; converted: number }>();
  const breakdown = (
    key: "channel" | "referrer_host" | "utm_campaign" | "utm_source",
  ) => {
    const grouped = new Map<
      string,
      { visitors: Set<string>; sessions: number; engaged: number; conversions: number; sources: Set<string> }
    >();
    for (const session of sessions) {
      const value = String(session[key] ?? "");
      if (!value) continue;
      const current = grouped.get(value) ?? {
        visitors: new Set<string>(),
        sessions: 0,
        engaged: 0,
        conversions: 0,
        sources: new Set<string>(),
      };
      current.visitors.add(session.visitor_id);
      current.sessions += 1;
      current.engaged += session.pageviews > 1 || session.duration_ms >= 10_000 ? 1 : 0;
      current.conversions += session.converted ? 1 : 0;
      current.sources.add(session.source);
      grouped.set(value, current);
    }
    return [...grouped.entries()]
      .map(([value, item]) => ({
        key: value,
        label: value,
        detail: [...item.sources].join(", "),
        visitors: item.visitors.size,
        engagedRate: item.sessions ? item.engaged / item.sessions : 0,
        conversions: item.conversions,
      }))
      .sort((left, right) => right.visitors - left.visitors || left.key.localeCompare(right.key))
      .slice(0, 12);
  };
  const landingGroups = new Map<
    string,
    { visitors: Set<string>; sessions: number; conversions: number }
  >();
  for (const session of sessions) {
    if (!session.landing_path) continue;
    const item = landingGroups.get(session.landing_path) ?? {
      visitors: new Set<string>(),
      sessions: 0,
      conversions: 0,
    };
    item.visitors.add(session.visitor_id);
    item.sessions += 1;
    item.conversions += session.converted ? 1 : 0;
    landingGroups.set(session.landing_path, item);
  }
  const landingPages = [...landingGroups.entries()]
    .map(([path, item]) => ({
      path,
      visitors: item.visitors.size,
      conversionRate: item.sessions ? item.conversions / item.sessions : 0,
    }))
    .sort((left, right) => right.visitors - left.visitors || left.path.localeCompare(right.path))
    .slice(0, 12);
  const visitorRows = await env.DB.prepare(
    `SELECT
       visitor_id AS id,
       MAX(COALESCE(country_code,'')) AS country_code,
       MAX(browser) AS browser,
       MAX(operating_system) AS os,
       MAX(device) AS device,
       MAX(channel) AS channel,
       MAX(source) AS source,
       MAX(occurred_at) AS last_seen,
       MAX(CASE WHEN kind = 'conversion' THEN 1 ELSE 0 END) AS converted,
       GROUP_CONCAT(CASE WHEN kind = 'page_view' THEN path END, '|') AS journey
     FROM web_events
     WHERE property_id = ? AND occurred_at >= ? AND occurred_at <= ?
     GROUP BY visitor_id
     ORDER BY last_seen DESC
     LIMIT 25`,
  )
    .bind(property.id, from, now)
    .all<{
      id: string;
      country_code: string;
      browser: string;
      os: string;
      device: string;
      channel: string;
      source: string;
      last_seen: string;
      converted: number;
      journey: string | null;
    }>();
  const crawlerRows = await env.DB.prepare(
    `SELECT provider,category,path,detection_method,occurred_at
     FROM web_crawler_events
     WHERE property_id = ? AND occurred_at >= ? AND occurred_at <= ?
     ORDER BY occurred_at`,
  )
    .bind(property.id, from, now)
    .all<{
      provider: string;
      category: string;
      path: string;
      detection_method: string;
      occurred_at: string;
    }>();
  const crawlers = crawlerRows.results;
  const categoryCounts = new Map<string, number>();
  const providerCounts = new Map<string, number>();
  const pageCounts = new Map<string, number>();
  const seriesCounts = new Map<string, number>();
  for (const row of crawlers) {
    categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
    providerCounts.set(
      `${row.category}\u0000${row.provider}`,
      (providerCounts.get(`${row.category}\u0000${row.provider}`) ?? 0) + 1,
    );
    pageCounts.set(
      `${row.category}\u0000${row.path}`,
      (pageCounts.get(`${row.category}\u0000${row.path}`) ?? 0) + 1,
    );
    const date = row.occurred_at.slice(0, 10);
    seriesCounts.set(
      `${date}\u0000${row.category}`,
      (seriesCounts.get(`${date}\u0000${row.category}`) ?? 0) + 1,
    );
  }
  const trackingToken = await issueTrackingToken(
    requireSecret(env, "JWT_SECRET"),
    { w: workspaceId, p: property.id, v: property.token_version },
  );
  return {
    ...empty,
    property: {
      id: property.id,
      name: property.name,
      domain: property.domain,
      trackingToken,
      tokenVersion: property.token_version,
      retentionDays: property.retention_days,
      createdAt: property.created_at,
    },
    totals,
    series: series.results,
    channels: breakdown("channel"),
    referrers: breakdown("referrer_host"),
    campaigns: breakdown("utm_campaign"),
    utmSources: breakdown("utm_source"),
    landingPages,
    visitors: visitorRows.results.map((row) => ({
      id: row.id,
      alias: aliasFor(row.id),
      countryCode: row.country_code,
      browser: row.browser,
      os: row.os,
      device: row.device,
      channel: row.channel,
      source: row.source,
      lastSeen: row.last_seen,
      journey: (row.journey ?? "").split("|").filter(Boolean).slice(0, 7),
      converted: Boolean(row.converted),
    })),
    crawlers: {
      requests: crawlers.length,
      verified: crawlers.filter((row) => row.detection_method === "verified_ip").length,
      series: [...seriesCounts.entries()].map(([key, requests]) => {
        const [date, category] = key.split("\u0000");
        return { date, category, requests };
      }),
      providers: [...providerCounts.entries()].map(([key, requests]) => {
        const [category, provider] = key.split("\u0000");
        return {
          provider,
          category,
          requests,
          share: requests / (categoryCounts.get(category) ?? requests),
        };
      }),
      pages: [...pageCounts.entries()].map(([key, requests]) => {
        const [category, path] = key.split("\u0000");
        return { path, category, requests };
      }),
      categories: [...categoryCounts.entries()].map(([category, requests]) => ({
        category,
        requests,
      })),
      detectionLabel: crawlers.some((row) => row.detection_method === "verified_ip")
        ? "User-agent + verified IP"
        : "User-agent detected",
    },
  };
}

interface InstallPropertyRow extends PropertyRow {
  first_event_at: string | null;
  last_event_at: string | null;
  verified_at: string | null;
  verified_hostname: string | null;
  installation_version: number | null;
  primary_conversion_goal: string | null;
  setup_step: string | null;
  setup_completed_at: string | null;
}

const INSTALL_COLUMNS =
  "id,name,domain,token_version,retention_days,created_at," +
  "first_event_at,last_event_at,verified_at,verified_hostname," +
  "installation_version,primary_conversion_goal,setup_step,setup_completed_at";

function isInstallStep(value: string): value is WebInstallStep {
  return (WEB_INSTALL_STEPS as readonly string[]).includes(value);
}

async function resolveInstallProperty(
  db: D1Database,
  workspaceId: string,
  appId = "",
): Promise<InstallPropertyRow | null> {
  if (appId) {
    const byApp = await db
      .prepare(
        `SELECT ${INSTALL_COLUMNS} FROM web_properties
         WHERE workspace_id = ? AND app_id = ?
         ORDER BY created_at LIMIT 1`,
      )
      .bind(workspaceId, appId)
      .first<InstallPropertyRow>();
    if (byApp) return byApp;

    const webApp = await db
      .prepare(
        `SELECT bundle_id FROM apps
         WHERE workspace_id = ? AND id = ? AND platform = 'Web'
         LIMIT 1`,
      )
      .bind(workspaceId, appId)
      .first<{ bundle_id: string | null }>();
    if (webApp?.bundle_id) {
      const byDomain = await db
        .prepare(
          `SELECT ${INSTALL_COLUMNS} FROM web_properties
           WHERE workspace_id = ? AND domain = ? COLLATE NOCASE
           LIMIT 1`,
        )
        .bind(workspaceId, webApp.bundle_id)
        .first<InstallPropertyRow>();
      if (byDomain) return byDomain;
    }
  }
  return db
    .prepare(
      `SELECT ${INSTALL_COLUMNS} FROM web_properties
       WHERE workspace_id = ?
       ORDER BY created_at LIMIT 1`,
    )
    .bind(workspaceId)
    .first<InstallPropertyRow>();
}

/**
 * Server-derived website setup state (Tasks P0.24 and P0.27).
 *
 * Returns only observed facts. A missing sample stays `null` so the client can
 * distinguish "not measured" from zero, and no field here claims a connection
 * that the collector has not seen.
 */
export async function webInstallSnapshot(
  env: Cloudflare.Env,
  workspaceId: string,
  appId = "",
): Promise<Record<string, unknown>> {
  const property = await resolveInstallProperty(env.DB, workspaceId, appId);
  if (!property) {
    return {
      property: null,
      install: { propertyId: null, reachedStep: "domain" },
      firstEvent: null,
    };
  }

  const verified = Boolean(property.first_event_at);
  const firstEventRow = verified
    ? await env.DB.prepare(
        `SELECT occurred_at,created_at,hostname,path,kind
         FROM web_events
         WHERE property_id = ?
         ORDER BY occurred_at
         LIMIT 1`,
      )
        .bind(property.id)
        .first<{
          occurred_at: string;
          created_at: string;
          hostname: string;
          path: string;
          kind: string;
        }>()
    : null;

  const from = new Date(
    Date.now() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const baseline = verified
    ? await env.DB.prepare(
        `SELECT COUNT(DISTINCT session_id) AS sessions,
                COUNT(DISTINCT substr(occurred_at,1,10)) AS days
         FROM web_events
         WHERE property_id = ? AND occurred_at >= ?`,
      )
        .bind(property.id, from)
        .first<{ sessions: number; days: number }>()
    : null;

  const trackingToken = await issueTrackingToken(
    requireSecret(env, "JWT_SECRET"),
    { w: workspaceId, p: property.id, v: property.token_version },
  );

  return {
    property: {
      id: property.id,
      name: property.name,
      domain: property.domain,
      trackingToken,
      tokenVersion: property.token_version,
      createdAt: property.created_at,
    },
    install: {
      propertyId: property.id,
      domain: property.domain,
      firstEventAt: property.first_event_at,
      lastEventAt: property.last_event_at,
      verifiedAt: property.verified_at,
      verifiedHostname: property.verified_hostname,
      installationVersion: property.installation_version,
      primaryConversionGoal: property.primary_conversion_goal,
      baselineSessions: baseline ? Number(baseline.sessions) : null,
      baselineDays: baseline ? Number(baseline.days) : null,
      reachedStep:
        property.setup_step && isInstallStep(property.setup_step)
          ? property.setup_step
          : verified
            ? "verify"
            : "install",
    },
    firstEvent: firstEventRow
      ? {
          acceptedAt: firstEventRow.created_at || firstEventRow.occurred_at,
          hostname: firstEventRow.hostname,
          path: firstEventRow.path,
          kind: firstEventRow.kind,
          source: "browser",
          collectorStatus: "accepted",
        }
      : null,
  };
}

/** Persists the furthest wizard step so a reload resumes in the right place. */
export async function saveInstallStep(
  env: Cloudflare.Env,
  auth: AuthContext,
  stepValue: unknown,
  appId = "",
): Promise<{ reachedStep: WebInstallStep }> {
  const step = safeText(stepValue, 24);
  if (!isInstallStep(step)) {
    throw new Error("invalid_install_step");
  }
  const property = await resolveInstallProperty(
    env.DB,
    auth.workspaceId,
    appId,
  );
  if (!property) {
    throw new Error("web_property_missing");
  }
  const current =
    property.setup_step && isInstallStep(property.setup_step)
      ? WEB_INSTALL_STEPS.indexOf(property.setup_step)
      : -1;
  const next = WEB_INSTALL_STEPS.indexOf(step);
  // Only ever move forward: a user revisiting step 2 must not lose step 5.
  const resolved = next > current ? step : (property.setup_step as WebInstallStep);
  const completedAt =
    resolved === "baseline" && property.first_event_at
      ? new Date().toISOString()
      : null;
  await env.DB.prepare(
    `UPDATE web_properties
     SET setup_step = ?,
         setup_completed_at = COALESCE(setup_completed_at, ?),
         updated_at = ?
     WHERE id = ? AND workspace_id = ?`,
  )
    .bind(
      resolved,
      completedAt,
      new Date().toISOString(),
      property.id,
      auth.workspaceId,
    )
    .run();
  return { reachedStep: resolved };
}

/** Step 5 — the goal that unblocks conversion diagnosis. */
export async function saveConversionGoal(
  env: Cloudflare.Env,
  auth: AuthContext,
  goalValue: unknown,
  appId = "",
): Promise<{ primaryConversionGoal: string }> {
  const goal = safeText(goalValue, 120)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  if (!goal) {
    throw new Error("invalid_conversion_goal");
  }
  const property = await resolveInstallProperty(
    env.DB,
    auth.workspaceId,
    appId,
  );
  if (!property) {
    throw new Error("web_property_missing");
  }
  await env.DB.prepare(
    `UPDATE web_properties
     SET primary_conversion_goal = ?, updated_at = ?
     WHERE id = ? AND workspace_id = ?`,
  )
    .bind(goal, new Date().toISOString(), property.id, auth.workspaceId)
    .run();
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "web_property.conversion_goal_set",
    "web_property",
    property.id,
    { goal },
  );
  return { primaryConversionGoal: goal };
}

export async function deleteExpiredAnalytics(env: Cloudflare.Env): Promise<number> {
  const properties = await env.DB.prepare(
    "SELECT id,retention_days FROM web_properties",
  ).all<{ id: string; retention_days: number }>();
  let deleted = 0;
  for (const property of properties.results) {
    const cutoff = new Date(
      Date.now() - property.retention_days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const [web, crawler] = await env.DB.batch([
      env.DB.prepare("DELETE FROM web_events WHERE property_id = ? AND occurred_at < ?")
        .bind(property.id, cutoff),
      env.DB.prepare(
        "DELETE FROM web_crawler_events WHERE property_id = ? AND occurred_at < ?",
      ).bind(property.id, cutoff),
    ]);
    deleted += Number(web.meta.changes ?? 0) + Number(crawler.meta.changes ?? 0);
  }
  return deleted;
}
