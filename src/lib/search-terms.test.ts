import { describe, expect, it } from "vitest";

import {
  buildDataset,
  datasetGenreFor,
  historyDelta,
  inferDatasetGenre,
  lookupTerm,
  moversFrom,
  normalizeHistory,
  packRows,
  relatedTermsFrom,
  suggestTermsFrom,
  unpackRows,
  type TermRow,
} from "@/lib/search-terms";

const rows: TermRow[] = [
  { term: "meditation", genre: "HEALTH_FITNESS", popularity: 52, rankInGenre: 241 },
  { term: "sleep", genre: "HEALTH_FITNESS", popularity: 57, rankInGenre: 120 },
  { term: "sleep sounds", genre: "HEALTH_FITNESS", popularity: 49, rankInGenre: 405 },
  { term: "sleep tracker", genre: "HEALTH_FITNESS", popularity: 59, rankInGenre: 90 },
  { term: "hallow: prayer & meditation", genre: "HEALTH_FITNESS", popularity: 52 },
  { term: "calm", genre: "HEALTH_FITNESS", popularity: 70 },
  { term: "sleeper", genre: "SPORTS", popularity: 68 },
  { term: "habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 56 },
  { term: "pdf", genre: "PRODUCTIVITY_UTILITIES", popularity: 44 },
];

const dataset = buildDataset("US", "2026-09-20", rows);

describe("genre mapping", () => {
  it("maps iTunes genres onto the 15 published genres", () => {
    expect(datasetGenreFor("Health & Fitness")).toBe("HEALTH_FITNESS");
    expect(datasetGenreFor("Utilities")).toBe("PRODUCTIVITY_UTILITIES");
    expect(datasetGenreFor("News")).toBe("NEW_PUBLICATION");
    expect(datasetGenreFor("Medical")).toBeNull();
    expect(datasetGenreFor("")).toBeNull();
  });

  it("votes the most common genre among top apps", () => {
    expect(
      inferDatasetGenre([
        { genre: "Productivity" },
        { genre: "Health & Fitness" },
        { genre: "Health & Fitness" },
      ]),
    ).toBe("HEALTH_FITNESS");
    expect(inferDatasetGenre([{ genre: "Medical" }])).toBeNull();
  });
});

describe("lookupTerm", () => {
  it("finds a published term case- and space-insensitively", () => {
    const hit = lookupTerm(dataset, "  Sleep   Sounds ");
    expect(hit.found).toBe(true);
    expect(hit.row?.popularity).toBe(49);
  });

  it("gives long-tail terms the genre floor as a ceiling", () => {
    const miss = lookupTerm(dataset, "white noise for babies", "Health & Fitness");
    expect(miss).toMatchObject({ found: false, ceiling: 49, ceilingGenre: "HEALTH_FITNESS" });
  });

  it("falls back to the storefront floor without a genre", () => {
    const miss = lookupTerm(dataset, "obscure", "Medical");
    expect(miss).toMatchObject({ found: false, ceiling: 44 });
    expect(miss.ceilingGenre).toBeUndefined();
  });
});

describe("pack / unpack", () => {
  it("round-trips compact rows and skips junk", () => {
    const packed = packRows(rows.filter((row) => row.genre === "HEALTH_FITNESS"));
    const restored = unpackRows("HEALTH_FITNESS", [...packed, ["bad"], null, [1, 2]]);
    expect(restored).toHaveLength(6);
    expect(restored[0]).toEqual({
      term: "meditation",
      genre: "HEALTH_FITNESS",
      popularity: 52,
      popularityInGenre: undefined,
      popularity1to5: undefined,
      rankInGenre: 241,
    });
  });
});

describe("relatedTermsFrom", () => {
  it("returns terms sharing a word, best match then popularity", () => {
    const related = relatedTermsFrom(dataset, "sleep sounds");
    expect(related.map((item) => item.term)).toEqual([
      "sleep tracker",
      "sleep",
    ]);
  });

  it("matches inside words for a single long token", () => {
    const related = relatedTermsFrom(dataset, "meditation");
    expect(related.map((item) => item.term)).toEqual(["hallow: prayer & meditation"]);
  });

  it("keeps the query's genre first, then fills with other genres", () => {
    const related = relatedTermsFrom(dataset, "habit tracker");
    expect(related.map((item) => item.term)).toEqual(["sleep tracker"]);
    const hinted = relatedTermsFrom(dataset, "deep sleep", 12, "Sports");
    expect(hinted.map((item) => item.term)).toEqual(["sleep tracker", "sleep", "sleep sounds"]);
    const sports = relatedTermsFrom(dataset, "sleeper", 12);
    expect(sports).toEqual([]);
  });

  it("ignores stop words", () => {
    expect(relatedTermsFrom(dataset, "app for the")).toEqual([]);
  });
});

describe("suggestTermsFrom", () => {
  it("puts prefix matches first, sorted by popularity", () => {
    expect(suggestTermsFrom(dataset, "sle").map((item) => item.term)).toEqual([
      "sleeper",
      "sleep tracker",
      "sleep",
      "sleep sounds",
    ]);
  });

  it("then offers terms with a word that starts with the prefix", () => {
    expect(suggestTermsFrom(dataset, "track").map((item) => item.term)).toEqual([
      "sleep tracker",
      "habit tracker",
    ]);
    expect(suggestTermsFrom(dataset, "pray").map((item) => item.term)).toEqual([
      "hallow: prayer & meditation",
    ]);
  });

  it("needs two characters", () => {
    expect(suggestTermsFrom(dataset, "s")).toEqual([]);
  });
});

describe("moversFrom", () => {
  const previous = buildDataset("US", "2026-08-23", [
    { term: "meditation", genre: "HEALTH_FITNESS", popularity: 50, rankInGenre: 260 },
    { term: "sleep", genre: "HEALTH_FITNESS", popularity: 58, rankInGenre: 110 },
    { term: "sleep tracker", genre: "HEALTH_FITNESS", popularity: 52, rankInGenre: 150 },
  ]);

  it("ranks risers by popularity gain and lists newcomers", () => {
    const movers = moversFrom(dataset, previous, { genre: "HEALTH_FITNESS", limit: 5 });
    expect(movers.rising.map((item) => [item.term, item.delta])).toEqual([
      ["sleep tracker", 7],
      ["meditation", 2],
    ]);
    expect(movers.rising[0].rankDelta).toBe(60);
    expect(movers.newcomers.map((item) => item.term)).toEqual([
      "calm",
      "hallow: prayer & meditation",
      "sleep sounds",
    ]);
    expect(movers.top[0].term).toBe("calm");
  });

  it("only returns the top list without a comparison week", () => {
    const movers = moversFrom(dataset, null, { limit: 2 });
    expect(movers.rising).toEqual([]);
    expect(movers.newcomers).toEqual([]);
    expect(movers.top.map((item) => item.term)).toEqual(["calm", "sleeper"]);
  });
});

describe("history", () => {
  it("dedupes weeks keeping the highest score, oldest first", () => {
    expect(
      normalizeHistory([
        { week: "2026-09-20", popularity: 52 },
        { week: "2026-09-13", popularity: 50 },
        { week: "2026-09-13", popularity: 53 },
        { week: "bad", popularity: 1 },
      ]),
    ).toEqual([
      { week: "2026-09-13", popularity: 53 },
      { week: "2026-09-20", popularity: 52 },
    ]);
  });

  it("measures change against the point four weeks back", () => {
    const history = normalizeHistory([
      { week: "2026-08-16", popularity: 40 },
      { week: "2026-08-23", popularity: 44 },
      { week: "2026-08-30", popularity: 45 },
      { week: "2026-09-06", popularity: 46 },
      { week: "2026-09-13", popularity: 47 },
      { week: "2026-09-20", popularity: 50 },
    ]);
    expect(historyDelta(history)).toBe(6);
    expect(historyDelta(history.slice(-2))).toBe(3);
    expect(historyDelta(history.slice(-1))).toBeNull();
  });
});
