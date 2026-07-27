import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import Script from "next/script";

import { JsonLd } from "@/components/json-ld";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "@/lib/site";

import "./globals.css";
import "./ai-visibility.css";
import "./web-tracking.css";

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
    default: "AppClimb — Growth CI for iOS subscription apps",
    template: "%s · AppClimb",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "AppClimb", url: SITE_URL }],
  creator: "AppClimb",
  publisher: "AppClimb",
  category: "Business software",
  keywords: [
    "iOS subscription analytics",
    "mobile app growth analytics",
    "app funnel analytics",
    "RevenueCat analytics",
    "App Store Connect analytics",
    "PostHog mobile analytics",
    "Superwall analytics",
    "subscription growth",
  ],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      {
        url: "/apple-touch-icon.png",
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
    title: "AppClimb — Visual growth diagnosis for iOS subscription apps",
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
        alt: "AppClimb River Atlas visual growth diagnosis",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AppClimb — See where your app stops growing",
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
                  url: absoluteUrl("/icon.svg"),
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
        {process.env.APPCLIMB_TRACKING_TOKEN && (
          <Script
            src="/appclimb-analytics.js"
            data-token={process.env.APPCLIMB_TRACKING_TOKEN}
            data-storage="session"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
