import { describe, expect, it, vi } from "vitest";

import { AI_TOOLS, aiToolStatus, runAiTool, type AiToolData } from "@/lib/ai-tools";
import { buildDataset, type TermRow } from "@/lib/search-terms";

const rows: TermRow[] = [
  { term: "habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 61, rankInGenre: 40 },
  { term: "habit tracker app", genre: "PRODUCTIVITY_UTILITIES", popularity: 52, rankInGenre: 90 },
  { term: "habit", genre: "PRODUCTIVITY_UTILITIES", popularity: 55, rankInGenre: 70 },
  { term: "flight tracker", genre: "TRAVEL", popularity: 66, rankInGenre: 12 },
  { term: "calculator", genre: "PRODUCTIVITY_UTILITIES", popularity: 30, rankInGenre: 499 },
  { term: "streaks", genre: "PRODUCTIVITY_UTILITIES", popularity: 44, rankInGenre: 300 },
];

const current = buildDataset("US", "2026-09-20", rows);
const previous = buildDataset("US", "2026-08-23", [
  { term: "habit tracker", genre: "PRODUCTIVITY_UTILITIES", popularity: 55, rankInGenre: 60 },
  { term: "habit", genre: "PRODUCTIVITY_UTILITIES", popularity: 55, rankInGenre: 70 },
  { term: "calculator", genre: "PRODUCTIVITY_UTILITIES", popularity: 31, rankInGenre: 480 },
]);

function data(overrides: Partial<AiToolData> = {}): AiToolData {
  return {
    latest: vi.fn(async (country: string) => (country === "US" ? current : null)),
    weeksBefore: vi.fn(async () => previous),
    histories: vi.fn(async () =>
      new Map([
        [
          "habit tracker",
          [
            { week: "2026-06-28", popularity: 50 },
            { week: "2026-08-23", popularity: 55 },
            { week: "2026-09-20", popularity: 61 },
          ],
        ],
      ]),
    ),
    ...overrides,
  };
}

const defaults = { country: "US", genre: "Productivity" };

describe("AI tool schema", () => {
  it("declares four function tools with JSON-schema parameters", () => {
    expect(AI_TOOLS.map((tool) => tool.function.name)).toEqual([
      "lookup_keywords",
      "related_keywords",
      "autocomplete_terms",
      "trending_keywords",
    ]);
    for (const tool of AI_TOOLS) expect(tool.function.parameters).toMatchObject({ type: "object" });
  });

  it("describes what is running in plain words", () => {
    expect(aiToolStatus("lookup_keywords", '{"terms":["a","b","c"]}')).toBe(
      "Checking Apple popularity for 3 keywords",
    );
    expect(aiToolStatus("lookup_keywords", '{"terms":["habit"]}')).toBe(
      "Checking Apple popularity for “habit”",
    );
    expect(aiToolStatus("trending_keywords", '{"category":"TRAVEL"}')).toBe(
      "Checking what is rising in Travel",
    );
    expect(aiToolStatus("related_keywords", "not json")).toContain("related to");
  });
});

describe("lookup_keywords", () => {
  it("returns Apple scores with trends, and long-tail ceilings for the rest", async () => {
    const outcome = await runAiTool(
      data(),
      "lookup_keywords",
      JSON.stringify({ terms: ["Habit Tracker", "habit app for adhd", "habit tracker"] }),
      defaults,
    );
    const result = JSON.parse(outcome.content) as {
      week: string;
      results: Array<Record<string, unknown>>;
    };
    expect(result.week).toBe("2026-09-20");
    // Normalized and de-duplicated.
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      term: "habit tracker",
      source: "official",
      popularity: 61,
      category: "Productivity & Utilities",
      change_4w: 6,
      change_12w: 11,
    });
    expect(result.results[1]).toMatchObject({
      term: "habit app for adhd",
      source: "long_tail",
      popularity_at_most: 30,
    });
    expect(outcome.card?.rows).toEqual([
      { term: "habit tracker", popularity: 61, change: 6, category: "Productivity & Utilities" },
      { term: "habit app for adhd", popularity: 30, longTail: true },
    ]);
  });

  it("still answers when trend history fails", async () => {
    const outcome = await runAiTool(
      data({ histories: vi.fn(async () => Promise.reject(new Error("429"))) }),
      "lookup_keywords",
      JSON.stringify({ terms: ["habit"] }),
      defaults,
    );
    expect(JSON.parse(outcome.content).results[0]).toMatchObject({ popularity: 55, change_4w: null });
  });

  it("says plainly when a storefront has no Apple data", async () => {
    const outcome = await runAiTool(
      data(),
      "lookup_keywords",
      JSON.stringify({ terms: ["habit"], country: "DE" }),
      defaults,
    );
    expect(JSON.parse(outcome.content).error).toMatch(/do not guess/i);
    expect(outcome.card).toBeNull();
  });

  it("rejects empty input without touching data", async () => {
    const source = data();
    const outcome = await runAiTool(source, "lookup_keywords", '{"terms":[" "]}', defaults);
    expect(JSON.parse(outcome.content).error).toBeTruthy();
    expect(source.latest).not.toHaveBeenCalled();
  });
});

