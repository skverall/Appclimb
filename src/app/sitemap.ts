import type { MetadataRoute } from "next";

import { PUBLIC_PAGES, absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified: page.lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    ...(page.path === "/" ||
    page.path === "/app-store-keywords" ||
    page.path === "/guides/keyword-research"
      ? { images: [absoluteUrl("/opengraph-image")] }
      : {}),
  }));
}
