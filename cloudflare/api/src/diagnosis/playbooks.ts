import type {
  ActionPlan,
  AnyStageId,
  DiagnosisProvider,
  SourceProvider,
} from "./types";

export interface PlaybookContext {
  stageId: AnyStageId;
  stageLabel: string;
  sourceProvider: DiagnosisProvider;
  observedRate?: number | null;
  benchmarkRate?: number;
  evidenceIds: string[];
  minimumSample?: number;
  minimumCompleteDays?: number;
}

/**
 * Deterministic stage playbooks.
 *
 * Every branch returns a complete {@link ActionPlan}: what to change, where,
 * why, how it is measured, and when to stop or roll back. No generic advice.
 */
export function buildActionPlan(context: PlaybookContext): ActionPlan {
  const plan = buildStagePlan(context);
  return {
    ...plan,
    targetStageId: isIosStageId(context.stageId) ? context.stageId : plan.targetStageId,
    minimumSample: context.minimumSample ?? plan.minimumSample,
    minimumCompleteDays: context.minimumCompleteDays ?? plan.minimumCompleteDays,
  };
}

const IOS_STAGE_IDS = new Set([
  "discover",
  "store",
  "install",
  "activate",
  "paywall",
  "trial",
  "paid",
  "renew",
]);

function isIosStageId(
  stageId: AnyStageId,
): stageId is Exclude<AnyStageId, "web_visit" | "web_engaged" | "web_conversion"> {
  return IOS_STAGE_IDS.has(stageId);
}

