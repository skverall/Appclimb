import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Map,
  Search,
} from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "The Practical Guide to iOS Subscription Growth",
  description:
    "A source-aware framework for finding the earliest constraint across discovery, activation, paywalls, trials, paid conversion, and renewal.",
  alternates: {
    canonical: "/guides/ios-subscription-growth",
  },
  openGraph: {
    title: "The Practical Guide to iOS Subscription Growth",
    description:
      "Diagnose the complete iOS subscription journey without mixing sources, denominators, or hypotheses.",
    url: "/guides/ios-subscription-growth",
    type: "article",
    publishedTime: "2026-07-25",
    modifiedTime: "2026-07-25",
  },
};

const guideSections = [
  { id: "model", label: "1. Model the journey" },
  { id: "sources", label: "2. Assign source ownership" },
  { id: "constraint", label: "3. Find the first constraint" },
  { id: "evidence", label: "4. Grade the evidence" },
  { id: "experiment", label: "5. Design the experiment" },
  { id: "weekly", label: "6. Run the weekly loop" },
] as const;

export default function IOSSubscriptionGrowthGuide() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: "The Practical Guide to iOS Subscription Growth",
          description:
            "A source-aware framework for diagnosing an iOS subscription growth journey.",
          datePublished: "2026-07-25",
          dateModified: "2026-07-25",
          url: absoluteUrl("/guides/ios-subscription-growth"),
          mainEntityOfPage: absoluteUrl("/guides/ios-subscription-growth"),
          author: {
            "@type": "Organization",
            name: "AppClimb",
            url: absoluteUrl("/about"),
          },
          publisher: {
            "@type": "Organization",
            name: "AppClimb",
            url: absoluteUrl("/"),
          },
          proficiencyLevel: "Beginner to advanced",
          about: [
            "iOS subscription growth",
            "mobile app analytics",
            "subscription funnel",
          ],
        }}
      />
      <main className="guide-page">
        <section className="guide-hero marketing-container">
          <div>
            <span className="marketing-eyebrow">
              Definitive field guide · July 2026
            </span>
            <h1>The practical guide to iOS subscription growth.</h1>
            <p>
              A complete, source-aware method for turning scattered acquisition,
              product, paywall, and billing data into one testable decision.
            </p>
            <div className="article-meta">
              <span>By the AppClimb product team</span>
              <span>14 min read</span>
              <span>Last updated July 25, 2026</span>
            </div>
          </div>
          <div className="guide-hero-card">
            <Map aria-hidden="true" />
            <strong>Core principle</strong>
            <p>
              Fix the earliest meaningful constraint supported by enough fresh
              evidence. Do not optimize a downstream metric while its upstream
              input is unstable.
            </p>
          </div>
        </section>

        <div className="guide-layout marketing-container">
          <nav className="guide-toc" aria-label="Guide sections">
            <strong>In this guide</strong>
            {guideSections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
            <Link href="/?demo=1">
              Explore River Atlas <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </nav>

          <article className="article-body guide-body">
            <p className="article-answer">
              iOS subscription growth is the movement from discovery to
              renewal: Discover → Store → Install → Activate → Paywall → Trial →
              Paid → Renew. A growth diagnosis identifies where that movement
              first weakens, checks whether the evidence is trustworthy, and
              turns the finding into one measurable experiment.
            </p>

            <section id="model">
              <span className="guide-step">Step 1</span>
              <h2>Model the whole customer journey</h2>
              <p>
                A subscription business is a connected system. More impressions
                only help if they become qualified downloads. Downloads only
                help if people reach value. Paywall conversion only matters
                when acquired subscribers retain.
              </p>
              <div className="guide-stage-list">
                <div>
                  <strong>Discover</strong>
                  <span>People encounter the app in search, browse, or referrals.</span>
                </div>
                <div>
                  <strong>Store</strong>
                  <span>The search-result promise and product page earn attention.</span>
                </div>
                <div>
                  <strong>Install</strong>
                  <span>A qualified visitor downloads the app.</span>
                </div>
                <div>
                  <strong>Activate</strong>
                  <span>The user reaches the first behavior linked to real value.</span>
                </div>
                <div>
                  <strong>Paywall</strong>
                  <span>The offer appears in the right context and is understood.</span>
                </div>
                <div>
                  <strong>Trial</strong>
                  <span>The user accepts an offer and begins evaluation.</span>
                </div>
                <div>
                  <strong>Paid</strong>
                  <span>The offer converts into an active paid entitlement.</span>
                </div>
                <div>
                  <strong>Renew</strong>
                  <span>Continued value earns another billing period.</span>
                </div>
              </div>
              <p>
                Your exact activation event must describe delivered value, not
                a convenient click. “Opened the app” is rarely activation.
                “Completed the first guided workout,” “created the first
                invoice,” or “received the first useful analysis” may be.
              </p>
            </section>

            <section id="sources">
              <span className="guide-step">Step 2</span>
              <h2>Assign every metric to a source of truth</h2>
              <p>
                App Store Connect should own store discovery and downloads.
                Product analytics such as PostHog should own behavioral
                activation and retention. A paywall platform such as Superwall
                should own exposure and variant context. RevenueCat should own
                subscription lifecycle and entitlement state.
              </p>
              <p>
                This separation prevents a visually polished dashboard from
                quietly blending different definitions. It also makes
                discrepancies actionable: the question becomes “why do these
                named sources disagree?” rather than “which number looks
                better?”
              </p>
              <div className="article-callout">
                <strong>Never invent identity</strong>
                <p>
                  Join users across systems only when the same identifier is
                  intentionally shared and confirmed. Otherwise compare
                  aggregates, UTC windows, cohorts, and before/after periods.
                </p>
              </div>
              <Link href="/blog/ios-subscription-analytics-stack">
                See the detailed source-of-truth map{" "}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </section>

            <section id="constraint">
              <span className="guide-step">Step 3</span>
              <h2>Find the earliest meaningful constraint</h2>
              <p>
                Start upstream and move forward. At each transition, ask whether
                the loss is material, whether the volume is sufficient, and
                whether the data is fresh enough to support action.
              </p>
              <div className="guide-question-grid">
                <article>
                  <Search aria-hidden="true" />
                  <h3>Is the change real?</h3>
                  <p>
                    Check volume, seasonality, delayed reports, source
                    definitions, and data quality.
                  </p>
                </article>
                <article>
                  <Map aria-hidden="true" />
                  <h3>Is it the first loss?</h3>
                  <p>
                    A downstream decline may simply reflect fewer qualified
                    people entering from upstream.
                  </p>
                </article>
                <article>
                  <FlaskConical aria-hidden="true" />
                  <h3>Can a test teach us?</h3>
                  <p>
                    Prefer a bounded experiment that can change the conclusion,
                    not a broad redesign.
                  </p>
                </article>
              </div>
              <p>
                Example: if install volume remains stable but the percentage
                reaching the activation event falls after an onboarding
                release, activation is a stronger first constraint than trial
                conversion. The smaller trial cohort is a downstream symptom
                until the activation loss is understood.
              </p>
            </section>

            <section id="evidence">
              <span className="guide-step">Step 4</span>
              <h2>Grade the evidence before giving advice</h2>
              <p>Use three explicit classes:</p>
              <ul>
                <li>
                  <strong>Observed:</strong> directly present in the source data.
                </li>
                <li>
                  <strong>Derived:</strong> calculated from aligned evidence and
                  documented rules.
                </li>
                <li>
                  <strong>Hypothesis:</strong> plausible, but not yet confirmed.
                </li>
              </ul>
              <p>
                Every insight should carry evidence references, source
                ownership, time window, volume, freshness, confidence, and known
                limitations. This is not bureaucracy. It is what prevents a
                confident sentence from becoming fake causality.
              </p>
              <div className="article-callout">
                <strong>Better conclusion</strong>
                <p>
                  “Activation declined in the post-release cohort, while install
                  mix remained stable. The release is a plausible contributor;
                  a shorter onboarding experiment can test the hypothesis.”
                </p>
              </div>
            </section>

            <section id="experiment">
              <span className="guide-step">Step 5</span>
              <h2>Design one experiment around the constraint</h2>
              <p>A useful experiment record contains:</p>
              <ul className="guide-check-list">
                <li>
                  <CheckCircle2 aria-hidden="true" /> A falsifiable hypothesis
                </li>
                <li>
                  <CheckCircle2 aria-hidden="true" /> One primary metric
                </li>
                <li>
                  <CheckCircle2 aria-hidden="true" /> At least one guardrail metric
                </li>
                <li>
                  <CheckCircle2 aria-hidden="true" /> Target cohort or segment
                </li>
                <li>
                  <CheckCircle2 aria-hidden="true" /> Expected direction
                </li>
                <li>
                  <CheckCircle2 aria-hidden="true" /> Duration or sample requirement
                </li>
                <li>
                  <CheckCircle2 aria-hidden="true" /> A decision rule for the result
                </li>
              </ul>
              <p>
                If the primary metric is activation, a guardrail might be
                first-week retention or trial start quality. The goal is not to
                make one number rise at any cost; it is to improve the system
                without moving the problem downstream.
              </p>
            </section>

            <section id="weekly">
              <span className="guide-step">Step 6</span>
              <h2>Run a weekly Observe → Diagnose → Experiment → Learn loop</h2>
              <ol>
                <li>Verify source freshness, coverage, and identity assumptions.</li>
                <li>Review the complete journey and meaningful change events.</li>
                <li>Inspect the earliest evidence-backed constraint.</li>
                <li>Advance one experiment or record why evidence is insufficient.</li>
                <li>Attach the outcome to the journey so future decisions improve.</li>
              </ol>
              <p>
                This loop is intentionally small. Independent builders do not
                need another report to maintain. They need a reliable way to
                choose the next learning step.
              </p>
            </section>

            <h2>Primary references</h2>
            <div className="article-sources">
              <a
                className="article-source-link"
                href="https://developer.apple.com/help/app-store-connect-analytics/"
                target="_blank"
                rel="noreferrer"
              >
                Apple: App Store Connect Analytics{" "}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
              <a
                className="article-source-link"
                href="https://www.revenuecat.com/docs/dashboard-and-metrics/overview"
                target="_blank"
                rel="noreferrer"
              >
                RevenueCat: dashboard and metrics{" "}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
              <a
                className="article-source-link"
                href="https://posthog.com/docs/product-analytics"
                target="_blank"
                rel="noreferrer"
              >
                PostHog: product analytics{" "}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
              <a
                className="article-source-link"
                href="https://superwall.com/docs/dashboard/dashboard-settings/overview-settings-revenue-tracking"
                target="_blank"
                rel="noreferrer"
              >
                Superwall: revenue tracking{" "}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          </article>
        </div>

        <section className="marketing-final-cta">
          <div className="marketing-container">
            <span className="marketing-eyebrow">See the framework visually</span>
            <h2>Explore the River Atlas concept.</h2>
            <p>
              AppClimb’s interactive demo uses clearly labeled sample data to
              show the intended diagnosis loop. Complete live imports are still
              in development.
            </p>
            <Link href="/?demo=1" className="marketing-primary-action large">
              Open the demo <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
