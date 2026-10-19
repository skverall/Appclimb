import { describe, expect, it } from "vitest";

import {
  buildFreeDigestEmail,
  marketMovers,
  pickKeywordMoves,
  pickRisers,
  pulseRows,
  recentHistory,
  weekPulse,
  type DigestRiser,
  type FreeDigestInput,
} from "@/lib/digest-free";
import { PRO_YEARLY_PER_MONTH_USD, REFUND_WINDOW_DAYS } from "@/lib/plan";
import { buildDataset, type TermRow } from "@/lib/search-terms";

const row = (term: string, genre: TermRow["genre"], popularity: number): TermRow => ({ term, genre, popularity });

function riser(term: string, delta: number, overrides: Partial<DigestRiser> = {}): DigestRiser {
  return {
    term,
    categoryLabel: "Health & Fitness",
    popularity: 40 + delta,
    previousPopularity: 40,
    delta,
    history: [],
    href: `https://appclimb.app/?kw=${encodeURIComponent(term)}&country=US`,
    pageHref: `https://appclimb.app/keywords/us/health-fitness/${term.replace(/ /gu, "-")}`,
    ...overrides,
  };
}

function freeInput(overrides: Partial<FreeDigestInput> = {}): FreeDigestInput {
  return {
    week: "2026-10-04",
    compareWeek: "2026-09-27",
    country: "US",
    termCount: 7500,
    categoryCount: 15,
    rose: 1077,
    fell: 1931,
    risers: [
      riser("be my eyes", 19, {
        categoryLabel: "Lifestyle",
        popularity: 71,
        previousPopularity: 52,
        history: [
          { week: "2026-09-20", popularity: 53 },
          { week: "2026-09-27", popularity: 52 },
          { week: "2026-10-04", popularity: 71 },
        ],
      }),
      riser("trump account", 11, { categoryLabel: "Finance", popularity: 72, previousPopularity: 61 }),
      riser("cinnabon", 11, { categoryLabel: "Food & Drink", popularity: 71, previousPopularity: 60 }),
    ],
    newcomers: [
      { term: "espn fantasy", categoryLabel: "News & Magazines", popularity: 70, href: "https://appclimb.app/?kw=espn%20fantasy&country=US" },
    ],
    pulse: [
      { categoryLabel: "Travel", rising: 107, falling: 88 },
      { categoryLabel: "Business", rising: 79, falling: 109 },
      { categoryLabel: "Finance", rising: 41, falling: 170 },
    ],
    keywords: [],
    syncedOn: null,
    siteUrl: "https://appclimb.app",
    unsubscribeUrl: "https://appclimb.app/unsubscribe?u=u1&t=tok",
    ...overrides,
  };
}

function build(overrides: Partial<FreeDigestInput> = {}) {
  const email = buildFreeDigestEmail(freeInput(overrides));
  if (!email) throw new Error("expected an email");
  return email;
}

/** The preheader is the first, hidden div of the body. */
function preheader(html: string): string {
  return /<div style="display:none;[^"]*">([^<]*)<\/div>/u.exec(html)?.[1] ?? "";
}

describe("pickRisers", () => {
  const mover = (term: string, genre: string, delta: number | null) => ({ term, genre, delta });

  it("takes the biggest gains, one per category", () => {
    const picked = pickRisers([
      mover("a", "GAMES", 30),
      mover("b", "GAMES", 25),
      mover("d", "FINANCE", 10),
      mover("e", "TRAVEL", 12),
    ]);
    expect(picked.map((item) => item.term)).toEqual(["a", "e", "d"]);
  });

  it("drops new and falling terms, keeps tie order, and stops at the limit", () => {
    const picked = pickRisers(
      [
        mover("new", "GAMES", null),
        mover("down", "GAMES", -4),
        mover("flat", "GAMES", 0),
        mover("x", "FINANCE", 5),
        mover("y", "TRAVEL", 5),
        mover("z", "SPORTS", 5),
      ],
      2,
    );
    expect(picked.map((item) => item.term)).toEqual(["x", "y"]);
  });
});

