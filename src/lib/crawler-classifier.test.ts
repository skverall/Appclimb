import { describe, expect, it } from "vitest";

import { classifyCrawlerUserAgent } from "@/lib/crawler-classifier";

describe("crawler classifier", () => {
  it("separates answer retrieval from model training", () => {
    expect(classifyCrawlerUserAgent("ChatGPT-User/1.0")).toEqual(
      expect.objectContaining({ category: "ai_answer" }),
    );
    expect(classifyCrawlerUserAgent("GPTBot/1.2")).toEqual(
      expect.objectContaining({ category: "model_training" }),
    );
  });

  it("does not classify a normal browser", () => {
    expect(
      classifyCrawlerUserAgent("Mozilla/5.0 Chrome/140.0 Safari/537.36"),
    ).toBeNull();
  });
});
