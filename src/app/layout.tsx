import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";

import { JsonLd } from "@/components/json-ld";
import { iconUrl } from "@/lib/brand";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "@/lib/site";

import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AppClimb — App Store keyword explorer",
    template: "%s · AppClimb",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "AppClimb", url: SITE_URL }],
  creator: "AppClimb",
  publisher: "AppClimb",
  category: "Developer tools",
  keywords: [
    "App Store keyword research",
    "ASO keywords",
    "keyword popularity",
    "keyword difficulty",
    "App Store search",
    "app store optimization",
  ],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: iconUrl("icon.svg"), type: "image/svg+xml" },
      { url: iconUrl("icon-48.png"), sizes: "48x48", type: "image/png" },
      { url: iconUrl("favicon.ico"), sizes: "48x48", type: "image/x-icon" },
    ],
    shortcut: iconUrl("favicon.ico"),
    apple: [
      {
        url: iconUrl("apple-touch-icon.png"),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "AppClimb — App Store keyword explorer",
    description: SITE_DESCRIPTION,
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "AppClimb App Store keyword explorer",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AppClimb — Find keywords worth ranking for",
    description: SITE_DESCRIPTION,
    images: ["/opengraph-image"],
  },
  alternates: {
    types: {
      "application/rss+xml": absoluteUrl("/feed.xml"),
    },
  },
  verification: {
    yandex: "3d71c1eca65fe46d",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${manrope.variable}`}>
      <body>
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": `${SITE_URL}/#organization`,
                name: SITE_NAME,
                url: SITE_URL,
                logo: {
                  "@type": "ImageObject",
                  url: absoluteUrl(iconUrl("icon-512.png")),
                  width: 512,
                  height: 512,
                },
                sameAs: ["https://github.com/skverall/Appclimb"],
              },
              {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                url: SITE_URL,
                name: SITE_NAME,
                description: SITE_DESCRIPTION,
                publisher: {
                  "@id": `${SITE_URL}/#organization`,
                },
                inLanguage: "en",
              },
            ],
          }}
        />
        {children}
      </body>
    </html>
  );
}
