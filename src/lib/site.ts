export const SITE_URL = "https://appclimb.app";
export const SITE_NAME = "AppClimb";
export const SITE_DESCRIPTION =
  "A visual growth diagnosis workspace for independent iOS subscription apps. See where growth stops, understand why, and know what to test next.";
export const SITE_UPDATED = "2026-07-25";

export const PUBLIC_PAGES = [
  {
    path: "/",
    title: "AppClimb — Visual growth diagnosis for iOS subscription apps",
    description:
      "Explore the interactive River Atlas demo and see how AppClimb connects acquisition, activation, paywall, subscription, and retention signals.",
    changeFrequency: "weekly" as const,
    priority: 1,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/ios-subscription-analytics",
    title: "iOS Subscription Analytics and Growth Diagnosis",
    description:
      "Turn App Store Connect, RevenueCat, PostHog, and Superwall signals into one evidence-backed view of your iOS subscription growth journey.",
    changeFrequency: "weekly" as const,
    priority: 0.95,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/guides/ios-subscription-growth",
    title: "The Practical Guide to iOS Subscription Growth",
    description:
      "A source-aware framework for finding the earliest constraint across discovery, activation, paywalls, trials, paid conversion, and renewal.",
    changeFrequency: "monthly" as const,
    priority: 0.9,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/blog",
    title: "AppClimb Field Notes",
    description:
      "Evidence-first guides for independent builders working on iOS subscription growth, analytics, conversion, and retention.",
    changeFrequency: "weekly" as const,
    priority: 0.8,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/blog/ios-subscription-analytics-stack",
    title: "The iOS Subscription Analytics Stack: Which Tool Owns Which Metric?",
    description:
      "A practical source-of-truth map for App Store Connect, RevenueCat, PostHog, and Superwall, including the metrics each tool should own.",
    changeFrequency: "monthly" as const,
    priority: 0.85,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/blog/app-store-conversion-rate",
    title: "What Is App Store Conversion Rate? Apple’s Definition and a Better Diagnosis",
    description:
      "Learn Apple’s exact App Store conversion-rate formula, why product-page conversion is a different metric, and how to diagnose a weak result.",
    changeFrequency: "monthly" as const,
    priority: 0.85,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/pricing",
    title: "Pricing",
    description:
      "AppClimb early access pricing: a 14-day no-card trial, then $12.99 monthly or $129 yearly.",
    changeFrequency: "monthly" as const,
    priority: 0.75,
    lastModified: SITE_UPDATED,
  },
  {
    path: "/about",
    title: "About AppClimb",
    description:
      "Why AppClimb is building a visual, evidence-first growth operating system for independent product builders.",
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
    slug: "ios-subscription-analytics-stack",
    title:
      "The iOS Subscription Analytics Stack: Which Tool Owns Which Metric?",
    description:
      "A practical source-of-truth map for App Store Connect, RevenueCat, PostHog, and Superwall.",
    category: "Analytics architecture",
    published: "2026-07-25",
    updated: "2026-07-25",
    readingTime: "9 min read",
  },
  {
    slug: "app-store-conversion-rate",
    title:
      "What Is App Store Conversion Rate? Apple’s Definition and a Better Diagnosis",
    description:
      "Apple’s exact formula, the product-page metric people often confuse with it, and a practical diagnosis workflow.",
    category: "Acquisition",
    published: "2026-07-25",
    updated: "2026-07-25",
    readingTime: "8 min read",
  },
] as const;

export function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString();
}
