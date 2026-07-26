import { describe, expect, it } from "vitest";

import {
  analyzeAiVisibilityAnswer,
  defaultAiVisibilityPrompts,
} from "./ai-visibility";

describe("AI visibility prompt setup", () => {
  it("creates one bounded prompt per supported intent", () => {
    const prompts = defaultAiVisibilityPrompts(
      "Currency Converter: FX Rates",
      "currency exchange",
    );
    expect(prompts).toHaveLength(3);
    expect(prompts.map((prompt) => prompt.category)).toEqual([
      "discovery",
      "comparison",
      "branded",
    ]);
    expect(prompts[0].prompt).not.toContain("Currency Converter");
  });
});

describe("AI visibility answer analysis", () => {
  it("detects an explicit ranked mention", () => {
    const answer = [
      "Here are three options:",
      "1. XE Currency",
      "2. Currency Converter: FX Rates — a focused travel option.",
      "3. Wise",
    ].join("\n");
    expect(
      analyzeAiVisibilityAnswer(answer, "Currency Converter: FX Rates"),
    ).toMatchObject({ mentioned: true, position: 2 });
  });

  it("keeps an unranked mention separate from a ranked position", () => {
    expect(
      analyzeAiVisibilityAnswer(
        "Currency Converter: FX Rates is useful for travelers.",
        "Currency Converter: FX Rates",
      ),
    ).toMatchObject({ mentioned: true, position: null });
  });

  it("reports an absent app without inventing a position", () => {
    expect(
      analyzeAiVisibilityAnswer("Try XE Currency or Wise.", "My FX Tool"),
    ).toMatchObject({ mentioned: false, position: null });
  });
});
