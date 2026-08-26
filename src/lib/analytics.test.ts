import { describe, expect, it, vi } from "vitest";

import {
  classifyBrowser,
  classifyDevice,
  countryFlag,
  countryName,
  generateVisitorHash,
  isBotUserAgent,
  queryAnalyticsSummary,
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

describe("analytics referrer sanitization", () => {
  it("cleans and normalizes referrer URLs", () => {
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

describe("recordPageview and queryAnalyticsSummary", () => {
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

  it("queries analytics summary and formats response", async () => {
    const prepareMock = vi.fn().mockImplementation((sql: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ visitors: 42, views: 120 }),
          all: vi.fn().mockImplementation(async () => {
            if (sql.includes("country")) {
              return { results: [{ country: "US", visitors: 30, views: 80 }, { country: "DE", visitors: 12, views: 40 }] };
            }
            if (sql.includes("referrer")) {
              return { results: [{ referrer: "google.com", views: 60 }, { referrer: "direct", views: 60 }] };
            }
            if (sql.includes("path")) {
              return { results: [{ path: "/", views: 90, visitors: 35 }, { path: "/pricing", views: 30, visitors: 15 }] };
            }
            if (sql.includes("device")) {
              return { results: [{ device: "desktop", count: 80 }, { device: "mobile", count: 40 }] };
            }
            if (sql.includes("ORDER BY date ASC")) {
              return { results: [{ date: "2026-08-25", visitors: 20, views: 50 }, { date: "2026-08-26", visitors: 22, views: 70 }] };
            }
            return {
              results: [
                {
                  timestamp: Math.floor(Date.now() / 1000) - 30,
                  country: "US",
                  path: "/",
                  referrer: "google.com",
                  device: "desktop",
                  browser: "chrome",
                },
              ],
            };
          }),
        }),
        all: vi.fn().mockResolvedValue({
          results: [
            {
              timestamp: Math.floor(Date.now() / 1000) - 30,
              country: "US",
              path: "/",
              referrer: "google.com",
              device: "desktop",
              browser: "chrome",
            },
          ],
        }),
      };
    });
    const dbMock = { prepare: prepareMock } as unknown as D1Database;

    const summaryToday = await queryAnalyticsSummary(dbMock, "today");
    expect(summaryToday.range).toBe("today");
    expect(summaryToday.totalVisitors).toBe(42);
    expect(summaryToday.totalPageviews).toBe(120);
    expect(summaryToday.topCountry?.code).toBe("US");
    expect(summaryToday.topReferrer?.name).toBe("google.com");
    expect(summaryToday.countries).toHaveLength(2);
    expect(summaryToday.referrers).toHaveLength(2);
    expect(summaryToday.pages).toHaveLength(2);
    expect(summaryToday.devices.desktop).toBe(80);
    expect(summaryToday.devices.mobile).toBe(40);
    expect(summaryToday.timeline).toHaveLength(2);
    expect(summaryToday.recent).toHaveLength(1);

    const summary30d = await queryAnalyticsSummary(dbMock, "30d");
    expect(summary30d.range).toBe("30d");
  });
});
