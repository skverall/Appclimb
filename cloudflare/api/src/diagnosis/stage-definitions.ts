import type { Platform, StageDefinition } from "./types";

/**
 * iOS subscription funnel.
 *
 * `relationship` records how honest each denominator is. Only
 * `same_source_funnel` and `cohort` ratios may ever confirm a constraint;
 * `aggregate_directional` mixes two providers' aggregates and is display-only.
 */
export const STAGE_DEFINITIONS: StageDefinition[] = [
  {
    id: "discover",
    label: "Discover",
    metricKey: "impressions",
    source: "app-store-connect",
  },
  {
    id: "store",
    label: "Store",
    metricKey: "product_page_views",
    source: "app-store-connect",
    validDenominator: {
      metricKey: "impressions",
      source: "app-store-connect",
      relationship: "same_source_funnel",
    },
  },
  {
    id: "install",
    label: "Install",
    metricKey: "downloads",
    source: "app-store-connect",
    validDenominator: {
      metricKey: "product_page_views",
      source: "app-store-connect",
      relationship: "same_source_funnel",
    },
  },
  {
    id: "activate",
    label: "Activate",
    metricKey: "activated_users",
    source: "posthog",
    validDenominator: {
      metricKey: "downloads",
      source: "app-store-connect",
      relationship: "aggregate_directional",
    },
  },
  {
    id: "paywall",
    label: "Paywall",
    metricKey: "paywall_views",
    source: "superwall",
    validDenominator: {
      metricKey: "activated_users",
      source: "posthog",
      relationship: "aggregate_directional",
    },
  },
  {
    id: "trial",
    label: "Trial",
    metricKey: "trials_new",
    source: "revenuecat",
    validDenominator: {
      metricKey: "paywall_views",
      source: "superwall",
      relationship: "aggregate_directional",
    },
  },
  {
    id: "paid",
    label: "Paid",
    metricKey: "paid_new",
    source: "revenuecat",
    validDenominator: {
      metricKey: "trials_new",
      source: "revenuecat",
      relationship: "same_source_funnel",
    },
  },
  {
    id: "renew",
    label: "Renew",
    metricKey: "renewals",
    source: "revenuecat",
    validDenominator: {
      metricKey: "paid_new",
      source: "revenuecat",
      relationship: "cohort",
    },
  },
];

/**
 * Web SaaS funnel, derived from AppClimb's own first-party collector.
 *
 * Every stage comes from one source, so each ratio is a genuine same-source
 * funnel rather than a cross-provider aggregate.
 */
export const WEB_STAGE_DEFINITIONS: StageDefinition[] = [
  {
    id: "web_visit",
    label: "Visits",
    metricKey: "web_visitors",
    source: "appclimb-web",
  },
  {
    id: "web_engaged",
    label: "Engaged",
    metricKey: "web_engaged_visitors",
    source: "appclimb-web",
    validDenominator: {
      metricKey: "web_visitors",
      source: "appclimb-web",
      relationship: "same_source_funnel",
    },
  },
  {
    id: "web_conversion",
    label: "Conversions",
    metricKey: "web_converted_visitors",
    source: "appclimb-web",
    validDenominator: {
      metricKey: "web_engaged_visitors",
      source: "appclimb-web",
      relationship: "same_source_funnel",
    },
  },
];

export function stageDefinitionsFor(platform: Platform): StageDefinition[] {
  return platform === "Web" ? WEB_STAGE_DEFINITIONS : STAGE_DEFINITIONS;
}
