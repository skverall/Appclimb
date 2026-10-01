import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChatMarkdown } from "@/components/chat-markdown";

function html(text: string): string {
  return renderToStaticMarkup(createElement(ChatMarkdown, { text }));
}

describe("ChatMarkdown", () => {
  it("renders bold keywords without showing asterisks", () => {
    const out = html("Focus on **car dealer** and **dealer**.");
    expect(out).toContain("<strong>car dealer</strong>");
    expect(out).toContain("<strong>dealer</strong>");
    expect(out).not.toContain("**");
  });

  it("renders bullet lists and strips empty heading markers", () => {
    const out = html(
      ["These matter:", "- **car dealer** — pos 78", "- dealer — pos 103", "##", ""].join(
        "\n",
      ),
    );
    expect(out).toContain("<ul");
    expect(out).toContain("<li>");
    expect(out).toContain("<strong>car dealer</strong>");
    expect(out).not.toContain("##");
  });

  it("does not inject raw HTML tags as elements", () => {
    const out = html("Hello <script>alert(1)</script>");
    // React escapes text nodes — no live script element.
    expect(out).not.toMatch(/<script>/u);
    expect(out).toContain("alert(1)");
  });

  it("passes CJK, cyrillic, and emoji through untouched", () => {
    const out = html("🎯 推荐关键词：**冥想**\nключевые слова для приложения");
    expect(out).toContain("🎯");
    expect(out).toContain("推荐关键词");
    expect(out).toContain("<strong>冥想</strong>");
    expect(out).toContain("ключевые слова для приложения");
    expect(out).not.toContain("**");
  });

  it("keeps stray asterisks literal when unbalanced", () => {
    const out = html("price is 5*5=25 here");
    expect(out).toContain("5*5=25");
    expect(out).not.toContain("<em>");
  });
});

function htmlWith(text: string, options: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(ChatMarkdown, { text, ...options }));
}

describe("ChatMarkdown rich blocks", () => {
  it("renders markdown tables", () => {
    const out = html(
      ["| keyword | popularity |", "|---|---:|", "| **car dealer** | 61 |", "| dealer app | ≤22 |"].join("\n"),
    );
    expect(out).toContain("<table");
    expect(out).toContain("<th><span>keyword</span></th>");
    expect(out).toContain("<td><span>≤22</span></td>");
    expect(out).not.toContain("|");
  });

  it("turns metadata fences into character-counted cards and hides follow-ups", () => {
    const out = html(
      ["Try this:", "```subtitle", "Inventory & Profit Log", "```", "```followups", "- Next?", "```"].join("\n"),
    );
    expect(out).toContain("Subtitle");
    expect(out).toContain("22/30");
    expect(out).toContain("Inventory &amp; Profit Log");
    expect(out).not.toContain("Next?");
    expect(out).not.toContain("```");
  });

  it("keeps other code fences as preformatted text", () => {
    const out = html("```\nraw text\n```");
    expect(out).toContain("<pre");
    expect(out).toContain("raw text");
  });

  it("links keyword phrases and known single words, not emphasis", () => {
    const out = htmlWith("Use **car dealer**, **dealer**, **no** and **Tier 1**.", {
      keywordHref: (term: string) => `/?kw=${encodeURIComponent(term)}`,
      knownTerms: new Set(["dealer"]),
    });
    expect(out).toContain('href="/?kw=car%20dealer"');
    expect(out).toContain('href="/?kw=dealer"');
    expect(out).toContain("<strong>no</strong>");
    expect(out).toContain("<strong>Tier 1</strong>");
  });
});

describe("ChatMarkdown tables without a rule", () => {
  it("still renders consecutive pipe rows as a table", () => {
    const out = html(["| keyword | rank |", "| car dealer | #94 |", "| dealer | #65 |"].join("\n"));
    expect(out).toContain("<table");
    expect(out).toContain("<th><span>keyword</span></th>");
    expect(out).toContain("<td><span>#65</span></td>");
  });

  it("leaves a single pipe line as text", () => {
    expect(html("a | b")).not.toContain("<table");
    expect(html("| lonely | row |")).not.toContain("<table");
  });
});
