import { describe, expect, it, vi } from "vitest";

import {
  classifyBrowser,
  classifyDevice,
  classifyReferrer,
  countryFlag,
  countryName,
  generateVisitorHash,
  isAppEventName,
  isBotUserAgent,
  queryAnalyticsSummary,
  querySignupFunnel,
  recordEvent,
  recordPageview,
  sanitizeReferrer,
} from "./analytics";

describe("analytics bot detection", () => {
  it("detects search bots and crawlers", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)")).toBe(true);
    expect(isBotUserAgent("curl/7.64.1")).toBe(true);
    expect(isBotUserAgent("python-requests/2.25.1")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)")).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
  });

  it("permits real user agents", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
  });
});

describe("analytics referrer & AI intelligence classification", () => {
  it("classifies AI engine referrals accurately", () => {
    expect(classifyReferrer("https://chatgpt.com/")).toEqual({
      domain: "chatgpt.com",
      category: "ai",
      isAi: true,
      aiName: "ChatGPT",
    });
    expect(classifyReferrer("android-app://com.openai.chat")).toEqual({
      domain: "chatgpt.com",
      category: "ai",
      isAi: true,
      aiName: "ChatGPT",
    });
    expect(classifyReferrer(null, "chatgpt")).toEqual({
      domain: "chatgpt.com",
      category: "ai",
      isAi: true,
      aiName: "ChatGPT",
    });
    expect(classifyReferrer("https://www.perplexity.ai/search")).toEqual({
      domain: "perplexity.ai",
      category: "ai",
      isAi: true,
      aiName: "Perplexity AI",
    });
    expect(classifyReferrer("https://claude.ai/chat/123")).toEqual({
      domain: "claude.ai",
      category: "ai",
      isAi: true,
      aiName: "Claude",
    });
    expect(classifyReferrer("https://gemini.google.com/app")).toEqual({
      domain: "gemini.google.com",
      category: "ai",
      isAi: true,
      aiName: "Google Gemini",
    });
    expect(classifyReferrer("https://copilot.microsoft.com/")).toEqual({
      domain: "copilot.microsoft.com",
      category: "ai",
      isAi: true,
      aiName: "Microsoft Copilot",
    });
    expect(classifyReferrer("https://chat.deepseek.com/")).toEqual({
      domain: "chat.deepseek.com",
      category: "ai",
      isAi: true,
      aiName: "DeepSeek",
    });
    expect(classifyReferrer("https://grok.com/")).toEqual({
      domain: "grok.com",
      category: "ai",
      isAi: true,
      aiName: "Grok",
    });
    expect(classifyReferrer("https://cursor.com/")).toEqual({
      domain: "cursor.com",
      category: "ai",
      isAi: true,
      aiName: "Developer AI",
    });
  });

  it("cleans and normalizes standard search and social referrers", () => {
    expect(sanitizeReferrer(null)).toBe("direct");
    expect(sanitizeReferrer("")).toBe("direct");
    expect(sanitizeReferrer("invalid-url-string")).toBe("direct");
    expect(sanitizeReferrer("https://appclimb.app/pricing")).toBe("direct");
    expect(sanitizeReferrer("http://localhost:3000/test")).toBe("direct");
    expect(sanitizeReferrer("https://www.google.com/search?q=appclimb")).toBe("google.com");
    expect(sanitizeReferrer("https://bing.com/search")).toBe("bing.com");
    expect(sanitizeReferrer("https://yandex.com/search")).toBe("yandex.ru");
    expect(sanitizeReferrer("https://duckduckgo.com/")).toBe("duckduckgo.com");
    expect(sanitizeReferrer("https://t.co/xyz123")).toBe("x.com");
    expect(sanitizeReferrer("https://reddit.com/r/iOSProgramming")).toBe("reddit.com");
    expect(sanitizeReferrer("https://linkedin.com/feed")).toBe("linkedin.com");
    expect(sanitizeReferrer("https://github.com/skverall/Appclimb")).toBe("github.com");
    expect(sanitizeReferrer("https://news.ycombinator.com/item?id=123")).toBe("hacker-news");
    expect(sanitizeReferrer("https://producthunt.com/posts/appclimb")).toBe("producthunt.com");
    expect(sanitizeReferrer("https://otherblog.io/article")).toBe("otherblog.io");
  });
});

