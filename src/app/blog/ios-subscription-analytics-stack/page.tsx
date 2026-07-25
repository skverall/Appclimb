import type { Metadata } from "next";
import { ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";

import { ArticleLayout } from "@/components/article-layout";

export const metadata: Metadata = {
  title:
    "The iOS Subscription Analytics Stack: Which Tool Owns Which Metric?",
  description:
    "A practical source-of-truth map for App Store Connect, RevenueCat, PostHog, and Superwall, including the metrics each tool should own.",
  alternates: {
    canonical: "/blog/ios-subscription-analytics-stack",
  },
  openGraph: {
    title: "The iOS Subscription Analytics Stack",
    description:
      "Which metrics belong to App Store Connect, RevenueCat, PostHog, and Superwall—and how to diagnose growth without blending incompatible data.",
    url: "/blog/ios-subscription-analytics-stack",
    type: "article",
    publishedTime: "2026-07-25",
    modifiedTime: "2026-07-25",
  },
};

const sourceLinkClass = "article-source-link";

export default function AnalyticsStackArticle() {
  return (
    <ArticleLayout
      title="The iOS Subscription Analytics Stack: Which Tool Owns Which Metric?"
      description="A practical source-of-truth map for App Store Connect, RevenueCat, PostHog, and Superwall."
      category="Analytics architecture"
      published="2026-07-25"
      updated="2026-07-25"
      readingTime="9 min read"
      slug="ios-subscription-analytics-stack"
    >
      <p className="article-answer">
        A reliable iOS subscription analytics stack gives each stage of the
        customer journey to the provider that observes it most directly: App
        Store Connect for acquisition, PostHog for product behavior, Superwall
        for paywall exposure, and RevenueCat for subscription lifecycle. The
        goal is not one giant dashboard. It is one coherent decision model.
      </p>

      <h2>Why one analytics tool is not enough</h2>
      <p>
        An iOS subscription app crosses several systems before revenue appears.
        Someone discovers the app in the store, downloads it, completes an
        activation behavior, sees a paywall, starts an offer, becomes paid, and
        may renew. No single provider observes every transition with the same
        authority.
      </p>
      <p>
        The common failure is to treat “analytics” as one interchangeable
        bucket. That creates questions the data cannot answer: RevenueCat knows
        a trial started, but not necessarily why onboarding failed. PostHog can
        see a paywall event, but the billing system should decide whether a
        subscription is active. App Store Connect knows discovery and
        downloads, but it does not replace product instrumentation.
      </p>

      <h2>The source-of-truth map</h2>
      <div className="article-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Growth stage</th>
              <th>Primary source</th>
              <th>What it should own</th>
              <th>Important limitation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Discover → Store → Install</td>
              <td>App Store Connect</td>
              <td>
                Impressions, product-page views, source type, downloads,
                conversion, territory, and Apple peer benchmarks
              </td>
              <td>
                Usage metrics can depend on analytics-sharing eligibility and
                Apple’s reporting windows.
              </td>
            </tr>
            <tr>
              <td>Install → Activate</td>
              <td>PostHog</td>
              <td>
                Onboarding steps, activation events, funnels, feature use,
                cohorts, and behavioral retention
              </td>
              <td>
                Event quality depends on a stable tracking plan and consistent
                identity.
              </td>
            </tr>
            <tr>
              <td>Activate → Paywall → Offer</td>
              <td>Superwall</td>
              <td>
                Paywall presentation, placement, variant, experiment exposure,
                and paywall conversion
              </td>
              <td>
                A paywall event is not the final authority for subscription
                entitlement.
              </td>
            </tr>
            <tr>
              <td>Trial → Paid → Renew</td>
              <td>RevenueCat</td>
              <td>
                Trial lifecycle, entitlements, paid conversion, renewal, churn,
                and subscription revenue
              </td>
              <td>
                Revenue data alone cannot explain product behavior before the
                purchase.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="article-sources">
        <strong>Primary documentation</strong>
        <a
          className={sourceLinkClass}
          href="https://developer.apple.com/help/app-store-connect-analytics/"
          target="_blank"
          rel="noreferrer"
        >
          Apple: App Store Connect Analytics{" "}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <a
          className={sourceLinkClass}
          href="https://www.revenuecat.com/docs/dashboard-and-metrics/overview"
          target="_blank"
          rel="noreferrer"
        >
          RevenueCat: dashboard and metrics{" "}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <a
          className={sourceLinkClass}
          href="https://posthog.com/docs/product-analytics"
          target="_blank"
          rel="noreferrer"
        >
          PostHog: product analytics{" "}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <a
          className={sourceLinkClass}
          href="https://superwall.com/docs/dashboard/dashboard-settings/overview-settings-revenue-tracking"
          target="_blank"
          rel="noreferrer"
        >
          Superwall: revenue tracking{" "}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>

      <h2>Do not force a user-level join</h2>
      <p>
        A shared customer identifier can make cross-source analysis powerful,
        but it is only valid when the same identifier is intentionally passed
        and confirmed across providers. Email, device identifiers, anonymous
        event IDs, App Store aggregates, and RevenueCat App User IDs are not
        automatically interchangeable.
      </p>
      <p>
        Without a verified identity mapping, use aggregate UTC windows,
        aligned cohorts, and before/after comparisons. State the limitation
        explicitly. A truthful aggregate comparison is more useful than a
        precise-looking join that never existed.
      </p>

      <h2>Align time before comparing numbers</h2>
      <p>
        Two dashboards can both be correct and still disagree. One may use
        event time while another uses processing time. A provider may include
        redownloads, sandbox transactions, grace periods, refunds, or delayed
        reports differently. Before diagnosing a change, align:
      </p>
      <ol>
        <li>The exact UTC start and end timestamps.</li>
        <li>The app, environment, storefront, plan, and cohort filters.</li>
        <li>The provider’s metric definition and inclusion rules.</li>
        <li>The report freshness and expected ingestion delay.</li>
        <li>Whether the number counts events, devices, users, or subscribers.</li>
      </ol>

      <h2>Find the earliest meaningful constraint</h2>
      <p>
        Diagnose upstream before downstream. If installs fall, a smaller paid
        cohort does not prove the paywall became worse. If activation falls
        after a release, renewal will eventually soften even if subscription
        mechanics remain healthy.
      </p>
      <div className="article-callout">
        <strong>A practical rule</strong>
        <p>
          Start with the earliest material loss that has enough volume,
          freshness, and evidence to support action. Everything downstream is
          context until the upstream change is explained.
        </p>
      </div>

      <h2>Separate observations from hypotheses</h2>
      <p>
        “Activation declined from one period to another” can be an observation.
        “The onboarding release caused the decline” is derived only when the
        timing, segment, and evidence support that relationship. “Shorter
        onboarding will recover activation” is a hypothesis until an experiment
        tests it.
      </p>
      <p>Every useful insight should therefore include:</p>
      <ul>
        <li>the source and metric definition;</li>
        <li>the exact time window and volume;</li>
        <li>freshness and known exclusions;</li>
        <li>evidence references;</li>
        <li>a label: observed, derived, or hypothesis;</li>
        <li>confidence and the next fact that would change the conclusion.</li>
      </ul>

      <h2>The smallest useful weekly workflow</h2>
      <ol>
        <li>
          Check source freshness and coverage before reading the funnel.
        </li>
        <li>
          Compare the complete journey, not an isolated revenue or conversion
          card.
        </li>
        <li>
          Inspect the earliest supported constraint and the change events
          around it.
        </li>
        <li>
          Choose one hypothesis with one primary metric and at least one
          guardrail.
        </li>
        <li>
          Record the outcome so the next diagnosis begins with accumulated
          learning.
        </li>
      </ol>

      <h2>Where AppClimb fits</h2>
      <p>
        AppClimb is being built as the visual diagnosis layer above this stack,
        not as a replacement for the systems that collect the evidence. The
        River Atlas prototype demonstrates the intended Observe → Diagnose →
        Experiment → Learn loop. Complete live connector coverage is still in
        development and the current demo uses clearly labeled synthetic data.
      </p>
      <p>
        <Link href="/ios-subscription-analytics">
          See the product status and source model{" "}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
        , or{" "}
        <Link href="/?demo=1">
          explore the interactive River Atlas demo
        </Link>
        .
      </p>
    </ArticleLayout>
  );
}
