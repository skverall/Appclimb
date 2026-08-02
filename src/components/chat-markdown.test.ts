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
});