function buildStagePlan(context: PlaybookContext): ActionPlan {
  const { stageId, stageLabel, sourceProvider, observedRate, benchmarkRate, evidenceIds } = context;

  const currentPercent = observedRate !== undefined && observedRate !== null
    ? `${(observedRate * 100).toFixed(1)}%`
    : "low";
  const benchmarkPercent = benchmarkRate ? `${(benchmarkRate * 100).toFixed(0)}%` : "target baseline";

  // ActionPlan.sourceProviders describes user-connectable sources only; the
  // first-party web collector is not one of them.
  const externalProviders: SourceProvider[] =
    sourceProvider === "appclimb-web" ? [] : [sourceProvider];

  switch (stageId) {
    case "web_visit":
      return {
        problem: `Qualified visit volume is below this site's own recent baseline (${currentPercent} of baseline traffic).`,
        desiredOutcome: `Recover qualified visit volume from the channels that historically converted.`,
        whyThisAction: `Acquisition quality, not raw traffic, sets the ceiling for every later web stage. A drop concentrated in one channel or landing path is diagnosable and reversible.`,
        steps: [
          {
            order: 1,
            title: "Segment the drop by channel and landing path",
            instruction:
              "In Acquisition Atlas, compare the recent window against the previous one by channel and by landing path. Identify the one channel or path carrying most of the decline.",
            effort: "small",
          },
          {
            order: 2,
            title: "Check campaign and UTM integrity for that channel",
            instruction:
              "Verify that campaign links still carry the expected utm_source/utm_medium/utm_campaign and that no redirect is stripping them. Mis-tagged traffic looks like a drop even when volume is intact.",
            effort: "small",
          },
          {
            order: 3,
            title: "Restore or replace the affected channel intake",
            instruction:
              "Repair the broken link, republish the affected landing page, or reallocate spend to the channel that historically produced converting sessions. Change one channel at a time.",
            effort: "medium",
          },
        ],
        prerequisites: ["AppClimb tracking script verified on the live site"],
        instrumentation: [
          "web_visitors by channel",
          "web_visitors by landing path",
        ],
        primaryMetric: {
          key: "web_visitors",
          label: "Qualified Visits",
          targetDirection: "up",
        },
        guardrails: [
          { key: "web_converted_visitors", label: "Conversions" },
          { key: "web_engaged_visitors", label: "Engaged Visitors" },
        ],
        stopCondition:
          "Run for 14 complete days after the change, or until the affected channel returns 30 qualified visits, whichever is later.",
        rollbackCondition:
          "Revert the change if conversion rate on the affected channel falls below its own prior baseline.",
        evidenceIds,
        sourceProviders: [],
      };

    case "web_engaged":
      return {
        problem: `Visit-to-engagement conversion (${currentPercent}) is below this site's own baseline (${benchmarkPercent}).`,
        desiredOutcome: `Raise the share of visits that reach a genuine engagement signal on the landing page.`,
        whyThisAction: `Visitors are arriving but leaving before the page delivers its promise. This is a landing-page and message-match problem, not a traffic problem.`,
        steps: [
          {
            order: 1,
            title: "Compare the ad or referrer promise against the landing headline",
            instruction:
              "Open the top declining landing path and read its headline next to the copy of the referring channel. Mismatched promises are the most common cause of an engagement drop.",
            effort: "small",
          },
          {
            order: 2,
            title: "Remove the first friction element above the fold",
            instruction:
              "Delete or defer one blocking element on that page — an interstitial, a cookie wall covering content, or a form shown before any value.",
            effort: "medium",
          },
          {
            order: 3,
            title: "Confirm the engagement event still fires",
            instruction:
              "Load the page and verify the AppClimb engagement event is recorded. An instrumentation regression looks identical to a behaviour regression.",
            effort: "small",
          },
        ],
        prerequisites: ["AppClimb tracking script verified on the affected landing path"],
        instrumentation: [
          "web_engaged_visitors / web_visitors ratio",
          "engagement event delivery on the affected path",
        ],
        primaryMetric: {
          key: "web_engagement_rate",
          label: "Visit to Engagement Rate",
          targetDirection: "up",
        },
        guardrails: [{ key: "web_converted_visitors", label: "Conversions" }],
        stopCondition:
          "Run for 14 complete days or until the landing path collects 30 visits, whichever is later.",
        rollbackCondition:
          "Restore the removed element if conversions per visit drop by 10% or more.",
        evidenceIds,
        sourceProviders: [],
      };

    case "web_conversion":
      return {
        problem: `Engagement-to-conversion rate (${currentPercent}) is below this site's own baseline (${benchmarkPercent}).`,
        desiredOutcome: `Recover the conversion rate among sessions that already engaged with the page.`,
        whyThisAction: `These visitors already showed intent. A drop here points at the conversion step itself — the CTA, the form, or the instrumentation behind the goal.`,
        steps: [
          {
            order: 1,
            title: "Verify the conversion goal is still recorded correctly",
            instruction:
              "Complete the conversion flow yourself and confirm the configured goal event reaches AppClimb. Rule out an instrumentation break before changing the page.",
            effort: "small",
          },
          {
            order: 2,
            title: "Reduce the conversion step to its minimum",
            instruction:
              "Remove one required form field, or one step in the flow, so the shortest path to the goal is a single obvious action.",
            effort: "medium",
          },
          {
            order: 3,
            title: "Make the primary CTA unambiguous",
            instruction:
              "Ensure exactly one primary call to action is visible on the converting page and that its label names the outcome, not the mechanism.",
            effort: "small",
          },
        ],
        prerequisites: ["Primary conversion goal configured for the web property"],
        instrumentation: [
          "web_converted_visitors / web_engaged_visitors ratio",
          "conversion goal event delivery",
        ],
        primaryMetric: {
          key: "web_conversion_rate",
          label: "Engaged to Conversion Rate",
          targetDirection: "up",
        },
        guardrails: [{ key: "web_engaged_visitors", label: "Engaged Visitors" }],
        stopCondition:
          "Run for 14 complete days or until 30 engaged sessions are collected on the affected path, whichever is later.",
        rollbackCondition:
          "Restore the removed field or step if lead quality declines or conversions do not recover within the window.",
        evidenceIds,
        sourceProviders: [],
      };
  }

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
        sourceProviders: [...externalProviders, "posthog"],
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
        sourceProviders: externalProviders,
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
        sourceProviders: [...externalProviders, "revenuecat"],
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
        sourceProviders: [...externalProviders, "revenuecat"],
      };
  }
}
