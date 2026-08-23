import type { ReactNode } from "react";

export const ogImageSize = {
  width: 1200,
  height: 630,
} as const;

/**
 * Shared Open Graph artwork for articles and guides. Rendered through
 * next/og's ImageResponse from each route's opengraph-image.tsx so every
 * page ships its own social preview instead of the generic home card.
 */
export function ArticleOgImage({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: "64px 72px",
        color: "#17272d",
        background:
          "radial-gradient(circle at 82% 12%, rgba(57,189,183,.28), transparent 32%), linear-gradient(145deg, #fbfcfa 0%, #edf6f2 100%)",
        fontFamily: "Arial, sans-serif",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        <svg width="54" height="44" viewBox="0 0 44 34">
          <path d="M1 31 14.4 4 27 31Z" fill="#19a89c" />
          <path d="m12 31 15.7-27L43 31Z" fill="#08787d" />
          <path d="m11.4 10.2 3-6.2 3 6.2-3 3.4Z" fill="#f8fbfa" />
          <path d="m24.5 9.6 3.2-5.6 3.2 5.6-3.2 3.1Z" fill="#f8fbfa" />
        </svg>
        AppClimb
        <span
          style={{
            marginLeft: 12,
            padding: "6px 14px",
            borderRadius: 99,
            color: "#08736f",
            background: "#e5f6f2",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 22,
          maxWidth: 1020,
        }}
      >
        <div
          style={{
            fontSize: title.length > 70 ? 52 : 60,
            fontWeight: 750,
            letterSpacing: -2.5,
            lineHeight: 1.08,
          }}
        >
          {title}
        </div>
        <p
          style={{
            margin: 0,
            color: "#5d7475",
            fontSize: 24,
            lineHeight: 1.45,
            maxWidth: 940,
          }}
        >
          {description}
        </p>
      </div>
      <span style={{ color: "#6b7c80", fontSize: 18 }}>
        appclimb.app · Apple data, not a mystery model
      </span>
    </div>
  );
}
