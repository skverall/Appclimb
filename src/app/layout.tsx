import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
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
  metadataBase: new URL("https://appclimb.app"),
  title: {
    default: "AppClimb — See where your app stops growing",
    template: "%s · AppClimb",
  },
  description:
    "A visual growth diagnosis workspace for independent iOS subscription apps.",
  applicationName: "AppClimb",
  openGraph: {
    title: "AppClimb — See where your app stops growing",
    description:
      "Connect your product data. Find the earliest evidence-backed bottleneck. Run the next experiment.",
    type: "website",
    url: "/",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
