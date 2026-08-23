import { ImageResponse } from "next/og";

import { ArticleOgImage, ogImageSize } from "@/lib/og";

export const alt =
  "What App Store Keyword Data Is Public (and What Isn't) — AppClimb Field Notes";
export const size = ogImageSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <ArticleOgImage
      eyebrow="Data"
      title="What App Store Keyword Data Is Public (and What Isn’t)"
      description="Which keyword signals are public, which live only inside Apple Search Ads, and how honest estimates are built."
    />,
    ogImageSize,
  );
}
