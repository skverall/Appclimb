import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AiToolData } from "@/lib/ai-tools";
import { optimizeKeywordField } from "@/lib/aso-optimizer";
import { SUPPORTED_COUNTRIES } from "@/lib/aso";
import { AGENT_PRO_DAILY_CHECKS, consumeAgentChecks, readAgentUsage } from "@/lib/agent-usage";
import { AGENT_TOOLS, isAgentTool, runAgentTool, type AgentToolContext, type AgentToolResult } from "@/lib/agent-tools";
import { buildDataset, type TermHistoryPoint, type TermRow } from "@/lib/search-terms";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadAllMigrationsSql } from "../../tests/helpers/migration";

const ORIGIN = "https://appclimb.app";
const APP_ID = "1438388363";
const SUBJECT = "user:user-1";
const LATEST_WEEK = "2026-10-25";
const MIGRATIONS = loadAllMigrationsSql();
const BUSY = "The App Store is rate-limiting searches right now. Wait about a minute and retry the remaining keywords.";
const FREE_LIMIT = `The Free plan includes 30 App Store checks a day and today's are used up. They reset at 00:00 UTC; Pro is unlimited: ${ORIGIN}/pricing`;
const PRO_LIMIT = `Today's fair-use limit of ${AGENT_PRO_DAILY_CHECKS} App Store checks is used up. It resets at 00:00 UTC.`;
const OOPS = "Something went wrong on AppClimb's side. Try again in a moment.";

/* ------------------------------------------------------------------ */
/* Apple search-term fixtures (same approach as ai-tools.test.ts)        */
/* ------------------------------------------------------------------ */

const rows: TermRow[] = [
  { term: "habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 61, rankInGenre: 40 },
  { term: "habit tracker app", genre: "PRODUCTIVITY_UTILITIES", popularity: 52, rankInGenre: 90 },
  { term: "habit", genre: "PRODUCTIVITY_UTILITIES", popularity: 55 },
  { term: "streaks", genre: "PRODUCTIVITY_UTILITIES", popularity: 44, rankInGenre: 300 },
  { term: "calculator", genre: "PRODUCTIVITY_UTILITIES", popularity: 30, rankInGenre: 499 },
  { term: "flight tracker", genre: "TRAVEL", popularity: 66, rankInGenre: 12 },
  { term: "packing list", genre: "TRAVEL", popularity: 21, rankInGenre: 480 },
];
const current = buildDataset("US", LATEST_WEEK, rows);
const previous = buildDataset("US", "2026-09-27", [
  { term: "habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 55, rankInGenre: 60 },
  { term: "flight tracker", genre: "TRAVEL", popularity: 50, rankInGenre: 30 },
  { term: "calculator", genre: "PRODUCTIVITY_UTILITIES", popularity: 31, rankInGenre: 480 },
]);

/** 60 weeks of Apple history for "habit tracker", ending at 61 in the latest week. */
const HISTORY: TermHistoryPoint[] = Array.from({ length: 60 }, (_, index) => {
  const date = new Date(`${LATEST_WEEK}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (59 - index) * 7);
  return { week: date.toISOString().slice(0, 10), popularity: index + 2 };
});

function data(overrides: Partial<AiToolData> = {}): AiToolData {
  return {
    latest: vi.fn(async (country: string) => (country === "US" ? current : null)),
    weeksBefore: vi.fn(async () => previous),
    histories: vi.fn(async () => new Map([["habit tracker", HISTORY]])),
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* iTunes fixtures (shapes as in aso.test.ts / itunes.test.ts)          */
/* ------------------------------------------------------------------ */

function rawApp(id: number | string, name: string, ratings: number, extra: Record<string, unknown> = {}) {
  return {
    trackId: Number(id),
    trackName: name,
    bundleId: `com.example.app${id}`,
    sellerName: `${name} Inc.`,
    primaryGenreName: "Productivity",
    artworkUrl100: "https://example.com/icon.png",
    trackViewUrl: `https://apps.apple.com/us/app/id${id}`,
    userRatingCount: ratings,
    averageUserRating: 4.56,
    ...extra,
  };
}

const STREAKS = rawApp(1001, "Streaks", 48_000, { sellerName: "Crunchy Bagel" });
const HABITIFY = rawApp(1002, "Habitify: Habit Tracker", 21_000);
const OURS = rawApp(APP_ID, "Habit Tracker: Daily Goals", 900);
const NEWBIE = rawApp(1004, "Tiny Habits", 12, { averageUserRating: 0 });

const SEARCH: Record<string, unknown[]> = {
  "habit tracker": [STREAKS, HABITIFY, OURS, NEWBIE, rawApp(1005, "Done", 5_000), rawApp(1006, "Way of Life", 3_000)],
  "habit app for adhd": [STREAKS, HABITIFY, NEWBIE],
  "streak app": [STREAKS, NEWBIE],
  "empty results": [],
};

const CATALOG = [STREAKS, rawApp(1007, "Loop", 100, { bundleId: undefined, trackViewUrl: undefined })];

const DESCRIPTION = `Build better habits every day. Track habits, keep streaks and reach goals. ${"Habits stick when you track them daily. ".repeat(20)}`;

const LOOKUPS: Record<string, Record<string, unknown>> = {
  [APP_ID]: {
    trackId: Number(APP_ID),
    trackName: "Habit Tracker: Daily Streaks",
    primaryGenreName: "Productivity",
    sellerName: "Indie Studio",
    trackViewUrl: `https://apps.apple.com/us/app/id${APP_ID}`,
    description: DESCRIPTION,
  },
  "555555": { trackId: 555555, trackName: "Bare" },
  "666666": { trackId: 666666 },
};

type Route = (url: URL) => Response | Promise<Response>;

function appStore(url: URL): Response {
  if (url.pathname === "/lookup") {
    const found = LOOKUPS[url.searchParams.get("id") ?? ""];
    return Response.json({ results: found ? [found] : [] });
  }
  if (url.searchParams.get("limit") === "8") return Response.json({ results: CATALOG });
  return Response.json({ results: SEARCH[url.searchParams.get("term") ?? ""] ?? [] });
}

/** Fail requests for `term` (null = every request) `times` times, then answer normally. */
function failing(term: string | null, failure: number | Error, times = Number.POSITIVE_INFINITY): Route {
  let left = times;
  return (url) => {
    if ((term === null || url.searchParams.get("term") === term) && left > 0) {
      left -= 1;
      if (failure instanceof Error) throw failure;
      return new Response("busy", { status: failure });
    }
    return appStore(url);
  };
}

function itunes(route: Route = appStore) {
  return vi.fn<typeof fetch>(async (input) => route(new URL(String(input))));
}

/* ------------------------------------------------------------------ */
/* Harness                                                              */
/* ------------------------------------------------------------------ */

let db: FakeD1;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  db = await createTestDb(MIGRATIONS);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  db.close();
});

function ctx(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    userId: "user-1",
    plan: "free",
    db,
    data: data(),
    itunesFetch: itunes(),
    origin: ORIGIN,
    ...overrides,
  };
}

