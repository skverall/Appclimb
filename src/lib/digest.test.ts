import { describe, expect, it } from "vitest";

import {
  buildDigestEmail,
  buildFreeDigestEmail,
  digestKeywordsFor,
  escapeHtml,
  marketMovers,
  pickKeywordMoves,
  pickRisers,
  rankChange,
  rankPair,
  recentHistory,
  type DigestApp,
  type DigestRiser,
  type FreeDigestInput,
} from "@/lib/digest";
import { buildDataset, type TermRow } from "@/lib/search-terms";
import { emptyStore, type RankSnapshot, type TrackerStore } from "@/lib/tracker";

function snap(date: string, position: number | null): RankSnapshot {
  return {
    date,
    sampledAt: `${date}T09:00:00Z`,
    position,
    popularity: 50,
    difficulty: 40,
    resultsCount: 200,
    saturated: false,
  };
}

function app(overrides: Partial<DigestApp> = {}): DigestApp {
  return {
    name: "Ritual: Habit Tracker",
    country: "US",
    categoryLabel: "Health & Fitness",
    lastCheckedDate: "2026-09-30",
    previousDate: "2026-09-23",
    rising: [],
    keywords: [
      { keyword: "habit tracker", popularity: 56, popularityChange: 3, position: 12, previousPosition: 18 },
      { keyword: "streak", popularity: null, popularityChange: null, position: 40, previousPosition: 31 },
      { keyword: "routine", popularity: 48, popularityChange: 0, position: null, previousPosition: null },
    ],
    ...overrides,
  };
}

const BASE = {
  week: "2026-09-20",
  today: "2026-10-01",
  siteUrl: "https://appclimb.app",
  unsubscribeUrl: "https://appclimb.app/unsubscribe?u=u1&t=tok",
};

describe("rank pairs", () => {
  it("compares the last check with the newest one at least a week older", () => {
    const pair = rankPair([snap("2026-09-30", 12), snap("2026-09-20", 25), snap("2026-09-23", 18), snap("2026-09-29", 13)]);
    expect(pair?.latest.date).toBe("2026-09-30");
    expect(pair?.previous?.date).toBe("2026-09-23");
  });

  it("falls back to the oldest check when there is no week-old one", () => {
    expect(rankPair([snap("2026-09-29", 13), snap("2026-09-30", 12)])?.previous?.date).toBe("2026-09-29");
    expect(rankPair([snap("2026-09-30", 12)])?.previous).toBeNull();
    expect(rankPair([])).toBeNull();
  });

  it("treats leaving or entering the top 200 as a move from or to 201", () => {
    expect(rankChange({ keyword: "a", popularity: null, popularityChange: null, position: 150, previousPosition: null })).toBe(51);
    expect(rankChange({ keyword: "a", popularity: null, popularityChange: null, position: null, previousPosition: 190 })).toBe(-11);
    expect(rankChange({ keyword: "a", popularity: null, popularityChange: null, position: null, previousPosition: null })).toBeNull();
    expect(rankChange({ keyword: "a", popularity: null, popularityChange: null, position: 3 })).toBeNull();
  });

  it("reads one app's keywords and dates from the synced tracker", () => {
    const store: TrackerStore = {
      ...emptyStore(),
      keywords: {
        "1:US:habit tracker": {
          appStoreId: "1",
          country: "US",
          keyword: "habit tracker",
          normalizedKeyword: "habit tracker",
          note: "",
          createdAt: "2026-09-01",
          lastCheckedAt: null,
          currentMetrics: null,
        },
        "2:US:other": {
          appStoreId: "2",
          country: "US",
          keyword: "other",
          normalizedKeyword: "other",
          note: "",
          createdAt: "2026-09-01",
          lastCheckedAt: null,
          currentMetrics: null,
        },
      },
      snapshots: { "1:US:habit tracker": [snap("2026-09-22", 20), snap("2026-09-30", 12)] },
    };
    expect(digestKeywordsFor(store, "1", "US")).toEqual({
      keywords: [{ keyword: "habit tracker", position: 12, previousPosition: 20 }],
      lastCheckedDate: "2026-09-30",
      previousDate: "2026-09-22",
    });
  });
});

