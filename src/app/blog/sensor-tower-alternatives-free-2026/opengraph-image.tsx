import { ImageResponse } from "next/og";

import { ArticleOgImage, ogImageSize } from "@/lib/og";

export const alt =
  "7 Free Sensor Tower Alternatives for Indie Developers (2026) — AppClimb Field Notes";
export const size = ogImageSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <ArticleOgImage
      eyebrow="ASO"
      title="7 Free Sensor Tower Alternatives for Indie Developers (2026)"
      description="A practical look at free App Store keyword tools, and how AppClimb’s estimates are built from public data."
    />,
    ogImageSize,
  );
}
