export const SITE_URL = "https://appclimb.app";
export const SITE_NAME = "AppClimb";
export const SITE_DESCRIPTION =
  "Free App Store keyword research: estimated popularity, difficulty, and 30-day trends built from public App Store data — no account required.";
export const SITE_UPDATED = "2026-08-02";

export const PUBLIC_PAGES = [
  {
    path: "/",
    title: "AppClimb — App Store keyword explorer",
    description:
      "Search any App Store keyword and see estimated popularity, difficulty, and a 30-day trend — free, from public data, without an account.",
    changeFrequency: "weekly" as const,
    priority: 1,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/app-store-keywords",
    title: "App Store Keyword Research: Popularity and Difficulty Estimates",
    description:
      "How AppClimb estimates keyword popularity and difficulty from public App Store data, and how to use the estimates to pick keywords worth ranking for.",
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
      "Why AppClimb is building a free, honest App Store keyword tool on public data — no invented volumes, no dark patterns.",
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
