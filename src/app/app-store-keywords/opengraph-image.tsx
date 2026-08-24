import { ImageResponse } from "next/og";

import { ArticleOgImage, ogImageSize } from "@/lib/og";

export const alt =
  "App Store keyword research with official Apple Ads popularity — AppClimb";
export const size = ogImageSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <ArticleOgImage
      eyebrow="Official Apple Ads data"
      title="Popularity from Apple. Not a black box."
      description="Apple’s official Ads popularity (1–100) for any App Store keyword, labeled on every score — with estimated difficulty, bulk lists, and 30-day trends."
    />,
    ogImageSize,
  );
}
