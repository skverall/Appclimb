import { ImageResponse } from "next/og";

import { ArticleOgImage, ogImageSize } from "@/lib/og";

export const alt =
  "AppClimb ASO Assistant — keyword ideas, listing copy, and rank advice";
export const size = ogImageSize;
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <ArticleOgImage
      eyebrow="ASO Assistant"
      title="An ASO assistant that knows your tracked keywords"
      description="Ask for keyword ideas, listing copy rewrites, or a research plan — grounded in your app’s tracked data and honest, labeled estimates."
    />,
    ogImageSize,
  );
}