describe("related_keywords", () => {
  it("puts the app's category first and keeps one-word off-category matches off the card", async () => {
    const outcome = await runAiTool(
      data(),
      "related_keywords",
      JSON.stringify({ term: "habit tracker" }),
      defaults,
    );
    const result = JSON.parse(outcome.content) as {
      related: Array<{ term: string; same_category: boolean }>;
      note?: string;
    };
    expect(result.related[0]).toMatchObject({ term: "habit tracker app", same_category: true });
    expect(result.related.some((row) => row.term === "flight tracker" && !row.same_category)).toBe(true);
    expect(result.note).toBeUndefined();
    expect(outcome.card?.rows.map((row) => row.term)).not.toContain("flight tracker");
  });

  it("flags a niche with no published terms as long tail", async () => {
    const outcome = await runAiTool(
      data(),
      "related_keywords",
      JSON.stringify({ term: "car dealer" }),
      { country: "US", genre: "Business" },
    );
    expect(JSON.parse(outcome.content).note).toMatch(/long tail/i);
    expect(outcome.card).toBeNull();
  });
});

describe("autocomplete_terms and trending_keywords", () => {
  it("expands a prefix by popularity", async () => {
    const outcome = await runAiTool(data(), "autocomplete_terms", '{"prefix":"hab"}', defaults);
    expect(outcome.card?.rows.map((row) => row.term)).toEqual([
      "habit tracker",
      "habit",
      "habit tracker app",
    ]);
  });

  it("lists risers and newcomers in the app's category", async () => {
    const outcome = await runAiTool(data(), "trending_keywords", "{}", defaults);
    const result = JSON.parse(outcome.content) as {
      category: string;
      rising: Array<{ term: string; change_4w: number }>;
      new_to_top_lists: Array<{ term: string }>;
    };
    expect(result.category).toBe("Productivity & Utilities");
    expect(result.rising).toEqual([{ term: "habit tracker", popularity: 61, change_4w: 6 }]);
    expect(result.new_to_top_lists.map((row) => row.term)).toEqual([
      "habit tracker app",
      "streaks",
    ]);
    expect(outcome.card?.title).toBe("Rising in Productivity & Utilities");
    expect(outcome.card?.rows.find((row) => row.term === "streaks")).toMatchObject({ isNew: true });
  });

  it("turns an unknown tool or a data failure into an error result", async () => {
    expect(JSON.parse((await runAiTool(data(), "drop_tables", "{}", defaults)).content).error).toMatch(
      /Unknown tool/,
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = await runAiTool(
      data({ latest: vi.fn(async () => Promise.reject(new Error("D1 down"))) }),
      "autocomplete_terms",
      '{"prefix":"hab"}',
      defaults,
    );
    expect(JSON.parse(broken.content).error).toMatch(/could not be loaded/i);
    spy.mockRestore();
  });
});