describe("analytics device and browser classification", () => {
  it("classifies devices based on screen width or user agent", () => {
    expect(classifyDevice("Mozilla/5.0", 375)).toBe("mobile");
    expect(classifyDevice("Mozilla/5.0", 768)).toBe("tablet");
    expect(classifyDevice("Mozilla/5.0", 1440)).toBe("desktop");
    expect(classifyDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("mobile");
    expect(classifyDevice("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe("tablet");
    expect(classifyDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
  });

  it("classifies browser family", () => {
    expect(classifyBrowser("Mozilla/5.0 (Macintosh) Chrome/120.0.0.0 Safari/537.36")).toBe("chrome");
    expect(classifyBrowser("Mozilla/5.0 (Macintosh) Version/17.0 Safari/605.1.15")).toBe("safari");
    expect(classifyBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0")).toBe("firefox");
    expect(classifyBrowser("Mozilla/5.0 Edg/120.0.0.0")).toBe("edge");
    expect(classifyBrowser("UnknownBrowser/1.0")).toBe("other");
  });
});

describe("analytics geography and visitor hashing", () => {
  it("formats country flags and names", () => {
    expect(countryFlag("US")).toBe("🇺🇸");
    expect(countryFlag("DE")).toBe("🇩🇪");
    expect(countryFlag("GB")).toBe("🇬🇧");
    expect(countryFlag("")).toBe("🌐");
    expect(countryFlag("INVALID")).toBe("🌐");
    expect(countryName("US")).toBe("United States");
    expect(countryName("DE")).toBe("Germany");
    expect(countryName("ZZ")).toBe("ZZ");
  });

  it("generates deterministic 16-character daily visitor hashes", async () => {
    const hash1 = await generateVisitorHash("192.168.1.1", "Mozilla/5.0", "2026-08-26");
    const hash2 = await generateVisitorHash("192.168.1.1", "Mozilla/5.0", "2026-08-26");
    const hash3 = await generateVisitorHash("192.168.1.1", "Mozilla/5.0", "2026-08-27");

    expect(hash1).toHaveLength(16);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });
});

describe("recordPageview and queryAnalyticsSummary with AI intelligence", () => {
  it("records pageview to database and rejects bots", async () => {
    const runMock = vi.fn().mockResolvedValue({});
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
    const dbMock = { prepare: prepareMock } as unknown as D1Database;

    const botResult = await recordPageview(dbMock, {
      path: "/",
      referrer: null,
      userAgent: "Googlebot/2.1",
      ip: "1.1.1.1",
      country: "US",
    });
    expect(botResult).toBe(false);
    expect(prepareMock).not.toHaveBeenCalled();

    const realResult = await recordPageview(dbMock, {
      path: "pricing/?src=tw#section",
      referrer: "https://t.co/abc",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0",
      ip: "1.1.1.1",
      country: "US",
      screenWidth: 1440,
    });
    expect(realResult).toBe(true);
    expect(prepareMock).toHaveBeenCalled();
    expect(bindMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      expect.any(String),
      "/pricing",
      "US",
      "x.com",
      "desktop",
      "chrome",
    );
  });

  it("handles db error in recordPageview gracefully", async () => {
    const prepareMock = vi.fn().mockImplementation(() => {
      throw new Error("DB failure");
    });
    const dbMock = { prepare: prepareMock } as unknown as D1Database;

    const result = await recordPageview(dbMock, {
      path: "/",
      referrer: null,
      userAgent: "Mozilla/5.0 (Macintosh)",
      ip: "1.1.1.1",
      country: "US",
    });
    expect(result).toBe(false);
  });

  it("queries analytics summary and formats response with AI metrics and user accounts", async () => {
    const prepareMock = vi.fn().mockImplementation((sql: string) => {
      const handleFirst = async () => {
        if (sql.includes("FROM users WHERE created_at")) return { count: 3 };
        if (sql.includes("FROM users")) return { count: 5 };
        if (sql.includes("FROM subscriptions WHERE plan = 'pro'")) return { count: 2 };
        return { visitors: 42, views: 120 };
      };

      const handleAll = async () => {
        if (sql.includes("FROM users u")) {
          return {
            results: [
              {
                id: "user-1",
                email: "founder@appclimb.app",
                name: "Founder",
                google_sub: "google-123",
                created_at: "2026-08-26 10:00:00",
                last_seen_at: "2026-08-26 12:00:00",
                plan: "pro",
                subscription_status: "active",
                sync_count: 2,
              },
            ],
          };
        }
        if (sql.includes("FROM users u")) {
          return {
            results: [
              {
                id: "user-1",
                email: "founder@appclimb.app",
                name: "Founder",
                google_sub: "google-123",
                created_at: "2026-08-26 10:00:00",
                last_seen_at: "2026-08-26 12:00:00",
                plan: "pro",
                subscription_status: "active",
                sync_count: 2,
              },
            ],
          };
        }
        if (sql.includes("GROUP BY country")) {
          return { results: [{ country: "US", visitors: 30, views: 80 }, { country: "DE", visitors: 12, views: 40 }] };
        }
        if (sql.includes("GROUP BY referrer")) {
          return {
            results: [
              { referrer: "chatgpt.com", views: 25 },
              { referrer: "google.com", views: 60 },
              { referrer: "perplexity.ai", views: 15 },
              { referrer: "direct", views: 20 },
            ],
          };
        }
        if (sql.includes("LIKE '%chatgpt%'") && sql.includes("GROUP BY path")) {
          return { results: [{ path: "/guides/keyword-research", visits: 20 }, { path: "/pricing", visits: 15 }] };
        }
        if (sql.includes("GROUP BY path")) {
          return { results: [{ path: "/", views: 90, visitors: 35 }, { path: "/pricing", views: 30, visitors: 15 }] };
        }
        if (sql.includes("GROUP BY device")) {
          return { results: [{ device: "desktop", count: 80 }, { device: "mobile", count: 40 }] };
        }
        if (sql.includes("ORDER BY date ASC")) {
          return { results: [{ date: "2026-08-25", visitors: 20, views: 50, ai_views: 15 }, { date: "2026-08-26", visitors: 22, views: 70, ai_views: 25 }] };
        }
        if (sql.includes("ORDER BY timestamp DESC")) {
          return {
            results: [
              {
                timestamp: Math.floor(Date.now() / 1000) - 30,
                country: "US",
                path: "/",
                referrer: "chatgpt.com",
                device: "desktop",
                browser: "chrome",
              },
            ],
          };
        }
        return { results: [] };
      };

      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(handleFirst),
          all: vi.fn().mockImplementation(handleAll),
        }),
        first: vi.fn().mockImplementation(handleFirst),
        all: vi.fn().mockImplementation(handleAll),
      };
    });
    const dbMock = { prepare: prepareMock } as unknown as D1Database;

    const summaryToday = await queryAnalyticsSummary(dbMock, "today");
    expect(summaryToday.range).toBe("today");
    expect(summaryToday.totalVisitors).toBe(42);
    expect(summaryToday.totalPageviews).toBe(120);
    expect(summaryToday.aiTraffic.totalVisits).toBe(40); // 25 (chatgpt) + 15 (perplexity)
    expect(summaryToday.aiTraffic.models).toHaveLength(2);
    expect(summaryToday.aiTraffic.topPages).toHaveLength(2);
    expect(summaryToday.topCountry?.code).toBe("US");
    expect(summaryToday.topReferrer?.name).toBe("chatgpt.com");
    expect(summaryToday.countries).toHaveLength(2);
    expect(summaryToday.referrers).toHaveLength(4);
    expect(summaryToday.pages).toHaveLength(2);
    expect(summaryToday.devices.desktop).toBe(80);
    expect(summaryToday.devices.mobile).toBe(40);
    expect(summaryToday.timeline).toHaveLength(2);
    expect(summaryToday.recent).toHaveLength(1);
    expect(summaryToday.recent[0].isAi).toBe(true);
    expect(summaryToday.recent[0].aiName).toBe("ChatGPT");

    // User Accounts Intelligence assertions
    expect(summaryToday.userAnalytics.totalUsers).toBe(5);
    expect(summaryToday.userAnalytics.newUsersInRange).toBe(3);
    expect(summaryToday.userAnalytics.proUsersCount).toBe(2);
    expect(summaryToday.userAnalytics.freeUsersCount).toBe(3);
    expect(summaryToday.userAnalytics.conversionRate).toBe(7.1); // (3 / 42) * 100
    expect(summaryToday.userAnalytics.recentUsers).toHaveLength(1);
    expect(summaryToday.userAnalytics.recentUsers[0].email).toBe("founder@appclimb.app");
    expect(summaryToday.userAnalytics.recentUsers[0].provider).toBe("google");

    const summary30d = await queryAnalyticsSummary(dbMock, "30d");
    expect(summary30d.range).toBe("30d");
    // Signup funnel falls back to zeros when the events table has no rows.
    expect(summary30d.signupFunnel.signupIntents).toBe(0);
    expect(summary30d.signupFunnel.authCompleted).toBe(0);
  });
});

describe("product event tracking (signup funnel)", () => {
  const REAL_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0";

  it("validates event names against the whitelist", () => {
    expect(isAppEventName("signup_intent_shown")).toBe(true);
    expect(isAppEventName("auth_completed")).toBe(true);
    expect(isAppEventName("made_up_event")).toBe(false);
    expect(isAppEventName(42)).toBe(false);
    expect(isAppEventName(undefined)).toBe(false);
  });

  it("records an event with normalized path, device, and truncated meta", async () => {
    const runMock = vi.fn().mockResolvedValue({});
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
    const dbMock = { prepare: prepareMock } as unknown as D1Database;

    const result = await recordEvent(dbMock, {
      name: "signup_intent_shown",
      path: "/?utm_source=x#top",
      userAgent: REAL_UA,
      ip: "1.1.1.1",
      country: "de",
      screenWidth: 375,
      meta: { intent: "track" },
    });
    expect(result).toBe(true);
    expect(bindMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Number),
      expect.any(String),
      "signup_intent_shown",
      "/",
      "DE",
      "mobile",
      '{"intent":"track"}',
    );
  });

  it("rejects bots and unknown event names", async () => {
    const prepareMock = vi.fn();
    const dbMock = { prepare: prepareMock } as unknown as D1Database;

    expect(
      await recordEvent(dbMock, {
        name: "auth_completed",
        path: "/",
        userAgent: "curl/8.0",
        ip: "1.1.1.1",
        country: "US",
      }),
    ).toBe(false);
    expect(prepareMock).not.toHaveBeenCalled();
  });

  it("handles db failures without throwing", async () => {
    const prepareMock = vi.fn().mockImplementation(() => {
      throw new Error("DB failure");
    });
    const dbMock = { prepare: prepareMock } as unknown as D1Database;

    expect(
      await recordEvent(dbMock, {
        name: "explorer_limit_hit",
        path: "/",
        userAgent: REAL_UA,
        ip: "1.1.1.1",
        country: "US",
      }),
    ).toBe(false);
  });

  it("counts unique visitors per funnel event", async () => {
    const prepareMock = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({
          results: [
            { name: "signup_intent_shown", visitors: 12 },
            { name: "auth_started", visitors: 7 },
            { name: "auth_completed", visitors: 3 },
            { name: "keyword_analyzed_first", visitors: 30 },
            { name: "account_nudge_shown", visitors: 9 },
            { name: "account_nudge_cta", visitors: 4 },
            { name: "explorer_limit_hit", visitors: 6 },
          ],
        }),
      }),
    });
    const dbMock = { prepare: prepareMock } as unknown as D1Database;

    const funnel = await querySignupFunnel(dbMock, "7d");
    expect(funnel.signupIntents).toBe(12);
    expect(funnel.authStarted).toBe(7);
    expect(funnel.authCompleted).toBe(3);
    expect(funnel.firstAnalyses).toBe(30);
    expect(funnel.nudgeShown).toBe(9);
    expect(funnel.nudgeCta).toBe(4);
    expect(funnel.limitHits).toBe(6);
  });

  it("returns zeros when the events query fails", async () => {
    const prepareMock = vi.fn().mockImplementation(() => {
      throw new Error("no table yet");
    });
    const dbMock = { prepare: prepareMock } as unknown as D1Database;

    const funnel = await querySignupFunnel(dbMock, "today");
    expect(funnel).toEqual({
      signupIntents: 0,
      authStarted: 0,
      authCompleted: 0,
      limitHits: 0,
      firstAnalyses: 0,
      nudgeShown: 0,
      nudgeCta: 0,
    });
  });
});
