import type { MetadataRoute } from "next";

import { allKeywordPagePaths } from "@/lib/keyword-pages";
import { PUBLIC_PAGES, SITE_UPDATED, absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Weekly Apple data pages: /keywords, each storefront, each category.
  const keywordPages: MetadataRoute.Sitemap = allKeywordPagePaths().map((path) => ({
    url: absoluteUrl(path),
    lastModified: SITE_UPDATED,
    changeFrequency: "weekly",
    priority: path === "/keywords" ? 0.8 : path.split("/").length === 3 ? 0.7 : 0.6,
  }));
  return [...PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: page.lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    ...(page.path === "/" ||
    page.path === "/app-store-keywords" ||
    page.path === "/guides/keyword-research"
      ? { images: [absoluteUrl("/opengraph-image")] }
      : {}),
  })), ...keywordPages];
}
