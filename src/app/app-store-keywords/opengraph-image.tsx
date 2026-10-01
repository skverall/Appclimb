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
      description="Apple Ads popularity (1–100) with weekly history for App Store keywords — plus difficulty with its evidence and a verdict on every keyword."
    />,
    ogImageSize,
  );
}
