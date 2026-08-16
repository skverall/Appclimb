export const SITE_URL = "https://appclimb.app";
export const SITE_NAME = "AppClimb";
export const SITE_DESCRIPTION =
  "App Store keyword popularity from Apple Ads — official 1–100 scores, labeled source, not a black-box volume. Estimated difficulty, bulk lists, and 30-day trends. Free, no account.";
export const SITE_UPDATED = "2026-08-16";

export const PUBLIC_PAGES = [
  {
    path: "/",
    title: "AppClimb — Apple Ads keyword popularity",
    description:
      "Official Apple Ads popularity (1–100) for any App Store keyword — not a mystery volume. Estimated difficulty, bulk lists, and local trends. Free, no account.",
    changeFrequency: "weekly" as const,
    priority: 1,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/assistant",
    title: "ASO Assistant — free App Store keyword chat",
    description:
      "Chat with AppClimb’s ASO assistant for keyword ideas, estimated score guidance, and listing tips — free, local context only.",
    changeFrequency: "weekly" as const,
    priority: 0.92,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/app-store-keywords",
    title: "App Store Keyword Research: Official Apple Ads Popularity",
    description:
      "How AppClimb shows official Apple Ads popularity (1–100) plus estimated difficulty — and why the source is labeled, unlike black-box ASO tools.",
    changeFrequency: "weekly" as const,
    priority: 0.95,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/guides/keyword-research",
    title: "The Practical Guide to App Store Keyword Research",
    description:
      "A source-aware framework for finding the earliest ASO opportunity: search, estimate popularity and difficulty, track trends, and iterate.",
    changeFrequency: "monthly" as const,
    priority: 0.9,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/blog",
    title: "AppClimb Field Notes",
    description:
      "Practical notes for independent app builders on App Store search, keyword research, and ASO.",
    changeFrequency: "weekly" as const,
    priority: 0.8,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/blog/sensor-tower-alternatives-free-2026",
    title: "Free App Store Keyword Tools in 2026: What Actually Works",
    description:
      "A practical look at free App Store keyword tools, what data they can legally show, and how AppClimb's estimates are built.",
    changeFrequency: "monthly" as const,
    priority: 0.85,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/blog/app-store-conversion-rate",
    title: "What Is App Store Conversion Rate? Apple's Definition and a Better Diagnosis",
    description:
      "Learn Apple's exact App Store conversion-rate formula, why product-page conversion is a different metric, and how to diagnose a weak result.",
    changeFrequency: "monthly" as const,
    priority: 0.85,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/blog/how-to-get-featured-on-app-store",
    title: "How to Get Featured on the App Store (and What Featuring Really Gets You)",
    description:
      "What App Store featuring depends on, what it is worth, and why keyword rankings deserve more of your attention first.",
    changeFrequency: "monthly" as const,
    priority: 0.85,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/blog/ios-subscription-analytics-stack",
    title: "What App Store Keyword Data Is Public (and What Isn't)",
    description:
      "A source-of-truth map of App Store search data: what Apple publishes, what only Apple Ads shows, and how estimates are made honestly.",
    changeFrequency: "monthly" as const,
    priority: 0.85,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/pricing",
    title: "Pricing",
    description:
      "AppClimb is free: keyword popularity and difficulty estimates from public App Store data, no account or payment required.",
    changeFrequency: "monthly" as const,
    priority: 0.75,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/about",
    title: "About AppClimb",
    description:
      "Why AppClimb leads with official Apple Ads popularity instead of unexplained search volume — free, labeled, no account.",
    changeFrequency: "monthly" as const,
    priority: 0.65,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/privacy",
    title: "Privacy",
    description: "AppClimb privacy principles and data handling.",
    changeFrequency: "yearly" as const,
    priority: 0.3,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/terms",
    title: "Terms",
    description: "AppClimb terms of service.",
    changeFrequency: "yearly" as const,
    priority: 0.3,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/refunds",
    title: "Refunds",
    description: "AppClimb refund policy.",
    changeFrequency: "yearly" as const,
    priority: 0.3,
    lastModified: SITE_UPDATED,
  },
] as const;

export const ARTICLES = [
  {
    slug: "sensor-tower-alternatives-free-2026",
    title: "Free App Store Keyword Tools in 2026: What Actually Works",
    description:
      "A practical look at free App Store keyword tools, what data they can legally show, and how AppClimb's estimates are built.",
    category: "ASO",
    published: "2026-07-20",
    updated: "2026-08-02",
    readingTime: "8 min read",
  },
  {
    slug: "app-store-conversion-rate",
    title:
      "What Is App Store Conversion Rate? Apple's Definition and a Better Diagnosis",
    description:
      "Apple's exact formula, the product-page metric people often confuse with it, and a practical diagnosis workflow.",
    category: "Acquisition",
    published: "2026-07-25",
    updated: "2026-08-02",
    readingTime: "8 min read",
  },
  {
    slug: "how-to-get-featured-on-app-store",
    title: "How to Get Featured on the App Store (and What Featuring Really Gets You)",
    description:
      "What App Store featuring depends on, what it is worth, and why keyword rankings deserve more of your attention first.",
    category: "Discovery",
    published: "2026-07-22",
    updated: "2026-08-02",
    readingTime: "7 min read",
  },
  {
    slug: "ios-subscription-analytics-stack",
    title: "What App Store Keyword Data Is Public (and What Isn't)",
    description:
      "A source-of-truth map of App Store search data: what Apple publishes, what only Apple Ads shows, and how estimates are made honestly.",
    category: "Data",
    published: "2026-07-25",
    updated: "2026-08-02",
    readingTime: "9 min read",
  },
] as const;

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}
