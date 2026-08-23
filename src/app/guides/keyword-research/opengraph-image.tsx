import { ImageResponse } from "next/og";

import { ArticleOgImage, ogImageSize } from "@/lib/og";

export const alt =
  "The Practical Guide to App Store Keyword Research — AppClimb";
export const size = ogImageSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <ArticleOgImage
      eyebrow="Definitive Guide"
      title="The Practical Guide to App Store Keyword Research"
      description="Find keywords worth ranking for without paying for data you cannot verify."
    />,
    ogImageSize,
  );
}
