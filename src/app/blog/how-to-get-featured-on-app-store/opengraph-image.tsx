import { ImageResponse } from "next/og";

import { ArticleOgImage, ogImageSize } from "@/lib/og";

export const alt =
  "How to Get Featured on the App Store: 7 Steps for Indie Devs — AppClimb Field Notes";
export const size = ogImageSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <ArticleOgImage
      eyebrow="Discovery"
      title="How to Get Featured on the App Store: 7 Steps for Indie Devs"
      description="Apple’s nomination process, what editors look for, and how indie devs land editorial placements."
    />,
    ogImageSize,
  );
}
