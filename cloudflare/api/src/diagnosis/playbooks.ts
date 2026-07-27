import type { ActionPlan, SourceProvider, StageId } from "./types";

export interface PlaybookContext {
  stageId: StageId;
  stageLabel: string;
  sourceProvider: SourceProvider;
  observedRate?: number | null;
  benchmarkRate?: number;
  evidenceIds: string[];
}

export function buildActionPlan(context: PlaybookContext): ActionPlan {
  const { stageId, stageLabel, sourceProvider, observedRate, benchmarkRate, evidenceIds } = context;

  const currentPercent = observedRate !== undefined && observedRate !== null
    ? `${(observedRate * 100).toFixed(1)}%`
    : "low";
  const benchmarkPercent = benchmarkRate ? `${(benchmarkRate * 100).toFixed(0)}%` : "target baseline";

  switch (stageId) {
    case "discover":
      return {
        problem: `Search and store discoverability is lower than target baseline.`,
        desiredOutcome: `Increase impression volume by expanding keyword reach and metadata relevance.`,
        whyThisAction: `Discover is the top of the acquisition funnel. Higher impression volume expands top-of-funnel capacity.`,
        steps: [
          {
            order: 1,
            title: "Audit keyword rankings and storefront metadata",
            instruction: "Check top 20 keywords in Rank Terrain and identify high-volume terms missing from subtitle/keywords field.",
            effort: "small",
          },
          {
            order: 2,
            title: "Prepare metadata update",
            instruction: "Update App Store subtitle and keyword field to focus on high-intent search terms.",
            effort: "medium",
          },
          {
            order: 3,
            title: "Publish and monitor impression trend",
            instruction: "Submit new metadata in App Store Connect and observe impression volume over a 14-day window.",
            effort: "small",
          },
        ],
        prerequisites: ["App Store Connect metadata edit permission"],
        instrumentation: ["impressions metric from App Store Connect"],
        primaryMetric: {
          key: "impressions",
          label: "App Store Impressions",
          targetDirection: "up",
        },
        guardrails: [
          {
            key: "product_page_views",
            label: "Product Page Views",
          },
        ],
        stopCondition: "Run for 14 complete days post-release.",
        rollbackCondition: "Revert metadata if impression volume falls by more than 15%.",
        evidenceIds,
        sourceProviders: ["app-store-connect"],
      };

    case "store":
      return {
        problem: `Store page view conversion rate (${currentPercent}) is trailing the ${benchmarkPercent} benchmark.`,
        desiredOutcome: `Improve impression-to-pageview conversion rate to match benchmark.`,
        whyThisAction: `Product page views indicate that impressions are converting into interested store visitors.`,
        steps: [
          {
            order: 1,
            title: "Audit app icon and primary screenshot",
            instruction: "Review first 3 screenshots on search result card against top competitors for visual clarity and value prop.",
            effort: "small",
          },
          {
            order: 2,
            title: "Create Product Page Optimization (PPO) test",
            instruction: "Set up a 2-variant screenshot PPO test in App Store Connect testing one single clear benefit headline.",
            effort: "medium",
          },
          {
            order: 3,
            title: "Run test until statistical confidence is reached",
            instruction: "Keep PPO test live until App Store Connect reports >= 90% confidence.",
            effort: "small",
          },
        ],
        prerequisites: ["App Store Connect PPO feature enabled"],
        instrumentation: ["product_page_views / impressions ratio"],
        primaryMetric: {
          key: "product_page_view_rate",
          label: "Product Page View Conversion Rate",
          targetDirection: "up",
        },
        guardrails: [
          {
            key: "downloads",
            label: "App Downloads",
          },
        ],
        stopCondition: "Run for at least 1,000 page views or 14 days.",
        rollbackCondition: "Stop variant if page view conversion drops by >= 10%.",
        evidenceIds,
        sourceProviders: ["app-store-connect"],
      };

    case "install":
      return {
        problem: `Store page view to download conversion (${currentPercent}) is below target (${benchmarkPercent}).`,
        desiredOutcome: `Increase store conversion rate from page view to download.`,
        whyThisAction: `Visitors are landing on your store page but not downloading. Aligning expectations improves install conversion.`,
        steps: [
          {
            order: 1,
            title: "Review screenshots 2–5 and video preview",
            instruction: "Ensure screenshots clearly showcase core app UI and primary value proposition above the fold.",
            effort: "small",
          },
          {
            order: 2,
            title: "Clarify value proposition in description",
            instruction: "Simplify first 3 lines of store description to immediately state what problem the app solves.",
            effort: "small",
          },
          {
            order: 3,
            title: "Deploy update and compare install rate",
            instruction: "Submit store listing update and observe page-view-to-download conversion rate for 14 days.",
            effort: "medium",
          },
        ],
        prerequisites: ["App Store Connect listing edit permission"],
        instrumentation: ["downloads / product_page_views ratio"],
        primaryMetric: {
          key: "install_conversion_rate",
          label: "Install Conversion Rate",
          targetDirection: "up",
        },
        guardrails: [
          {
            key: "activated_users",
            label: "Activated Users",
          },
        ],
        stopCondition: "Run for 14 days or minimum 500 downloads.",
        rollbackCondition: "Revert listing changes if install rate deteriorates by >= 10%.",
        evidenceIds,
        sourceProviders: ["app-store-connect"],
      };

    case "activate":
      return {
        problem: `Product activation rate (${currentPercent}) is lower than ${benchmarkPercent} target.`,
        desiredOutcome: `Increase the percentage of new installs who reach the first-value activation milestone.`,
        whyThisAction: `Users who fail to activate drop off before experiencing core product value.`,
        steps: [
          {
            order: 1,
            title: "Identify activation friction step",
            instruction: "Analyze PostHog onboarding flow to pinpoint the exact screen where drop-off is highest.",
            effort: "small",
          },
          {
            order: 2,
            title: "Remove or defer optional onboarding steps",
            instruction: "Make optional fields (such as notification permission or account setup) skip-able or deferred.",
            effort: "medium",
          },
          {
            order: 3,
            title: "Add clear visual call-to-action on empty state",
            instruction: "Guide new users directly to their first core action with a primary highlighted button.",
            effort: "medium",
          },
        ],
        prerequisites: ["PostHog product event tracking active"],
        instrumentation: ["PostHog activation event cohort rate"],
        primaryMetric: {
          key: "activation_rate",
          label: "First-Value Activation Rate",
          targetDirection: "up",
        },
        guardrails: [
          {
            key: "paywall_views",
            label: "Paywall Views",
          },
        ],
        stopCondition: "Run for 14 days or minimum 200 new activated users.",
        rollbackCondition: "Revert onboarding flow if 1-day retention drops by >= 15%.",
        evidenceIds,
        sourceProviders: [sourceProvider, "posthog"],
      };

    case "paywall":
      return {
        problem: `Paywall exposure rate is below target, limiting trial and revenue potential.`,
        desiredOutcome: `Increase qualified paywall view rate without degrading product experience.`,
        whyThisAction: `Users cannot convert to trial or paid plans if they are never presented with a paywall trigger.`,
        steps: [
          {
            order: 1,
            title: "Audit paywall trigger placement",
            instruction: "Verify that paywall triggers exist at key value moments (e.g. after first core action completion).",
            effort: "small",
          },
          {
            order: 2,
            title: "Test paywall presentation timing",
            instruction: "Configure Superwall/in-app trigger to present paywall immediately after user reaches first-value event.",
            effort: "medium",
          },
        ],
        prerequisites: ["Superwall or in-app paywall integration active"],
        instrumentation: ["paywall_views metric"],
        primaryMetric: {
          key: "paywall_views",
          label: "Paywall Impression Rate",
          targetDirection: "up",
        },
        guardrails: [
          {
            key: "activated_users",
            label: "Activated Users",
          },
        ],
        stopCondition: "Observe for 14 days.",
        rollbackCondition: "Revert trigger if user session length drops by >= 20%.",
        evidenceIds,
        sourceProviders: [sourceProvider],
      };

    case "trial":
    case "paid":
      return {
        problem: `${stageLabel} conversion rate (${currentPercent}) is below ${benchmarkPercent} target.`,
        desiredOutcome: `Improve paywall to ${stageLabel} conversion rate.`,
        whyThisAction: `Optimizing paywall messaging, trial length, or price presentation increases trial start and paid conversion.`,
        steps: [
          {
            order: 1,
            title: "Audit paywall offer structure",
            instruction: "Review trial duration, price anchor, and social proof elements on the primary paywall screen.",
            effort: "small",
          },
          {
            order: 2,
            title: "Test headline and risk reversal",
            instruction: "Run an A/B test updating the paywall headline to emphasize main outcome and add 'Cancel anytime' guarantee.",
            effort: "medium",
          },
          {
            order: 3,
            title: "Evaluate result after sample collection",
            instruction: "Compare trial start rate between control and variant over 14 complete days.",
            effort: "small",
          },
        ],
        prerequisites: ["RevenueCat / Superwall integration active"],
        instrumentation: ["RevenueCat trial/paid conversion rate"],
        primaryMetric: {
          key: `${stageId}_conversion_rate`,
          label: `${stageLabel} Conversion Rate`,
          targetDirection: "up",
        },
        guardrails: [
          {
            key: "renewals",
            label: "Subscription Renewals",
          },
        ],
        stopCondition: "Run for 14 days or minimum 100 paywall views.",
        rollbackCondition: "Revert paywall variant if conversion rate drops by >= 10%.",
        evidenceIds,
        sourceProviders: [sourceProvider, "revenuecat"],
      };

    case "renew":
    default:
      return {
        problem: `Subscription renewal / retention rate (${currentPercent}) is below benchmark (${benchmarkPercent}).`,
        desiredOutcome: `Reduce churn and increase renewal rates for paid subscribers.`,
        whyThisAction: `Retaining existing subscribers is essential for sustainable LTV and MRR growth.`,
        steps: [
          {
            order: 1,
            title: "Identify churn timing",
            instruction: "Analyze RevenueCat subscription retention cohort data to pinpoint when non-renewals peak (e.g. Day 7 vs Month 1).",
            effort: "small",
          },
          {
            order: 2,
            title: "Implement in-app retention check-in",
            instruction: "Send targeted engagement prompt 2 days prior to renewal highlighting recent value delivered.",
            effort: "medium",
          },
        ],
        prerequisites: ["RevenueCat subscription events active"],
        instrumentation: ["RevenueCat renewal rate metric"],
        primaryMetric: {
          key: "renewals",
          label: "Subscription Renewal Rate",
          targetDirection: "up",
        },
        guardrails: [
          {
            key: "paid_new",
            label: "New Paid Subscribers",
          },
        ],
        stopCondition: "Observe renewal cohort over 30 days.",
        rollbackCondition: "Revert check-in if user opt-out rates increase.",
        evidenceIds,
        sourceProviders: [sourceProvider, "revenuecat"],
      };
  }
}