describe("marketMovers", () => {
  it("drops terms in a script the storefront doesn't use", () => {
    const previous = buildDataset("US", "2026-09-27", [row("подружка", "SHOPPING", 40), row("cinnabon", "FOOD_DRINK", 60)]);
    const current = buildDataset("US", "2026-10-04", [
      row("подружка", "SHOPPING", 59),
      row("cinnabon", "FOOD_DRINK", 71),
      row("微信", "SOCIAL_NETWORKING", 70),
      row("café finder", "FOOD_DRINK", 50),
    ]);
    const { risers, newcomers } = marketMovers(current, previous);
    expect(risers.map((item) => item.term)).toEqual(["cinnabon"]);
    expect(newcomers.map((item) => item.term)).toEqual(["café finder"]);
    const ru = marketMovers({ ...current, country: "RU" }, { ...previous, country: "RU" });
    expect(ru.risers.map((item) => item.term)).toEqual(["подружка", "cinnabon"]);
  });

  it("lists terms that entered a category's list, most popular first, two per category", () => {
    const previous = buildDataset("US", "2026-09-27", [row("budget planner", "BUSINESS", 44)]);
    const current = buildDataset("US", "2026-10-04", [
      row("budget planner", "FINANCE", 46),
      row("tax refund", "FINANCE", 52),
      row("irs", "FINANCE", 61),
      row("flight deals", "TRAVEL", 40),
    ]);
    const { risers, newcomers } = marketMovers(current, previous);
    expect(risers).toEqual([]);
    // "budget planner" entered Finance's list, though Business listed it before.
    expect(newcomers.map((item) => item.term)).toEqual(["irs", "tax refund", "flight deals"]);
  });

  it("drops newcomers that repeat a riser or a more popular newcomer", () => {
    const previous = buildDataset("US", "2026-09-27", [row("be my eyes", "LIFESTYLE", 52)]);
    const current = buildDataset("US", "2026-10-04", [
      row("be my eyes", "LIFESTYLE", 71),
      row("be my eyes – helping the blind", "LIFESTYLE", 65),
      row("centier bank mobile", "FINANCE", 66),
      row("centier bank", "FINANCE", 63),
      row("voice memo", "PRODUCTIVITY_UTILITIES", 61),
    ]);
    const { newcomers } = marketMovers(current, previous);
    expect(newcomers.map((item) => item.term)).toEqual(["centier bank mobile", "voice memo"]);
  });
});

describe("weekPulse", () => {
  it("counts terms on both weeks' lists that rose and fell, per category", () => {
    const previous = buildDataset("US", "2026-09-27", [
      row("a", "TRAVEL", 40),
      row("b", "TRAVEL", 50),
      row("c", "FINANCE", 50),
      row("d", "FINANCE", 50),
      row("e", "FINANCE", 50),
      row("gone", "GAMES", 50),
    ]);
    const current = buildDataset("US", "2026-10-04", [
      row("a", "TRAVEL", 45),
      row("b", "TRAVEL", 50),
      row("c", "FINANCE", 40),
      row("d", "FINANCE", 41),
      row("e", "FINANCE", 55),
      row("new", "GAMES", 60),
    ]);
    const { rose, fell, pulse } = weekPulse(current, previous);
    expect({ rose, fell }).toEqual({ rose: 2, fell: 2 });
    // Unchanged-only and newcomer-only categories carry no pulse.
    expect(pulse.map((item) => [item.categoryLabel, item.rising, item.falling])).toEqual([
      ["Travel", 1, 0],
      ["Finance", 1, 2],
    ]);
  });

  it("breaks net ties by the larger rising share", () => {
    const words = (prefix: string, n: number) => Array.from({ length: n }, (_, index) => `${prefix}${index}`);
    const before: TermRow[] = [];
    const after: TermRow[] = [];
    const add = (genre: TermRow["genre"], up: number, down: number) => {
      for (const term of words(`${genre}-up-`, up)) {
        before.push(row(term, genre, 40));
        after.push(row(term, genre, 41));
      }
      for (const term of words(`${genre}-down-`, down)) {
        before.push(row(term, genre, 40));
        after.push(row(term, genre, 39));
      }
    };
    add("SOCIAL_NETWORKING", 4, 8);
    add("SHOPPING", 7, 11);
    const { pulse } = weekPulse(buildDataset("US", "2026-10-04", after), buildDataset("US", "2026-09-27", before));
    expect(pulse.map((item) => item.categoryLabel)).toEqual(["Shopping", "Social Networking"]);
  });
});

