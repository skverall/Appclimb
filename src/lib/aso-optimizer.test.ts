import { describe, expect, it } from "vitest";
import {
  cleanWord,
  extractKeywordTokens,
  extractMetadataWords,
  optimizeKeywordField,
} from "./aso-optimizer";

describe("aso-optimizer", () => {
  it("cleans words properly", () => {
    expect(cleanWord("  Meditation! ")).toBe("meditation");
    expect(cleanWord("HABIT-TRACKER")).toBe("habit-tracker");
    expect(cleanWord("Sleep  Sounds #1")).toBe("sleep sounds 1");
  });

  it("extracts keyword tokens from string or array", () => {
    const fromString = extractKeywordTokens("meditation, mindfulness\nrelax, yoga");
    expect(fromString).toEqual(["meditation", "mindfulness", "relax", "yoga"]);

    const fromArray = extractKeywordTokens(["focus timer", "pomodoro"]);
    expect(fromArray).toEqual(["focus", "timer", "pomodoro"]);
  });

  it("extracts unique metadata words from title & subtitle", () => {
    const words = extractMetadataWords(
      "Calm: Sleep & Meditation",
      "Mindful breathing, daily habits",
    );
    expect(words.has("calm")).toBe(true);
    expect(words.has("sleep")).toBe(true);
    expect(words.has("meditation")).toBe(true);
    expect(words.has("mindful")).toBe(true);
    expect(words.has("breathing")).toBe(true);
    expect(words.has("daily")).toBe(true);
    expect(words.has("habits")).toBe(true);
  });

  it("optimizes keyword list without spaces after commas and eliminates duplicates", () => {
    const input = [
      "meditation",
      "mindfulness",
      "sleep sounds",
      "meditation", // duplicate
      "relax",
    ];
    const result = optimizeKeywordField(input, { stripSpaces: true });
    expect(result.optimized).toBe("meditation,mindfulness,sleep,sounds,relax");
    expect(result.charCount).toBe(result.optimized.length);
    expect(result.duplicateWordsRemoved).toContain("meditation");
    expect(result.charCount).toBeLessThanOrEqual(100);
  });

  it("removes redundant words that already appear in title or subtitle", () => {
    const input = ["calm", "zen", "sleep", "guided meditation", "breath"];
    const result = optimizeKeywordField(input, {
      appTitle: "Calm — Sleep Tracker",
      appSubtitle: "Guided meditation for all",
      removeTitleWords: true,
    });
    expect(result.redundantWordsRemoved).toContain("calm");
    expect(result.redundantWordsRemoved).toContain("sleep");
    expect(result.keywordsIncluded).toContain("zen");
    expect(result.keywordsIncluded).toContain("breath");
  });

  it("truncates keywords gracefully when exceeding the 100 character cap", () => {
    const longList = [
      "mindfulness",
      "deepmeditation",
      "anxietarelief",
      "soundmachines",
      "breathingexercises",
      "whitenoiseapp",
      "sleeptrackingdaily",
      "insomniatherapy",
      "mentalwellnesshub",
    ];
    const result = optimizeKeywordField(longList, { limit: 100 });
    expect(result.charCount).toBeLessThanOrEqual(100);
    expect(result.keywordsTruncated.length).toBeGreaterThan(0);
    expect(result.remainingChars).toBeGreaterThanOrEqual(0);
  });
});
