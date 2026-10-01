import { describe, expect, it } from "vitest";

import {
  buildDigestEmail,
  digestKeywordsFor,
  escapeHtml,
  rankChange,
  rankPair,
  type DigestApp,
} from "@/lib/digest";
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