function used(): Promise<number> {
  return readAgentUsage(db, SUBJECT);
}

function list(result: AgentToolResult, key: string): Array<Record<string, unknown>> {
  return result.structured[key] as Array<Record<string, unknown>>;
}

/** Run with fake timers so the 1.5 s App Store retry does not slow the suite. */
async function settle(promise: Promise<AgentToolResult>): Promise<AgentToolResult> {
  let done = false;
  void promise.then(
    () => (done = true),
    () => (done = true),
  );
  for (let round = 0; round < 50 && !done; round += 1) {
    await vi.advanceTimersByTimeAsync(1_500);
  }
  return promise;
}

function useFakeRetryTimers(): void {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

/* ------------------------------------------------------------------ */
/* Definitions                                                          */
/* ------------------------------------------------------------------ */

describe("tool definitions", () => {
  it("declares ten read-only tools", () => {
    expect(AGENT_TOOLS.map((tool) => tool.name)).toEqual([
      "analyze_keywords",
      "get_keyword_popularity",
      "find_related_keywords",
      "autocomplete_keywords",
      "get_trending_keywords",
      "search_apps",
      "get_app_keyword_ideas",
      "check_app_rankings",
      "build_keyword_field",
      "get_account",
    ]);
    for (const tool of AGENT_TOOLS) {
      expect(tool.annotations).toMatchObject({ title: tool.title, readOnlyHint: true, destructiveHint: false });
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(isAgentTool(tool.name)).toBe(true);
    }
    expect(isAgentTool("drop_tables")).toBe(false);
  });

  it("marks live App Store tools as open-world and non-idempotent", () => {
    const live = AGENT_TOOLS.filter((tool) => tool.annotations.openWorldHint).map((tool) => tool.name);
    expect(live).toEqual(["analyze_keywords", "search_apps", "get_app_keyword_ideas", "check_app_rankings"]);
    for (const tool of AGENT_TOOLS) expect(tool.annotations.idempotentHint).toBe(!tool.annotations.openWorldHint);
    const analyze = AGENT_TOOLS[0].inputSchema as { properties: { country: { enum: string[] } }; required: string[] };
    expect(analyze.properties.country.enum).toEqual(SUPPORTED_COUNTRIES.map((country) => country.code));
    expect(analyze.required).toEqual(["keywords"]);
  });
});

/* ------------------------------------------------------------------ */
/* analyze_keywords                                                     */
/* ------------------------------------------------------------------ */

describe("analyze_keywords", () => {
  it("scores each keyword with Apple popularity, evidence, verdict and the app's rank", async () => {
    const context = ctx();
    const result = await runAgentTool(context, "analyze_keywords", {
      keywords: ["Habit Tracker", "habit app for adhd", "habit tracker"],
      app_id: `https://apps.apple.com/us/app/habit-tracker/id${APP_ID}`,
    });
    expect(result.isError).toBeUndefined();
    expect(result.structured).toMatchObject({ storefront: "US", apple_week: LATEST_WEEK, app_id: APP_ID });
    expect(result.structured.not_checked).toBeUndefined();
    expect(result.structured.notes).toBeUndefined();
    expect(result.structured.scale).toEqual(expect.stringContaining("not volume"));

    const [official, longTail] = list(result, "results");
    expect(list(result, "results")).toHaveLength(2);
    expect(official).toMatchObject({
      keyword: "habit tracker",
      popularity: 61,
      popularity_source: "apple_official",
      difficulty: expect.any(Number),
      difficulty_evidence: {
        top_results_sampled: 6,
        median_ratings_top10: expect.any(Number),
        weakest_app_ratings: 12,
        weakest_app_rank: 4,
        top10_names_matching_keyword: 2,
        big_brand_apps_in_top10: 0,
        brand_search: false,
      },
      verdict: expect.any(String),
      verdict_label: expect.any(String),
      reason: expect.any(String),
      opportunity_score: expect.any(Number),
      apps_in_results: 6,
      results_capped_at_200: false,
      app_rank: 3,
    });
    expect(official.app_rank_note).toBeUndefined();
    expect(official.top_apps).toHaveLength(5);
    expect((official.top_apps as unknown[])[0]).toEqual({
      rank: 1,
      app_id: "1001",
      name: "Streaks",
      developer: "Crunchy Bagel",
      ratings: 48_000,
      rating: 4.6,
    });
    expect((official.top_apps as Array<Record<string, unknown>>)[3]).toMatchObject({ name: "Tiny Habits", rating: null });

    // Not in Apple's list: only a ceiling (the Productivity floor), never a number.
    expect(longTail).toMatchObject({
      keyword: "habit app for adhd",
      popularity: null,
      popularity_at_most: 30,
      popularity_source: "apple_long_tail",
      popularity_note: expect.stringContaining("at or below"),
      app_rank: null,
      app_rank_note: "Not in the top 200.",
    });
    expect(await used()).toBe(2);
    expect(context.itunesFetch).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(context.itunesFetch!).mock.calls[0][0])).toContain("limit=200");
  });

  it("leaves app_rank out without app_id and accepts comma-separated text", async () => {
    const result = await runAgentTool(ctx(), "analyze_keywords", { keywords: "a, Habit Tracker\nstreak app", app_id: "" });
    const results = list(result, "results");
    expect(results.map((row) => row.keyword)).toEqual(["habit tracker", "streak app"]);
    for (const row of results) expect("app_rank" in row).toBe(false);
    expect(result.structured.app_id).toBeUndefined();
  });

  it("accepts a numeric app_id and a lowercase storefront", async () => {
    const result = await runAgentTool(ctx(), "analyze_keywords", {
      keywords: ["habit tracker"],
      app_id: Number(APP_ID),
      country: "gb",
    });
    expect(result.structured).toMatchObject({ storefront: "GB", app_id: APP_ID, apple_week: null });
    // No Apple data for GB: popularity is reported as unavailable, not estimated.
    expect(list(result, "results")[0]).toMatchObject({
      popularity: null,
      popularity_source: "unavailable",
      app_rank: 3,
    });
  });

  it("grants only the checks left today and lists the rest as not checked", async () => {
    await consumeAgentChecks(db, SUBJECT, 29, 30);
    const result = await runAgentTool(ctx(), "analyze_keywords", {
      keywords: ["habit tracker", "habit app for adhd", "streak app"],
    });
    expect(result.isError).toBeUndefined();
    expect(list(result, "results").map((row) => row.keyword)).toEqual(["habit tracker"]);
    expect(result.structured.not_checked).toEqual(["habit app for adhd", "streak app"]);
    expect(result.structured.notes).toEqual([FREE_LIMIT]);
    expect(await used()).toBe(30);
  });

  it("explains an exhausted free quota with the upgrade link", async () => {
    await consumeAgentChecks(db, SUBJECT, 30, 30);
    const context = ctx();
    const result = await runAgentTool(context, "analyze_keywords", { keywords: ["habit tracker"] });
    expect(result).toEqual({ structured: { error: FREE_LIMIT, limit_reached: true }, isError: true });
    expect(context.itunesFetch).not.toHaveBeenCalled();
  });

  it("explains an exhausted Pro fair-use cap without an upsell", async () => {
    await consumeAgentChecks(db, SUBJECT, AGENT_PRO_DAILY_CHECKS, AGENT_PRO_DAILY_CHECKS);
    const result = await runAgentTool(ctx({ plan: "pro" }), "analyze_keywords", { keywords: ["habit tracker"] });
    expect(result).toEqual({ structured: { error: PRO_LIMIT, limit_reached: true }, isError: true });
  });

  it("retries once when the App Store is busy", async () => {
    useFakeRetryTimers();
    const context = ctx({ itunesFetch: itunes(failing("habit tracker", 503, 1)) });
    const result = await settle(runAgentTool(context, "analyze_keywords", { keywords: ["habit tracker"] }));
    expect(list(result, "results")).toHaveLength(1);
    expect(context.itunesFetch).toHaveBeenCalledTimes(2);
    expect(await used()).toBe(1);
  });

  it("retries a network failure too", async () => {
    useFakeRetryTimers();
    const context = ctx({ itunesFetch: itunes(failing(null, new TypeError("fetch failed"), 1)) });
    const result = await settle(runAgentTool(context, "analyze_keywords", { keywords: ["streak app"] }));
    expect(list(result, "results")[0]).toMatchObject({ keyword: "streak app" });
  });

  it("refunds every check when the App Store keeps answering 429", async () => {
    useFakeRetryTimers();
    const context = ctx({ itunesFetch: itunes(failing(null, 429)) });
    const result = await settle(
      runAgentTool(context, "analyze_keywords", { keywords: ["habit tracker", "streak app", "habit app for adhd"] }),
    );
    expect(result).toEqual({
      structured: { error: BUSY, not_checked: ["habit tracker", "streak app", "habit app for adhd"] },
      isError: true,
    });
    // One try plus one retry for the first keyword; the rest are not attempted.
    expect(context.itunesFetch).toHaveBeenCalledTimes(2);
    expect(await used()).toBe(0);
    expect(consoleError).toHaveBeenCalledWith("[agent-tools] analyze failed:", "app_store_catalog_unavailable:429");
  });

  it("keeps finished results and refunds the rest when a later keyword hits 502", async () => {
    useFakeRetryTimers();
    const context = ctx({ itunesFetch: itunes(failing("streak app", 502)) });
    const result = await settle(
      runAgentTool(context, "analyze_keywords", { keywords: ["habit tracker", "streak app", "habit app for adhd"] }),
    );
    expect(result.isError).toBeUndefined();
    expect(list(result, "results").map((row) => row.keyword)).toEqual(["habit tracker"]);
    expect(result.structured.not_checked).toEqual(["streak app", "habit app for adhd"]);
    expect(result.structured.notes).toEqual([BUSY]);
    expect(await used()).toBe(1);
  });

  it("refunds only the granted checks that were not used when both the cap and Apple cut in", async () => {
    useFakeRetryTimers();
    await consumeAgentChecks(db, SUBJECT, 28, 30);
    const context = ctx({ itunesFetch: itunes(failing("streak app", 502)) });
    const result = await settle(
      runAgentTool(context, "analyze_keywords", { keywords: ["habit tracker", "streak app", "habit app for adhd"] }),
    );
    expect(result.structured.not_checked).toEqual(["habit app for adhd", "streak app"]);
    expect(result.structured.notes).toEqual([FREE_LIMIT, BUSY]);
    expect(await used()).toBe(29);
  });

  it("does not retry other App Store errors", async () => {
    const context = ctx({ itunesFetch: itunes(failing(null, 500)) });
    const result = await runAgentTool(context, "analyze_keywords", { keywords: ["habit tracker"] });
    expect(result).toMatchObject({ isError: true, structured: { not_checked: ["habit tracker"] } });
    expect(context.itunesFetch).toHaveBeenCalledTimes(1);
    expect(await used()).toBe(0);
  });

  it("reports popularity as unavailable when Apple data is missing or fails", async () => {
    const empty = buildDataset("US", LATEST_WEEK, []);
    for (const source of [
      null,
      data({ latest: vi.fn(async () => Promise.reject(new Error("D1 down"))) }),
      data({ latest: vi.fn(async () => empty) }),
    ]) {
      const result = await runAgentTool(ctx({ data: source }), "analyze_keywords", { keywords: ["habit tracker"] });
      expect(list(result, "results")[0]).toMatchObject({
        popularity: null,
        popularity_source: "unavailable",
        popularity_note: expect.stringContaining("unavailable"),
      });
    }
  });

  it("reports no-result keywords with empty evidence", async () => {
    const result = await runAgentTool(ctx(), "analyze_keywords", { keywords: ["empty results"], app_id: APP_ID });
    expect(list(result, "results")[0]).toMatchObject({
      apps_in_results: 0,
      top_apps: [],
      app_rank: null,
      difficulty_evidence: { top_results_sampled: 0, weakest_app_rank: null },
    });
  });

  it("rejects bad input before spending checks", async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ keywords: ["habit tracker"], country: "XX" }, /^Unsupported storefront\. Use one of: US, GB, /u],
      [{ keywords: ["habit tracker"], country: 5 }, /Unsupported storefront/u],
      [{ keywords: [] }, /at least one keyword of 2\+ characters/u],
      [{ keywords: [5, "x"] }, /at least one keyword/u],
      [{}, /at least one keyword/u],
      [{ keywords: Array.from({ length: 11 }, (_, index) => `keyword ${index}`) }, /at most 10 keywords/u],
      [{ keywords: ["habit tracker"], app_id: "abc" }, /^app_id must be an App Store app ID/u],
      [{ keywords: ["habit tracker"], app_id: { id: 1 } }, /^app_id must be/u],
    ];
    for (const [args, message] of cases) {
      const result = await runAgentTool(ctx(), "analyze_keywords", args);
      expect(result.isError).toBe(true);
      expect(String(result.structured.error)).toMatch(message);
    }
    expect(await used()).toBe(0);
  });

  it("says when live App Store checks are not configured", async () => {
    const result = await runAgentTool(ctx({ itunesFetch: null }), "analyze_keywords", { keywords: ["habit tracker"] });
    expect(result).toEqual({
      structured: { error: "Live App Store checks are not available on this server right now." },
      isError: true,
    });
    expect(await used()).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* get_keyword_popularity                                               */
/* ------------------------------------------------------------------ */

describe("get_keyword_popularity", () => {
  it("returns Apple scores with trends, and 12 weeks of history on Free", async () => {
    const source = data();
    const result = await runAgentTool(ctx({ data: source }), "get_keyword_popularity", {
      keywords: ["Habit Tracker", "habit", "habit app for adhd"],
      include_history: true,
    });
    expect(result.isError).toBeUndefined();
    expect(result.structured).toMatchObject({ storefront: "US", apple_week: LATEST_WEEK, history_weeks_available: 12 });
    const [tracker, habit, longTail] = list(result, "results");
    expect(tracker).toMatchObject({
      keyword: "habit tracker",
      popularity: 61,
      popularity_source: "apple_official",
      category: "Productivity & Utilities",
      rank_in_category: 40,
      change_4w: 4,
      change_12w: 12,
    });
    expect(tracker.history).toEqual(HISTORY.slice(-12));
    expect(habit).toMatchObject({ keyword: "habit", rank_in_category: null, change_4w: null, history: [] });
    expect(longTail).toEqual({
      keyword: "habit app for adhd",
      popularity: null,
      popularity_at_most: 21,
      popularity_source: "apple_long_tail",
      popularity_note: expect.stringContaining("ceiling"),
    });
    expect(source.histories).toHaveBeenCalledWith(current, ["habit tracker", "habit"]);
    expect(await used()).toBe(0);
  });

  it("returns 52 weeks of history on Pro", async () => {
    const result = await runAgentTool(ctx({ plan: "pro" }), "get_keyword_popularity", {
      keywords: ["habit tracker"],
      include_history: true,
    });
    expect(result.structured.history_weeks_available).toBe(52);
    expect(list(result, "results")[0].history).toEqual(HISTORY.slice(-52));
  });

  it("omits history unless include_history is true", async () => {
    for (const include of [undefined, "true", 1]) {
      const result = await runAgentTool(ctx({ plan: "pro" }), "get_keyword_popularity", {
        keywords: ["habit tracker"],
        include_history: include,
      });
      expect(list(result, "results")[0].history).toBeUndefined();
      expect(result.structured.history_weeks_available).toBeUndefined();
      expect(list(result, "results")[0].change_4w).toBe(4);
    }
  });

  it("still answers when history fails, and skips it for long-tail-only requests", async () => {
    const broken = data({ histories: vi.fn(async () => Promise.reject(new Error("429"))) });
    const result = await runAgentTool(ctx({ data: broken }), "get_keyword_popularity", { keywords: ["habit tracker"] });
    expect(list(result, "results")[0]).toMatchObject({ popularity: 61, change_4w: null, change_12w: null });

    const source = data();
    const longTail = await runAgentTool(ctx({ data: source }), "get_keyword_popularity", { keywords: ["zz top app"] });
    expect(list(longTail, "results")[0]).toMatchObject({ popularity: null, popularity_at_most: 21 });
    expect(source.histories).not.toHaveBeenCalled();
  });

  it("reports missing Apple data plainly", async () => {
    expect(await runAgentTool(ctx({ data: null }), "get_keyword_popularity", { keywords: ["habit"] })).toEqual({
      structured: { error: "Apple's popularity data is not available on this server right now." },
      isError: true,
    });
    expect(await runAgentTool(ctx(), "get_keyword_popularity", { keywords: ["habit"], country: "DE" })).toEqual({
      structured: { error: "Apple has not published search-term data for the DE storefront." },
      isError: true,
    });
    const tooMany = await runAgentTool(ctx(), "get_keyword_popularity", {
      keywords: Array.from({ length: 26 }, (_, index) => `term ${index}`),
    });
    expect(tooMany.structured.error).toBe("Pass at most 25 keywords per call.");
  });
});

/* ------------------------------------------------------------------ */
/* Apple data tools                                                     */
/* ------------------------------------------------------------------ */

describe("find_related_keywords, autocomplete_keywords and get_trending_keywords", () => {
  it("finds related Apple searches for a seed keyword", async () => {
    const result = await runAgentTool(ctx(), "find_related_keywords", { keyword: "habit tracker", limit: 5 });
    expect(result.isError).toBeUndefined();
    expect(result.structured).toMatchObject({ storefront: "US", week: LATEST_WEEK, seed: "habit tracker" });
    expect(list(result, "related")[0]).toMatchObject({ term: "habit tracker app", same_category: true });
  });

  it("completes a prefix by popularity", async () => {
    const result = await runAgentTool(ctx(), "autocomplete_keywords", { prefix: "hab" });
    expect(list(result, "terms").map((row) => row.term)).toEqual(["habit tracker", "habit", "habit tracker app"]);
  });

  it("lists rising terms, optionally within one category", async () => {
    const travel = await runAgentTool(ctx(), "get_trending_keywords", { category: "TRAVEL" });
    expect(travel.structured).toMatchObject({ category: "Travel", compared_with_week: "2026-09-27" });
    expect(list(travel, "rising")).toEqual([{ term: "flight tracker", popularity: 66, change_4w: 16 }]);
    const all = await runAgentTool(ctx(), "get_trending_keywords", {});
    expect(all.structured.category).toBe("all categories");
  });

  it("turns Apple-data errors into tool errors", async () => {
    const missingSeed = await runAgentTool(ctx(), "find_related_keywords", {});
    expect(missingSeed).toEqual({ structured: { error: "Pass a seed keyword." }, isError: true });
    const noStorefront = await runAgentTool(ctx(), "autocomplete_keywords", { prefix: "hab", country: "DE" });
    expect(noStorefront.isError).toBe(true);
    expect(String(noStorefront.structured.error)).toMatch(/DE storefront/u);
    for (const name of ["find_related_keywords", "autocomplete_keywords", "get_trending_keywords"]) {
      expect(await runAgentTool(ctx({ data: null }), name, { keyword: "habit", prefix: "hab" })).toEqual({
        structured: { error: "Apple's popularity data is not available on this server right now." },
        isError: true,
      });
    }
    const badCountry = await runAgentTool(ctx(), "get_trending_keywords", { country: "ZZ" });
    expect(String(badCountry.structured.error)).toMatch(/Unsupported storefront/u);
  });
});

/* ------------------------------------------------------------------ */
/* search_apps                                                          */
/* ------------------------------------------------------------------ */

describe("search_apps", () => {
  it("finds apps with IDs, developers and categories without spending checks", async () => {
    const context = ctx();
    const result = await runAgentTool(context, "search_apps", { query: "  habit ", country: "jp" });
    expect(result.structured).toEqual({
      storefront: "JP",
      query: "habit",
      apps: [
        {
          app_id: "1001",
          name: "Streaks",
          developer: "Crunchy Bagel",
          category: "Productivity",
          bundle_id: "com.example.app1001",
          url: "https://apps.apple.com/us/app/id1001",
        },
        {
          app_id: "1007",
          name: "Loop",
          developer: "Loop Inc.",
          category: "Productivity",
          bundle_id: undefined,
          url: undefined,
        },
      ],
    });
    const url = new URL(String(vi.mocked(context.itunesFetch!).mock.calls[0][0]));
    expect(url.searchParams.get("term")).toBe("habit");
    expect(url.searchParams.get("country")).toBe("JP");
    expect(await used()).toBe(0);
  });

  it("validates the query and the server setup", async () => {
    for (const query of ["h", 5, "x".repeat(81), undefined]) {
      expect(await runAgentTool(ctx(), "search_apps", { query })).toEqual({
        structured: { error: "query must be 2–80 characters." },
        isError: true,
      });
    }
    expect((await runAgentTool(ctx({ itunesFetch: null }), "search_apps", { query: "habit" })).structured.error).toMatch(
      /not available/u,
    );
  });

  it("maps App Store failures to busy or generic errors", async () => {
    const busy = await runAgentTool(ctx({ itunesFetch: itunes(failing(null, 429)) }), "search_apps", { query: "habit" });
    expect(busy).toEqual({ structured: { error: BUSY }, isError: true });
    const broken = await runAgentTool(ctx({ itunesFetch: itunes(failing(null, 500)) }), "search_apps", { query: "habit" });
    expect(broken).toEqual({ structured: { error: OOPS }, isError: true });
    expect(consoleError).toHaveBeenCalledWith(
      "[agent-tools] tool failed:",
      "search_apps",
      "Error: app_store_catalog_unavailable:500",
    );
  });
});

/* ------------------------------------------------------------------ */
/* get_app_keyword_ideas                                                */
/* ------------------------------------------------------------------ */

describe("get_app_keyword_ideas", () => {
  it("proposes keywords from the listing, most popular first, for one check", async () => {
    const result = await runAgentTool(ctx(), "get_app_keyword_ideas", { app_id: APP_ID });
    expect(result.isError).toBeUndefined();
    expect(result.structured).toMatchObject({
      storefront: "US",
      apple_week: LATEST_WEEK,
      app: {
        app_id: APP_ID,
        name: "Habit Tracker: Daily Streaks",
        developer: "Indie Studio",
        category: "Productivity",
        url: `https://apps.apple.com/us/app/id${APP_ID}`,
        description_start: DESCRIPTION.slice(0, 600),
      },
      next_step: expect.stringContaining("analyze_keywords"),
    });
    const ideas = list(result, "ideas");
    expect(ideas.length).toBeGreaterThan(5);
    expect(ideas.length).toBeLessThanOrEqual(20);
    expect(ideas.slice(0, 3)).toEqual([
      { keyword: "habit tracker", source: "Related phrase", popularity: 61, popularity_source: "apple_official" },
      { keyword: "habit", source: "App title", popularity: 55, popularity_source: "apple_official" },
      { keyword: "streaks", source: "App title", popularity: 44, popularity_source: "apple_official" },
    ]);
    expect(ideas.find((idea) => idea.keyword === "habit tracker daily streaks")).toEqual({
      keyword: "habit tracker daily streaks",
      source: "App title",
      popularity: null,
      popularity_at_most: 30,
      popularity_source: "apple_long_tail",
    });
    expect(await used()).toBe(1);
  });

  it("copes with sparse listings and missing Apple data", async () => {
    const bare = await runAgentTool(ctx({ data: null }), "get_app_keyword_ideas", { app_id: "555555" });
    expect(bare.structured).toMatchObject({ apple_week: null, app: { app_id: "555555", name: "Bare" } });
    const app = bare.structured.app as Record<string, unknown>;
    expect(app.developer).toBeUndefined();
    expect(app.category).toBeUndefined();
    expect(app.url).toBeUndefined();
    expect(app.description_start).toBeUndefined();
    expect(list(bare, "ideas")).toEqual([{ keyword: "bare", source: "App title", popularity: null, popularity_source: "unavailable" }]);

    const nameless = await runAgentTool(ctx(), "get_app_keyword_ideas", { app_id: "666666" });
    expect(nameless.structured).toMatchObject({ app: { name: "" }, ideas: [] });

    const sparse = await runAgentTool(ctx(), "get_app_keyword_ideas", { app_id: "555555" });
    expect(list(sparse, "ideas")[0]).toMatchObject({ popularity_at_most: 21, popularity_source: "apple_long_tail" });
  });

  it("refunds the check when the app does not exist", async () => {
    const result = await runAgentTool(ctx(), "get_app_keyword_ideas", { app_id: "999999" });
    expect(result).toEqual({
      structured: { error: "No app with ID 999999 in the US App Store. Check the ID with search_apps." },
      isError: true,
    });
    expect(await used()).toBe(0);
  });

  it("refunds the check when the App Store fails", async () => {
    const busy = await runAgentTool(ctx({ itunesFetch: itunes(failing(null, 429)) }), "get_app_keyword_ideas", {
      app_id: APP_ID,
    });
    expect(busy).toEqual({ structured: { error: BUSY }, isError: true });
    const broken = await runAgentTool(ctx({ itunesFetch: itunes(failing(null, 500)) }), "get_app_keyword_ideas", {
      app_id: APP_ID,
    });
    expect(broken).toEqual({ structured: { error: OOPS }, isError: true });
    expect(await used()).toBe(0);
  });

  it("checks quota, app_id and server setup", async () => {
    expect((await runAgentTool(ctx(), "get_app_keyword_ideas", {})).structured.error).toMatch(/^app_id must be/u);
    expect((await runAgentTool(ctx({ itunesFetch: null }), "get_app_keyword_ideas", { app_id: APP_ID })).structured.error).toMatch(
      /not available/u,
    );
    await consumeAgentChecks(db, SUBJECT, 30, 30);
    expect(await runAgentTool(ctx(), "get_app_keyword_ideas", { app_id: APP_ID })).toEqual({
      structured: { error: FREE_LIMIT, limit_reached: true },
      isError: true,
    });
  });
});

/* ------------------------------------------------------------------ */
/* check_app_rankings                                                   */
/* ------------------------------------------------------------------ */

describe("check_app_rankings", () => {
  const keywords = ["habit tracker", "habit app for adhd", "empty results"];

  it("reports the app's position for each keyword", async () => {
    const result = await runAgentTool(ctx(), "check_app_rankings", { app_id: APP_ID, keywords });
    expect(result.isError).toBeUndefined();
    expect(result.structured).toMatchObject({
      storefront: "US",
      app_id: APP_ID,
      checked_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
      scale: expect.stringContaining("top 200"),
    });
    expect(list(result, "rankings")).toEqual([
      { keyword: "habit tracker", rank: 3, ranked: true, leader: "Streaks" },
      { keyword: "habit app for adhd", rank: null, ranked: false, leader: "Streaks" },
      { keyword: "empty results", rank: null, ranked: false, leader: null },
    ]);
    expect(result.structured.not_checked).toBeUndefined();
    expect(result.structured.notes).toBeUndefined();
    expect(await used()).toBe(3);
  });

  it("checks only what today's quota allows", async () => {
    await consumeAgentChecks(db, SUBJECT, 28, 30);
    const result = await runAgentTool(ctx(), "check_app_rankings", { app_id: APP_ID, keywords });
    expect(list(result, "rankings")).toHaveLength(2);
    expect(result.structured.not_checked).toEqual(["empty results"]);
    expect(result.structured.notes).toEqual([FREE_LIMIT]);
    expect(await used()).toBe(30);
  });

  it("stops at the first busy answer and refunds the rest", async () => {
    const context = ctx({ itunesFetch: itunes(failing("habit app for adhd", 429)) });
    const result = await runAgentTool(context, "check_app_rankings", { app_id: APP_ID, keywords });
    expect(list(result, "rankings").map((row) => row.keyword)).toEqual(["habit tracker"]);
    expect(result.structured.not_checked).toEqual(["habit app for adhd", "empty results"]);
    expect(result.structured.notes).toEqual([BUSY]);
    expect(context.itunesFetch).toHaveBeenCalledTimes(2);
    expect(await used()).toBe(1);
  });

  it("fails with everything not checked when the first keyword is busy", async () => {
    await consumeAgentChecks(db, SUBJECT, 28, 30);
    const context = ctx({ itunesFetch: itunes(failing(null, new TypeError("fetch failed"))) });
    const result = await runAgentTool(context, "check_app_rankings", { app_id: APP_ID, keywords });
    expect(result).toEqual({
      structured: { error: BUSY, not_checked: ["empty results", "habit tracker", "habit app for adhd"] },
      isError: true,
    });
    expect(await used()).toBe(28);
  });

  it("refunds every check after a non-busy App Store error and says so", async () => {
    const result = await runAgentTool(ctx({ itunesFetch: itunes(failing(null, 500)) }), "check_app_rankings", {
      app_id: APP_ID,
      keywords,
    });
    expect(result.isError).toBe(true);
    expect(result.structured.error).toMatch(/^An App Store search failed/u);
    expect(result.structured.not_checked).toEqual(keywords);
    expect(await used()).toBe(0);
  });

  it("validates input", async () => {
    const tooMany = Array.from({ length: 26 }, (_, index) => `keyword ${index}`);
    expect((await runAgentTool(ctx(), "check_app_rankings", { app_id: APP_ID, keywords: tooMany })).structured.error).toBe(
      "Pass at most 25 keywords per call.",
    );
    expect((await runAgentTool(ctx(), "check_app_rankings", { app_id: "x", keywords })).structured.error).toMatch(
      /^app_id must be/u,
    );
    expect(
      (await runAgentTool(ctx({ itunesFetch: null }), "check_app_rankings", { app_id: APP_ID, keywords })).structured.error,
    ).toMatch(/not available/u);
    await consumeAgentChecks(db, SUBJECT, 30, 30);
    expect((await runAgentTool(ctx(), "check_app_rankings", { app_id: APP_ID, keywords })).structured).toEqual({
      error: FREE_LIMIT,
      limit_reached: true,
    });
  });
});

/* ------------------------------------------------------------------ */
/* build_keyword_field                                                  */
/* ------------------------------------------------------------------ */

describe("build_keyword_field", () => {
  it("packs words, dropping duplicates and words already in the title or subtitle", async () => {
    const result = await runAgentTool(ctx(), "build_keyword_field", {
      keywords: ["habit", "Tracker", "streak", "Streak", "daily goals", 5],
      title: "Habit Tracker",
      subtitle: "Daily routines",
    });
    expect(result).toEqual({
      structured: {
        keyword_field: "streak,goals",
        characters: 12,
        characters_left: 88,
        included: ["streak", "goals"],
        did_not_fit: [],
        removed_duplicates: ["streak"],
        removed_already_in_title_or_subtitle: ["habit", "tracker", "daily"],
        note: expect.stringContaining("list words, not phrases"),
      },
    });
  });

  it("stops at 100 characters and reads at most 100 keywords", async () => {
    const keywords = Array.from({ length: 120 }, (_, index) => `keyword${index}`);
    const result = await runAgentTool(ctx(), "build_keyword_field", { keywords, title: 7, subtitle: null });
    const expected = optimizeKeywordField(keywords.slice(0, 100));
    expect(result.structured).toMatchObject({
      keyword_field: expected.optimized,
      characters: expected.charCount,
      included: expected.keywordsIncluded,
      did_not_fit: expected.keywordsTruncated,
    });
    expect((result.structured.included as string[]).length + (result.structured.did_not_fit as string[]).length).toBe(100);
    expect(result.structured.characters as number).toBeLessThanOrEqual(100);
  });

  it("needs at least one keyword", async () => {
    for (const args of [{}, { keywords: [] }, { keywords: [1, 2] }, { keywords: "habit" }]) {
      expect(await runAgentTool(ctx(), "build_keyword_field", args)).toEqual({
        structured: { error: "Pass at least one keyword." },
        isError: true,
      });
    }
  });
});

/* ------------------------------------------------------------------ */
/* get_account                                                          */
/* ------------------------------------------------------------------ */

describe("get_account", () => {
  it("shows the free plan's checks left today and the upgrade link", async () => {
    await consumeAgentChecks(db, SUBJECT, 4, 30);
    expect(await runAgentTool(ctx(), "get_account", {})).toEqual({
      structured: {
        plan: "Free",
        app_store_checks_per_day: 30,
        app_store_checks_used_today: 4,
        app_store_checks_left_today: 26,
        resets: "00:00 UTC",
        apple_history_weeks: 12,
        storefronts: SUPPORTED_COUNTRIES.map((country) => country.code),
        upgrade_url: `${ORIGIN}/pricing`,
      },
    });
  });

  it("shows Pro's fair-use cap and 52 weeks of history", async () => {
    const result = await runAgentTool(ctx({ plan: "pro" }), "get_account", undefined);
    expect(result.structured).toMatchObject({
      plan: "Pro",
      app_store_checks_per_day: AGENT_PRO_DAILY_CHECKS,
      app_store_checks_used_today: 0,
      app_store_checks_left_today: AGENT_PRO_DAILY_CHECKS,
      apple_history_weeks: 52,
    });
    expect(result.structured.upgrade_url).toBeUndefined();
  });

  it("never reports a negative balance", async () => {
    await consumeAgentChecks(db, SUBJECT, 45, 100);
    const result = await runAgentTool(ctx(), "get_account", {});
    expect(result.structured).toMatchObject({ app_store_checks_used_today: 45, app_store_checks_left_today: 0 });
  });
});

/* ------------------------------------------------------------------ */
/* runAgentTool                                                         */
/* ------------------------------------------------------------------ */

describe("runAgentTool", () => {
  it("rejects unknown tools", async () => {
    expect(await runAgentTool(ctx(), "drop_tables", {})).toEqual({
      structured: { error: "Unknown tool drop_tables." },
      isError: true,
    });
  });

  it("treats non-object arguments as empty", async () => {
    for (const raw of [null, ["keywords"], "keywords", 42]) {
      expect((await runAgentTool(ctx(), "build_keyword_field", raw)).structured.error).toBe("Pass at least one keyword.");
    }
    expect((await runAgentTool(ctx(), "get_account", null)).isError).toBeUndefined();
  });

  it("never throws: unexpected failures become a generic tool error", async () => {
    const down = data({ latest: vi.fn(async () => Promise.reject(new Error("D1 down"))) });
    expect(await runAgentTool(ctx({ data: down }), "get_keyword_popularity", { keywords: ["habit"] })).toEqual({
      structured: { error: OOPS },
      isError: true,
    });
    expect(consoleError).toHaveBeenCalledWith("[agent-tools] tool failed:", "get_keyword_popularity", "Error: D1 down");

    const odd = data({ latest: vi.fn(async () => Promise.reject("boom")) });
    expect((await runAgentTool(ctx({ data: odd }), "get_keyword_popularity", { keywords: ["habit"] })).structured.error).toBe(OOPS);
    expect(consoleError).toHaveBeenCalledWith("[agent-tools] tool failed:", "get_keyword_popularity", "boom");
  });
});
