import { describe, expect, it } from "vitest";

import {
  groupKeywordMap,
  MAP_GROUPS,
  mapSummary,
  popularityLabel,
  rankBand,
  rankLabel,
  type KeywordMapEntry,
} from "@/lib/keyword-map";

function entry(keyword: string, overrides: Partial<KeywordMapEntry> = {}): KeywordMapEntry {
  return {
    keyword,
    normalizedKeyword: keyword,
    popularity: 50,
    longTail: false,
    difficulty: 40,
    position: null,
    verdict: "target",
    opportunity: 50,
    ...overrides,
  };
}

describe("keyword map groups", () => {
  it("covers every verdict once, in priority order", () => {
    expect(MAP_GROUPS.map((group) => group.id)).toEqual([
      "target",
      "longtail_win",
      "competitive",
      "low_demand",
      "dominated",
    ]);
  });

  it("drops empty groups and puts the best opportunity first", () => {
    const groups = groupKeywordMap([
      entry("b", { opportunity: 40 }),
      entry("a", { opportunity: 70 }),
      entry("c", { verdict: "dominated", opportunity: 5 }),
      entry("d", { opportunity: null, popularity: 90 }),
    ]);
    expect(groups.map((group) => group.id)).toEqual(["target", "dominated"]);
    expect(groups[0].entries.map((item) => item.keyword)).toEqual(["a", "b", "d"]);
  });

  it("breaks ties by popularity, then name", () => {
    const groups = groupKeywordMap([
      entry("zeta", { opportunity: 50, popularity: 40 }),
      entry("beta", { opportunity: 50, popularity: 60 }),
      entry("alpha", { opportunity: 50, popularity: 40 }),
    ]);
    expect(groups[0].entries.map((item) => item.keyword)).toEqual(["beta", "alpha", "zeta"]);
  });
});

describe("rank and popularity labels", () => {
  it("bands ranks like the rankings overview", () => {
    expect(rankBand(1)).toBe("top10");
    expect(rankBand(10)).toBe("top10");
    expect(rankBand(11)).toBe("top50");
    expect(rankBand(51)).toBe("top200");
    expect(rankBand(201)).toBe("outside");
    expect(rankBand(null)).toBe("outside");
    expect(rankLabel(7)).toBe("#7");
    expect(rankLabel(null)).toBe("Not in top 200");
  });

  it("shows long-tail popularity as a ceiling", () => {
    expect(popularityLabel({ popularity: 48, longTail: true })).toBe("≤48");
    expect(popularityLabel({ popularity: 62, longTail: false })).toBe("62");
  });
});

describe("map summary", () => {
  it("points at worth-targeting keywords you don't rank for yet", () => {
    expect(
      mapSummary([entry("a", { position: 3 }), entry("b", { position: 40 }), entry("c"), entry("d", { verdict: "competitive" })]),
    ).toBe("3 keywords are worth targeting — you're not in the top 10 for 2 of them yet. Start there.");
  });

  it("handles none, one and all ranked", () => {
    expect(mapSummary([entry("a")])).toBe(
      "1 keyword is worth targeting — you're not in the top 10 for it yet. Start there.",
    );
    expect(mapSummary([entry("a"), entry("b")])).toBe(
      "2 keywords are worth targeting — you're not in the top 10 for any of them yet. Start there.",
    );
    expect(mapSummary([entry("a", { position: 2 }), entry("b", { position: 9 })])).toBe(
      "2 keywords are worth targeting, and you're already in the top 10 for all of them. Look for new ones next.",
    );
  });

  it("falls back to long-tail wins, then to advice", () => {
    const head = "No keyword has both real Apple demand and a beatable first page yet.";
    expect(mapSummary([entry("a", { verdict: "longtail_win" }), entry("b", { verdict: "dominated" })])).toBe(
      `${head} Your long-tail win is the quickest rank — you're not in the top 10 for it yet.`,
    );
    expect(mapSummary([entry("a", { verdict: "longtail_win", position: 3 })])).toBe(
      `${head} Your long-tail win already ranks in the top 10 — look for more like it.`,
    );
    expect(
      mapSummary([
        entry("a", { verdict: "longtail_win", position: 1 }),
        entry("b", { verdict: "longtail_win", position: 31 }),
        entry("c", { verdict: "longtail_win" }),
      ]),
    ).toBe(`${head} Of your 3 long-tail wins — the quickest ranks — 2 aren't in your top 10 yet. Start there.`);
    expect(
      mapSummary([
        entry("a", { verdict: "longtail_win", position: 1 }),
        entry("b", { verdict: "longtail_win", position: 2 }),
      ]),
    ).toBe(`${head} You're in the top 10 for all 2 long-tail wins — look for more like them.`);
    expect(mapSummary([entry("a", { verdict: "competitive" })])).toMatch(/Try longer, more specific phrases/);
  });
});