describe("pulseRows", () => {
  it("shows the three most improved and the two most declined categories", () => {
    const pulse = ["A", "B", "C", "D", "E", "F", "G"].map((categoryLabel, index) => ({
      categoryLabel,
      rising: 10 - index,
      falling: index,
    }));
    expect(pulseRows(pulse).map((item) => item.categoryLabel)).toEqual(["A", "B", "C", "F", "G"]);
    expect(pulseRows(pulse.slice(0, 4)).map((item) => item.categoryLabel)).toEqual(["A", "B", "C", "D"]);
    expect(pulseRows([])).toEqual([]);
  });
});

describe("recentHistory", () => {
  it("keeps the weeks ending with this one, oldest first", () => {
    const points = [
      { week: "2026-08-09", popularity: 30 },
      { week: "2026-08-16", popularity: 31 },
      { week: "2026-09-20", popularity: 40 },
      { week: "2026-10-04", popularity: 50 },
      { week: "2026-10-11", popularity: 52 },
    ];
    // Eight weeks ending Oct 4 start Aug 16.
    expect(recentHistory(points, "2026-10-04").map((point) => point.week)).toEqual([
      "2026-08-16",
      "2026-09-20",
      "2026-10-04",
    ]);
    expect(recentHistory(points, "2026-10-04", 3).map((point) => point.week)).toEqual(["2026-09-20", "2026-10-04"]);
    expect(recentHistory([], "2026-10-04")).toEqual([]);
  });
});

describe("pickKeywordMoves", () => {
  it("keeps Apple-listed keywords once each, biggest moves first", () => {
    const picked = pickKeywordMoves([
      { keyword: "habit tracker", country: "US", popularity: 56, popularityChange: 3 },
      { keyword: "Habit Tracker ", country: "US", popularity: 56, popularityChange: 3 },
      { keyword: "habit tracker", country: "GB", popularity: 30, popularityChange: null },
      { keyword: "routine", country: "US", popularity: null, popularityChange: null },
      { keyword: "mood", country: "US", popularity: 61, popularityChange: -8 },
      { keyword: "journal", country: "US", popularity: 70, popularityChange: 0 },
    ]);
    expect(picked.map((item) => `${item.country}:${item.keyword}`)).toEqual([
      "US:mood",
      "US:habit tracker",
      "US:journal",
      "GB:habit tracker",
    ]);
  });
});