describe("buildDigestEmail", () => {
  it("sends nothing when no app has keywords", () => {
    expect(buildDigestEmail({ ...BASE, apps: [app({ keywords: [] })] })).toBeNull();
    expect(buildDigestEmail({ ...BASE, apps: [] })).toBeNull();
  });

  it("leads with rank moves and lists them honestly", () => {
    const email = buildDigestEmail({ ...BASE, apps: [app()] })!;
    expect(email.subject).toBe("Ritual: Habit Tracker: 1 up, 1 down this week");
    expect(email.text).toContain("0 in the top 10 · 2 of 3 in the top 200");
    expect(email.text).toContain("habit tracker  #18 → #12");
    expect(email.text).toContain("streak  #31 → #40");
    expect(email.text).toContain("habit tracker  56 (+3)");
    expect(email.text).toContain("not search volume");
    expect(email.text).toContain(BASE.unsubscribeUrl);
    expect(email.html).toContain("Stop these emails");
  });

  it("falls back to popularity, then to a plain subject", () => {
    const still = app({
      keywords: [{ keyword: "habit tracker", popularity: 56, popularityChange: -2, position: 12, previousPosition: 12 }],
    });
    expect(buildDigestEmail({ ...BASE, apps: [still] })!.subject).toBe(
      "Ritual: Habit Tracker: Apple’s new week moved 1 of your keywords",
    );
    const quiet = app({
      keywords: [{ keyword: "habit tracker", popularity: 56, popularityChange: 0 }],
    });
    expect(buildDigestEmail({ ...BASE, apps: [quiet, quiet] })!.subject).toBe(
      "Your keywords: your week of Sep 20 on the App Store",
    );
  });

  it("flags stale ranks and links rising terms", () => {
    const email = buildDigestEmail({
      ...BASE,
      apps: [
        app({
          lastCheckedDate: "2026-09-10",
          rising: [{ term: "water tracker", popularity: 51, delta: 7, href: "https://appclimb.app/keywords/us/health-fitness/water-tracker" }],
        }),
      ],
    })!;
    expect(email.text).toContain("Ranks were last checked Sep 10");
    expect(email.text).toContain("Rising in Health & Fitness (4 weeks)");
    expect(email.html).toContain('href="https://appclimb.app/keywords/us/health-fitness/water-tracker"');
  });

  it("escapes app and keyword names in the HTML", () => {
    const email = buildDigestEmail({
      ...BASE,
      apps: [app({ name: "<b>Evil</b> & Co", keywords: [{ keyword: "x<script>", popularity: 50, popularityChange: 4 }] })],
    })!;
    expect(email.html).not.toContain("<b>Evil</b>");
    expect(email.html).toContain("&lt;b&gt;Evil&lt;/b&gt; &amp; Co");
    expect(email.html).not.toContain("x<script>");
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });
});

function riser(term: string, delta: number, overrides: Partial<DigestRiser> = {}): DigestRiser {
  return {
    term,
    categoryLabel: "Health & Fitness",
    popularity: 40 + delta,
    previousPopularity: 40,
    delta,
    history: [],
    href: `https://appclimb.app/?kw=${encodeURIComponent(term)}&country=US`,
    ...overrides,
  };
}

function freeInput(overrides: Partial<FreeDigestInput> = {}): FreeDigestInput {
  return {
    week: "2026-10-11",
    compareWeek: "2026-10-04",
    country: "US",
    risers: [riser("water tracker", 9), riser("step counter", 4)],
    newcomers: [],
    keywords: [],
    syncedOn: null,
    siteUrl: "https://appclimb.app",
    unsubscribeUrl: "https://appclimb.app/unsubscribe?u=u1&t=tok",
    ...overrides,
  };
}

