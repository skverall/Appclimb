/**
 * The single source of the AppClimb web tracking snippet (Task P0.23).
 *
 * Nothing else in the app may hand-roll a `<script src=".../appclimb-analytics.js">`
 * string. The add-website flow, Acquisition Atlas and the verification gate all
 * call `buildTrackingSnippet`.
 */

import { TRACKING_INSTALL_VERSION } from "./web-install-state";

export interface TrackingInstallTarget {
  domain: string;
  trackingToken: string;
  /** Origin that serves `/appclimb-analytics.js` and `/api/track`. */
  collectorOrigin: string;
}

export type TrackingInstallTabId =
  | "agent"
  | "nextjs"
  | "react-vite"
  | "html"
  | "crawler";

export interface TrackingInstallTab {
  id: TrackingInstallTabId;
  label: string;
  summary: string;
  language: string;
  code: string;
  /** Optional extras are shown last and never in the first prompt. */
  advanced?: boolean;
  filename?: string;
}

/** The exact script tag a site must serve. One generator, no variants. */
export function buildTrackingSnippet(target: TrackingInstallTarget): string {
  const origin = normalizeOrigin(target.collectorOrigin);
  return [
    "<script",
    `  src="${origin}/appclimb-analytics.js"`,
    `  data-token="${target.trackingToken}"`,
    '  data-storage="session"',
    "  defer",
    "></script>",
  ].join("\n");
}

/** Conversion call the site fires when a configured goal happens. */
export function buildConversionSnippet(goal: string): string {
  const safeGoal = goal.trim() || "account_created";
  return [
    'if (typeof window !== "undefined") {',
    `  window.appclimbAnalytics?.track("conversion", { goal: "${safeGoal}" });`,
    "}",
  ].join("\n");
}

/** Server-side crawler forwarding. Deliberately kept out of the first prompt. */
export function buildCrawlerForwardingSnippet(
  target: TrackingInstallTarget,
): string {
  const origin = normalizeOrigin(target.collectorOrigin);
  return [
    "# .env on the server (never in client bundles)",
    `APPCLIMB_TRACKING_TOKEN="${target.trackingToken}"`,
    "",
    "# Forward recognized AI/search crawler requests, preserving the original",
    "# User-Agent. AppClimb classifies them server-side and keeps them out of",
    "# human visitor metrics.",
    `# POST ${origin}/api/track/crawler`,
    "#   { token, eventId, hostname, path, occurredAt }",
    "#   header: x-appclimb-original-user-agent",
  ].join("\n");
}

/**
 * Framework install recipes, in the order Task P0.25 requires after the AI
 * coding agent tab: Next.js, React/Vite, plain HTML, then advanced crawler
 * forwarding last.
 */
export function buildFrameworkInstallTabs(
  target: TrackingInstallTarget,
): TrackingInstallTab[] {
  const snippet = buildTrackingSnippet(target);
  const origin = normalizeOrigin(target.collectorOrigin);
  return [
    {
      id: "nextjs",
      label: "Next.js",
      summary: `Add the script to the root layout that renders ${target.domain}.`,
      language: "tsx",
      filename: "app/layout.tsx",
      code: [
        'import Script from "next/script";',
        "",
        "export default function RootLayout({",
        "  children,",
        "}: {",
        "  children: React.ReactNode;",
        "}) {",
        "  return (",
        '    <html lang="en">',
        "      <body>",
        "        {children}",
        "        <Script",
        `          src="${origin}/appclimb-analytics.js"`,
        `          data-token="${target.trackingToken}"`,
        '          data-storage="session"',
        '          strategy="afterInteractive"',
        "        />",
        "      </body>",
        "    </html>",
        "  );",
        "}",
      ].join("\n"),
    },
    {
      id: "react-vite",
      label: "React / Vite",
      summary: "Add the script tag to the Vite HTML entry point.",
      language: "html",
      filename: "index.html",
      code: ["<body>", '  <div id="root"></div>', ...snippet.split("\n").map((line) => `  ${line}`), "</body>"].join(
        "\n",
      ),
    },
    {
      id: "html",
      label: "Plain HTML",
      summary: `Paste before </body> on every page of ${target.domain}.`,
      language: "html",
      code: snippet,
    },
    {
      id: "crawler",
      label: "Advanced: crawler forwarding",
      summary:
        "Optional. Server-side AI and search crawler visibility. Finish the browser install first.",
      language: "bash",
      advanced: true,
      code: buildCrawlerForwardingSnippet(target),
    },
  ];
}

export function trackingInstallVersion(): number {
  return TRACKING_INSTALL_VERSION;
}

function normalizeOrigin(value: string): string {
  return (value || "https://appclimb.app").replace(/\/+$/u, "");
}