describe("buildFreeDigestEmail", () => {
  it("sends nothing without risers or Apple-listed synced keywords", () => {
    expect(buildFreeDigestEmail(freeInput({ risers: [] }))).toBeNull();
    expect(
      buildFreeDigestEmail(
        freeInput({ risers: [], keywords: [{ keyword: "routine", country: "US", popularity: null, popularityChange: null }] }),
      ),
    ).toBeNull();
  });

  it("leads with the top riser in the subject and the store's moves in the preheader", () => {
    const email = build();
    expect(email.subject).toBe("“be my eyes” jumped 19 points — your App Store week");
    expect(preheader(email.html)).toBe(
      "1,077 searches rose and 1,931 fell on the US App Store. Travel was the only category with more risers than fallers.",
    );
    expect(email.html).toContain(`<title>“be my eyes” jumped 19 points — your App Store week</title>`);
    expect(build({ risers: [riser("calm", 1)] }).subject).toBe("“calm” jumped 1 point — your App Store week");
  });

  it("words the preheader from the pulse", () => {
    const some = build({
      pulse: [
        { categoryLabel: "Travel", rising: 5, falling: 1 },
        { categoryLabel: "Games", rising: 4, falling: 2 },
      ],
    });
    expect(preheader(some.html)).toContain("2 categories had more risers than fallers.");
    const none = build({ pulse: [{ categoryLabel: "Games", rising: 1, falling: 4 }] });
    expect(preheader(none.html)).toContain("No category had more risers than fallers.");
    expect(preheader(build({ pulse: [] }).html)).toBe("1,077 searches rose and 1,931 fell on the US App Store.");
  });

  it("opens with Apple's week in numbers from the store, not fixed copy", () => {
    const email = build({ termCount: 7480, categoryCount: 14, rose: 12, fell: 3 });
    expect(email.html).toContain("Weekly · Oct 4");
    expect(email.html).toContain("What moved on the App Store this week");
    expect(email.html).toContain("7,480 top searches across 14 categories, compared with the week before.");
    expect(email.html).toContain("▲ 12</div>");
    expect(email.html).toContain("▼ 3</div>");
    expect(email.html).toContain("+19</div>");
    expect(email.text).toContain("▲ 12 searches rose · ▼ 3 searches fell · +19 biggest jump");
  });

  it("spotlights the top riser with a chart of Apple's published weeks", () => {
    const email = build();
    expect(email.html).toContain("★ Top riser this week");
    expect(email.html).toContain("“be my eyes”");
    expect(email.html).toContain("Lifestyle · US App Store");
    expect(email.html).toContain("▲ 19 from 52");
    // One bar per published week, the latest in gold, each labelled with its date.
    for (const label of ["Sep 20", "Sep 27", "Oct 4"]) expect(email.html).toContain(`>${label}</td>`);
    expect(email.html.match(/border-radius:5px 5px 0 0/gu)).toHaveLength(3);
    expect(email.html.match(/background:#f4c15d;border-radius:5px 5px 0 0/gu)).toHaveLength(1);
    expect(email.html).toContain("Apple Ads popularity, last three published weeks.");
    expect(email.html).toContain('href="https://appclimb.app/?kw=be%20my%20eyes&amp;country=US"');
    expect(email.html).toContain("Check “be my eyes” for your app →");
    expect(email.text).toContain(
      "Apple Ads popularity, last three published weeks. Sep 20 53 · Sep 27 52 · Oct 4 71",
    );
  });

  it("skips the chart, not the spotlight, with fewer than two published weeks", () => {
    const top = riser("be my eyes", 19, { history: [{ week: "2026-10-04", popularity: 59 }] });
    const email = build({ risers: [top] });
    expect(email.html).toContain("★ Top riser this week");
    expect(email.html).not.toContain("border-radius:5px 5px 0 0");
    expect(email.html).not.toContain("published weeks");
    expect(email.text).not.toContain("published weeks");
    expect(email.html).toContain("Check “be my eyes” for your app →");
    // A lone riser means no "Biggest risers" list.
    expect(email.html).not.toContain("Biggest risers");
  });

  it("ranks the other risers from 2 with last week's score, a track, and term-page links", () => {
    const email = build();
    expect(email.html).toContain("Biggest risers");
    expect(email.html).toContain('href="https://appclimb.app/keywords/us/health-fitness/trump-account"');
    expect(email.html).toContain("Finance · was 61");
    expect(email.html).toContain(">2</td>");
    expect(email.html).toContain(">3</td>");
    // Track: last week's 61 in teal, the 11 gained in gold, the rest empty.
    expect(email.html).toContain('<td width="61%" bgcolor="#0c8e88"');
    expect(email.html).toContain('<td width="11%" bgcolor="#f4c15d"');
    expect(email.html).toContain('<td width="28%" bgcolor="#e9efee"');
    expect(email.html).toContain("gained this week");
    expect(email.text).toContain(
      "  2. trump account · Finance  72 (▲ 11, was 61)  https://appclimb.app/keywords/us/health-fitness/trump-account",
    );
  });

  it("lists newcomers as explorer links, and hides the section when there are none", () => {
    const email = build();
    expect(email.html).toContain("New on Apple’s list");
    expect(email.html).toContain('href="https://appclimb.app/?kw=espn%20fantasy&amp;country=US"');
    expect(email.text).toContain("  espn fantasy · News & Magazines  70  https://appclimb.app/?kw=espn%20fantasy&country=US");
    const none = build({ newcomers: [] });
    expect(none.html).not.toContain("New on Apple’s list");
    expect(none.text).not.toContain("NEW ON APPLE’S LIST");
  });

  it("shows the category pulse with notes worded from the data, and hides it without data", () => {
    const email = build();
    expect(email.html).toContain("Category pulse");
    expect(email.html).toContain("▲ 107</span>");
    expect(email.html).toContain("▼ 88</span>");
    expect(email.html.match(/Only category with more terms rising than falling/gu)).toHaveLength(1);
    expect(email.text).toContain("  Travel  ▲ 107 ▼ 88 (Only category with more terms rising than falling)");
    expect(email.text).toContain("  Finance  ▲ 41 ▼ 170\n");
    const two = build({
      pulse: [
        { categoryLabel: "Travel", rising: 5, falling: 1 },
        { categoryLabel: "Games", rising: 4, falling: 2 },
        { categoryLabel: "Finance", rising: 1, falling: 9 },
      ],
    });
    expect(two.html.match(/One of 2 categories with more terms rising than falling/gu)).toHaveLength(2);
    const none = build({ pulse: [] });
    expect(none.html).not.toContain("Category pulse");
    expect(none.text).not.toContain("CATEGORY PULSE");
  });

  it("sells Pro with real prices and an example that says it isn't the reader's data", () => {
    const email = build();
    expect(email.html).toContain("✦ With AppClimb Pro");
    expect(email.html).toContain("This email starts with your own app");
    expect(email.html).toContain("Example — not your data");
    expect(email.html).toContain(`See Pro — from $${PRO_YEARLY_PER_MONTH_USD}/month`);
    expect(email.html).toContain(`${REFUND_WINDOW_DAYS}-day money-back guarantee`);
    expect(email.html).toContain('href="https://appclimb.app/pricing"');
    expect(email.text).toContain("Example — not your data:");
    expect(email.text).toContain(
      `See Pro — from $${PRO_YEARLY_PER_MONTH_USD}/month (${REFUND_WINDOW_DAYS}-day money-back guarantee): https://appclimb.app/pricing`,
    );
    expect(email.html).toContain("Find keywords your app can win →");
  });

  it("ends with the honesty line, why it was sent, and the unsubscribe link", () => {
    const email = build();
    const honesty =
      "Popularity is Apple Ads’ relative 1–100 score, not search volume. Numbers above are Apple’s published top searches for the weeks of Sep 27 and Oct 4.";
    expect(email.html).toContain(honesty);
    expect(email.text).toContain(honesty);
    // "Search volume" appears only to say popularity isn't it.
    expect(email.text.match(/search volume/giu)).toEqual(["search volume"]);
    expect(email.text).toContain("You get this weekly because you have a free AppClimb account.");
    expect(email.text).toMatch(/Stop these emails: https:\/\/appclimb\.app\/unsubscribe\?u=u1&t=tok$/u);
    expect(email.html).toContain('href="https://appclimb.app/unsubscribe?u=u1&amp;t=tok"');
  });

  it("keeps the plain-text part in the same order as the HTML", () => {
    const { text } = build({
      keywords: [{ keyword: "habit tracker", country: "US", popularity: 56, popularityChange: 3 }],
    });
    const order = [
      "What moved on the App Store this week",
      "YOUR KEYWORDS",
      "★ TOP RISER THIS WEEK",
      "BIGGEST RISERS",
      "NEW ON APPLE’S LIST",
      "CATEGORY PULSE",
      "Find keywords your app can win",
      "✦ WITH APPCLIMB PRO",
      "Popularity is Apple Ads’",
      "Stop these emails",
    ].map((marker) => text.indexOf(marker));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
  });

  it("puts a former Pro user's synced keywords before the spotlight, without ranks", () => {
    const email = build({
      syncedOn: "2026-09-30",
      keywords: [
        { keyword: "habit tracker", country: "US", popularity: 56, popularityChange: 3, href: "https://appclimb.app/?kw=habit%20tracker&country=US" },
        { keyword: "mood journal", country: "US", popularity: 40, popularityChange: -6 },
        { keyword: "streaks", country: "US", popularity: 33, popularityChange: null },
        { keyword: "routine", country: "US", popularity: null, popularityChange: null },
      ],
    });
    expect(email.subject).toBe("2 of your keywords moved — your App Store week");
    expect(email.html.indexOf("Your keywords")).toBeLessThan(email.html.indexOf("★ Top riser this week"));
    expect(email.html).toContain("from your last cloud sync, Sep 30");
    expect(email.html).toContain("US App Store · was 53");
    expect(email.html).toContain('href="https://appclimb.app/?kw=habit%20tracker&amp;country=US"');
    // A fall shows as a coral pill and the lost points on the track.
    expect(email.html).toContain("▼ 6</span>");
    expect(email.html).toContain('<td width="6%" bgcolor="#efb8ac"');
    expect(email.html).toContain("lost this week");
    expect(email.text).toContain("  habit tracker · US App Store · was 53  56 (▲ 3)");
    expect(email.text).toContain("  mood journal · US App Store · was 46  40 (▼ 6)");
    expect(email.text).toContain("  streaks · US App Store  33\n");
    expect(email.text).not.toContain("routine");
    // Ranks appear only in the Pro block's labelled example.
    expect(email.text.slice(0, email.text.indexOf("✦ WITH APPCLIMB PRO"))).not.toMatch(/#\d/u);
  });

  it("still sends a former Pro user's keywords when there are no risers", () => {
    const email = build({
      risers: [],
      keywords: [{ keyword: "habit tracker", country: "US", popularity: 56, popularityChange: 0 }],
    });
    expect(email.subject).toBe("Your App Store week of Oct 4");
    expect(email.html).toContain("= 0</span>");
    expect(email.html).not.toContain("Top riser");
    expect(email.html).not.toContain("biggest jump");
  });

  it("escapes terms and labels and stays email-safe", () => {
    const email = build({
      risers: [riser("<b>x</b>", 3, { categoryLabel: "Food & Drink" })],
      newcomers: [{ term: "a\"b", categoryLabel: "Games", popularity: 50, href: "https://appclimb.app/?kw=a%22b&country=US" }],
    });
    expect(email.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(email.html).toContain("Food &amp; Drink");
    expect(email.html).toContain("a&quot;b");
    expect(email.html).not.toContain("<b>x</b>");
    expect(email.html).not.toMatch(/<img|<svg|<style|<script/iu);
    // Every gradient sits on a solid colour for clients that drop gradients.
    const tags = email.html.match(/<[^>]*background-image[^>]*>/gu) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toMatch(/background:#[0-9a-f]{6};background-image/u);
    expect(email.html).toContain("max-width:600px");
  });
});
