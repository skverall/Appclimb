import { ImageResponse } from "next/og";

import { ArticleOgImage, ogImageSize } from "@/lib/og";

export const alt =
  "What Is App Store Conversion Rate? — AppClimb Field Notes";
export const size = ogImageSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <ArticleOgImage
      eyebrow="Acquisition"
      title="What Is App Store Conversion Rate?"
      description="Apple’s exact formula, a critical denominator distinction, and a source-aware diagnosis workflow."
    />,
    ogImageSize,
  );
}