describe("pickRisers", () => {
  const mover = (term: string, genre: string, delta: number | null) => ({ term, genre, delta });

  it("takes the biggest gains, at most two per category", () => {
    const picked = pickRisers([
      mover("a", "GAMES", 30),
      mover("b", "GAMES", 25),
      mover("c", "GAMES", 20),
      mover("d", "FINANCE", 10),
      mover("e", "TRAVEL", 12),
    ]);
    expect(picked.map((item) => item.term)).toEqual(["a", "b", "e", "d"]);
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
  const row = (term: string, genre: TermRow["genre"], popularity: number): TermRow => ({ term, genre, popularity });

  it("drops terms in a script the storefront doesn't use, from risers and newcomers", () => {
    const previous = buildDataset("US", "2026-09-27", [
      row("подружка", "SHOPPING", 40),
      row("cinnabon", "FOOD_DRINK", 60),
    ]);
    const current = buildDataset("US", "2026-10-04", [
      row("подружка", "SHOPPING", 59),
      row("cinnabon", "FOOD_DRINK", 71),
      row("微信", "SOCIAL_NETWORKING", 70),
      row("café finder", "FOOD_DRINK", 50),
    ]);
    const { risers, newcomers } = marketMovers(current, previous);
    expect(risers.map((item) => item.term)).toEqual(["cinnabon"]);
    expect(newcomers.map((item) => item.term)).toEqual(["café finder"]);
    // The same Cyrillic term is a real riser in the Russian storefront.
    const ru = marketMovers({ ...current, country: "RU" }, { ...previous, country: "RU" });
    expect(ru.risers.map((item) => item.term)).toEqual(["подружка", "cinnabon"]);
  });

  it("counts a term as new only when no category listed it the week before", () => {
    const previous = buildDataset("US", "2026-09-27", [row("budget planner", "BUSINESS", 44)]);
    const current = buildDataset("US", "2026-10-04", [
      row("budget planner", "FINANCE", 46),
      row("tax refund", "FINANCE", 52),
      row("tax return", "FINANCE", 51),
      row("irs", "FINANCE", 61),
      row("flight deals", "TRAVEL", 40),
    ]);
    const { risers, newcomers } = marketMovers(current, previous);
    expect(risers).toEqual([]);
    // Most popular first, at most two per category.
    expect(newcomers.map((item) => item.term)).toEqual(["irs", "tax refund", "flight deals"]);
  });
});

describe("recentHistory", () => {
  it("keeps the weeks ending with this one, oldest first", () => {
    const points = [
      { week: "2026-08-09", popularity: 30 },
      { week: "2026-08-16", popularity: 31 },
      { week: "2026-09-20", popularity: 40 },
      { week: "2026-09-27", popularity: 44 },
      { week: "2026-10-04", popularity: 50 },
      { week: "2026-10-11", popularity: 52 },
    ];
    // Eight weeks ending Oct 4 start Aug 16.
    expect(recentHistory(points, "2026-10-04").map((point) => point.week)).toEqual([
      "2026-08-16",
      "2026-09-20",
      "2026-09-27",
      "2026-10-04",
    ]);
    expect(recentHistory(points, "2026-10-04", 2).map((point) => point.week)).toEqual(["2026-09-27", "2026-10-04"]);
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
  it("sends nothing without risers or listed keywords", () => {
    expect(buildFreeDigestEmail(freeInput({ risers: [] }))).toBeNull();
    expect(
      buildFreeDigestEmail(
        freeInput({ risers: [], keywords: [{ keyword: "routine", country: "US", popularity: null, popularityChange: null }] }),
      ),
    ).toBeNull();
  });

  it("lists Apple's risers with their category, the comparison week, and explorer links", () => {
    const email = buildFreeDigestEmail(freeInput());
    expect(email).not.toBeNull();
    if (!email) return;
    expect(email.subject).toBe("Apple’s latest week: “water tracker” up 9 in popularity");
    expect(email.text).toContain("AppClimb weekly · Apple data for the week of Oct 11");
    expect(email.text).toContain("Biggest risers · US App Store");
    expect(email.text).toContain(
      "  water tracker · Health & Fitness  49 (+9)  https://appclimb.app/?kw=water%20tracker&country=US",
    );
    expect(email.text).toContain("popularity points gained since the week of Oct 4.");
    expect(email.html).toContain('href="https://appclimb.app/?kw=water%20tracker&amp;country=US"');
    expect(email.html).toContain("Open the keyword explorer");
    // No section about the user's own keywords: the server has none.
    expect(email.text).not.toContain("Your keywords");
  });

  it("is honest about the data and says what Pro adds, once", () => {
    const email = buildFreeDigestEmail(freeInput());
    if (!email) throw new Error("expected an email");
    // "Search volume" appears only to say popularity isn't it.
    expect(email.text.match(/search volume/giu)).toEqual(["search volume"]);
    expect(email.text).toContain("not search volume");
    expect(email.text.match(/AppClimb Pro syncs your tracker/gu)).toHaveLength(1);
    expect(email.text).toContain("rank changes from your checks");
    expect(email.text).toContain("https://appclimb.app/pricing");
    expect(email.html).toContain('href="https://appclimb.app/pricing"');
    expect(email.text).toContain("You get this weekly because you have a free AppClimb account.");
    expect(email.text).toContain("Stop these emails: https://appclimb.app/unsubscribe?u=u1&t=tok");
    expect(email.html).toContain('href="https://appclimb.app/unsubscribe?u=u1&amp;t=tok"');
    expect(email.text).not.toContain("on AppClimb Pro.");
  });

  it("shows a former Pro user's synced keywords without ranks, and leads the subject with them", () => {
    const email = buildFreeDigestEmail(
      freeInput({
        syncedOn: "2026-09-30",
        keywords: [
          { keyword: "habit tracker", country: "US", popularity: 56, popularityChange: 3 },
          { keyword: "journal", country: "US", popularity: 70, popularityChange: 0 },
          { keyword: "streaks", country: "US", popularity: 33, popularityChange: null },
          { keyword: "routine", country: "US", popularity: null, popularityChange: null },
        ],
      }),
    );
    if (!email) throw new Error("expected an email");
    expect(email.subject).toBe("1 of your keywords moved in Apple’s new week");
    expect(email.text).toContain("Your keywords · Apple popularity this week");
    expect(email.text).toContain("  habit tracker  56 (+3)");
    expect(email.text).toContain("  journal  70 (no change)");
    expect(email.text).toContain("  streaks  33\n");
    expect(email.text).not.toContain("routine");
    expect(email.text).toContain("Keywords from your last cloud sync, Sep 30.");
    expect(email.text).not.toMatch(/#\d|top 10|top 200/u);
    // Risers still follow.
    expect(email.text).toContain("water tracker · Health & Fitness");
  });

  it("labels storefronts only when synced keywords span several", () => {
    const email = buildFreeDigestEmail(
      freeInput({
        risers: [],
        keywords: [
          { keyword: "habit tracker", country: "US", popularity: 56, popularityChange: null },
          { keyword: "habit tracker", country: "GB", popularity: 30, popularityChange: null },
        ],
      }),
    );
    if (!email) throw new Error("expected an email");
    expect(email.subject).toBe("Your keywords in Apple’s week of Oct 11");
    expect(email.text).toContain("  habit tracker · US  56");
    expect(email.text).toContain("  habit tracker · GB  30");
    expect(email.text).not.toContain("Biggest risers");
  });

  it("escapes terms and categories in the HTML", () => {
    const email = buildFreeDigestEmail(
      freeInput({ risers: [riser("<b>x</b>", 3, { categoryLabel: "Food & Drink" })] }),
    );
    if (!email) throw new Error("expected an email");
    expect(email.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(email.html).toContain("Food &amp; Drink");
    expect(email.html).not.toContain("<b>x</b>");
  });
});
