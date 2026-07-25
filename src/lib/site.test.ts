import { describe, expect, it } from "vitest";

import { ARTICLES, PUBLIC_PAGES, SITE_URL, absoluteUrl } from "@/lib/site";

describe("public discovery inventory", () => {
  it("keeps every indexable page canonical and unique", () => {
    const paths = PUBLIC_PAGES.map((page) => page.path);

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/");
    expect(paths).toContain("/ios-subscription-analytics");
    expect(paths).toContain("/guides/ios-subscription-growth");
    expect(paths).not.toContain("/login");
    expect(paths).not.toContain("/checkout/success");

    for (const path of paths) {
      const url = new URL(absoluteUrl(path));
      expect(url.origin).toBe(SITE_URL);
      expect(url.protocol).toBe("https:");
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
    }
  });

  it("includes every published article in the public inventory", () => {
    const paths = new Set(PUBLIC_PAGES.map((page) => page.path));

    for (const article of ARTICLES) {
      expect(paths.has(`/blog/${article.slug}`)).toBe(true);
      expect(article.updated >= article.published).toBe(true);
    }
  });
});
