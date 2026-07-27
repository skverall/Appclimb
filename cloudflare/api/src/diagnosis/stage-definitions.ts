import type { StageDefinition } from "./types";

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
