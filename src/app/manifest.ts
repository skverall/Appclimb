import type { MetadataRoute } from "next";

import { iconUrl } from "@/lib/brand";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — App Store Keyword Explorer`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#08787d",
    orientation: "any",
    categories: ["utilities", "productivity"],
    icons: [
      {
        src: iconUrl("icon.svg"),
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: iconUrl("icon-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: iconUrl("icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
