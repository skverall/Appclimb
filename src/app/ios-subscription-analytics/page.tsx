import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  CircleDashed,
  Eye,
  FlaskConical,
  LockKeyhole,
  Map,
} from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { ProviderMark } from "@/components/provider-mark";
import { SITE_DESCRIPTION, absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "iOS Subscription Analytics and Growth Diagnosis",
  description:
    "Turn App Store Connect, RevenueCat, PostHog, and Superwall signals into one evidence-backed view of your iOS subscription growth journey.",
  alternates: {
    canonical: "/ios-subscription-analytics",
  },
  openGraph: {
    title: "iOS Subscription Analytics and Growth Diagnosis · AppClimb",
    description:
      "See the full growth journey, find the earliest evidence-backed constraint, and decide what to test next.",
    url: "/ios-subscription-analytics",
  },
};

const stages = [
  "Discover",
  "Store",
  "Install",
  "Activate",
  "Paywall",
  "Trial",
  "Paid",
  "Renew",
];

const sources = [
  {
    provider: "app-store-connect" as const,
    name: "App Store Connect",
    owns: "Discovery, App Store engagement, downloads, Apple sales, and usage.",
  },
  {
    provider: "posthog" as const,
    name: "PostHog",
    owns: "Activation, product funnels, feature use, and behavioral retention.",
  },
  {
    provider: "superwall" as const,
    name: "Superwall",
    owns: "Paywall exposures, variants, experiments, and paywall conversion.",
  },
  {
    provider: "revenuecat" as const,
    name: "RevenueCat",
    owns: "Trials, paid conversion, renewals, churn, and subscription revenue.",
  },
] as const;

const faq = [
  {
    question: "What is iOS subscription analytics?",
    answer:
      "iOS subscription analytics connects acquisition, product behavior, paywall, billing, and retention evidence so a developer can understand where growth changes across the whole customer journey—not only inside one dashboard or one provider.",
  },
  {
    question: "Does AppClimb replace RevenueCat or PostHog?",
    answer:
      "No. AppClimb treats App Store Connect, RevenueCat, PostHog, and Superwall as named sources of truth. Its role is to align their evidence into one visual journey and make disagreements or missing coverage visible.",
  },
  {
    question: "Is AppClimb fully live today?",
    answer:
      "Not yet. The interactive River Atlas is a high-fidelity prototype powered mostly by clearly labeled sample data. Authentication, billing, account controls, secure connector setup, and the backend foundation are shipped; complete live imports and end-to-end diagnosis are in development.",
  },
  {
    question: "Can AppClimb change my app, paywall, or pricing?",
    answer:
      "No. AppClimb begins as a read-only decision-support product. It can prepare an experiment, but it does not silently change App Store metadata, ads, prices, paywalls, or external systems.",
  },
  {
    question: "How much does AppClimb cost?",
    answer:
      "AppClimb early access starts with a 14-day trial without a card. The current plan is $12.99 per month or $129 per year, with billing and tax handling through Paddle.",
  },
] as const;

export default function IOSSubscriptionAnalyticsPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "AppClimb",
          url: absoluteUrl("/ios-subscription-analytics"),
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any modern web browser",
          description: SITE_DESCRIPTION,
          audience: {
            "@type": "Audience",
            audienceType:
              "Independent developers and small teams running iOS subscription apps",
          },
          featureList: [
            "Visual iOS subscription growth journey",
            "Evidence-backed constraint diagnosis",
            "Read-only experiment planning",
            "Named source-of-truth model",
          ],
          offers: [
            {
              "@type": "Offer",
              name: "Monthly",
              price: "12.99",
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
            {
              "@type": "Offer",
              name: "Yearly",
              price: "129",
              priceCurrency: "USD",
              url: absoluteUrl("/pricing"),
            },
          ],
          isAccessibleForFree: true,
          releaseNotes:
            "Early access. The interactive demo uses synthetic data; complete live-data coverage is in development.",
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer,
            },
          })),
        }}
      />
      <main>
        <section className="marketing-hero marketing-container">
          <div className="marketing-hero-copy">
            <span className="marketing-eyebrow">
              Visual iOS subscription analytics
            </span>
            <h1>See the growth journey—not another wall of dashboards.</h1>
            <p>
              AppClimb maps acquisition, activation, paywall, subscription, and
              retention evidence into one visual system so you can find the
              earliest meaningful constraint and choose what to test next.
            </p>
            <div className="marketing-hero-actions">
              <Link href="/?demo=1" className="marketing-primary-action large">
                Explore River Atlas <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link href="/login" className="marketing-secondary-action">
                Create an account
              </Link>
            </div>
            <div className="marketing-trust-row">
              <span>
                <Eye size={15} aria-hidden="true" /> Read-only by design
              </span>
              <span>
                <LockKeyhole size={15} aria-hidden="true" /> No card for the
                14-day trial
              </span>
              <span>
                <CircleDashed size={15} aria-hidden="true" /> Live coverage in
                development
              </span>
            </div>
          </div>
          <div className="marketing-river-card" aria-label="Growth journey">
            <div className="marketing-river-card-head">
              <span>River Atlas</span>
              <small>Illustrative model</small>
            </div>
            <div className="marketing-river">
              {stages.map((stage, index) => (
                <div
                  key={stage}
                  className={index === 3 ? "constraint" : ""}
                  style={{
                    width: `${Math.max(44, 100 - index * 8)}%`,
                  }}
                >
                  <span>{stage}</span>
                  <small>{index === 3 ? "inspect first" : "evidence"}</small>
                </div>
              ))}
            </div>
            <p>
              River width represents volume. Color represents health. The
              earliest supported constraint receives attention first.
            </p>
          </div>
        </section>

        <section className="marketing-definition-band">
          <div className="marketing-container marketing-definition">
            <span className="marketing-eyebrow">
              What AppClimb means by growth diagnosis
            </span>
            <p>
              <strong>Growth diagnosis</strong> is the process of aligning
              signals from each stage of a product journey, finding the first
              material loss supported by evidence, and separating what is
              observed from what is calculated or only hypothesized.
            </p>
          </div>
        </section>

        <section className="marketing-section marketing-container">
          <div className="marketing-section-heading">
            <span className="marketing-eyebrow">One journey, named owners</span>
            <h2>Keep each metric with the source that actually owns it.</h2>
            <p>
              AppClimb does not quietly blend incompatible numbers. Each stage
              has a named source of truth, a time window, freshness, evidence,
              and visible limitations.
            </p>
          </div>
          <div className="source-owner-grid">
            {sources.map((source) => (
              <article key={source.name}>
                <div className="source-owner-icon">
                  <ProviderMark provider={source.provider} />
                </div>
                <div>
                  <h3>{source.name}</h3>
                  <p>{source.owns}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="marketing-inline-link">
            <Link href="/blog/ios-subscription-analytics-stack">
              Read the complete source-of-truth map{" "}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="marketing-section marketing-section-tint">
          <div className="marketing-container">
            <div className="marketing-section-heading">
              <span className="marketing-eyebrow">
                Observe → Diagnose → Experiment → Learn
              </span>
              <h2>Move from a metric to a decision without pretending certainty.</h2>
            </div>
            <div className="marketing-loop-grid">
              <article>
                <Map aria-hidden="true" />
                <span>01</span>
                <h3>Observe the system</h3>
                <p>
                  See volume, conversion, freshness, and meaningful changes in
                  the context of the complete journey.
                </p>
              </article>
              <article>
                <Eye aria-hidden="true" />
                <span>02</span>
                <h3>Diagnose the constraint</h3>
                <p>
                  Inspect the earliest loss supported by source-owned evidence,
                  confidence, and known limitations.
                </p>
              </article>
              <article>
                <FlaskConical aria-hidden="true" />
                <span>03</span>
                <h3>Prepare one experiment</h3>
                <p>
                  Turn the diagnosis into a hypothesis, primary metric,
                  guardrail, segment, and learning requirement.
                </p>
              </article>
              <article>
                <Check aria-hidden="true" />
                <span>04</span>
                <h3>Record what changed</h3>
                <p>
                  Connect the result back to the growth map and decide whether
                  the evidence supports the next action.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-container">
          <div className="marketing-section-heading">
            <span className="marketing-eyebrow">Honest early access</span>
            <h2>Know exactly what works today.</h2>
          </div>
          <div className="status-table" role="table" aria-label="Product status">
            <div role="row">
              <strong role="columnheader">Status</strong>
              <strong role="columnheader">Capability</strong>
              <strong role="columnheader">What it means</strong>
            </div>
            <div role="row">
              <span role="cell" className="status-live">
                Shipped
              </span>
              <span role="cell">Production foundation</span>
              <span role="cell">
                Demo, authentication, trial, Paddle billing, account controls,
                and secure connector setup.
              </span>
            </div>
            <div role="row">
              <span role="cell" className="status-prototype">
                Prototype
              </span>
              <span role="cell">River Atlas experience</span>
              <span role="cell">
                A high-fidelity interactive workspace powered mostly by clearly
                labeled synthetic data.
              </span>
            </div>
            <div role="row">
              <span role="cell" className="status-building">
                In development
              </span>
              <span role="cell">Complete source coverage</span>
              <span role="cell">
                Reliable live imports, real River computation, and full
                evidence-backed diagnosis.
              </span>
            </div>
            <div role="row">
              <span role="cell" className="status-roadmap">
                Roadmap
              </span>
              <span role="cell">Market intelligence</span>
              <span role="cell">
                Keyword terrain, competitor intelligence, and broader
                mobile/SaaS growth journeys.
              </span>
            </div>
          </div>
        </section>

        <section className="marketing-section marketing-faq marketing-container">
          <div className="marketing-section-heading">
            <span className="marketing-eyebrow">Questions</span>
            <h2>What independent builders usually ask first.</h2>
          </div>
          <div className="marketing-faq-list">
            {faq.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="marketing-final-cta">
          <div className="marketing-container">
            <span className="marketing-eyebrow">
              Start with the whole picture
            </span>
            <h2>See the River Atlas concept before connecting a source.</h2>
            <p>
              The demo is interactive, uses clearly labeled sample data, and
              requires no account.
            </p>
            <Link href="/?demo=1" className="marketing-primary-action large">
              Explore the demo <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
