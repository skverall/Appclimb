import type { Metadata } from "next";
import { ArrowRight, Compass, Eye, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { MarketingShell } from "@/components/marketing-shell";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "About AppClimb",
  description:
    "Why AppClimb is building a visual, evidence-first growth operating system for independent product builders.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About AppClimb",
    description:
      "The product direction, principles, and honest early-access status behind River Atlas.",
    url: "/about",
  },
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: "About AppClimb",
          url: absoluteUrl("/about"),
          description:
            "AppClimb is building a visual growth operating system for independent product builders.",
          mainEntity: {
            "@id": "https://appclimb.app/#organization",
          },
        }}
      />
      <main className="about-page">
        <section className="about-hero marketing-container">
          <span className="marketing-eyebrow">Why AppClimb exists</span>
          <h1>Independent builders have data. They need a coherent next step.</h1>
          <p>
            Growth evidence is scattered across stores, product analytics,
            paywalls, billing platforms, reviews, and spreadsheets. AppClimb is
            being built to turn those fragments into a visual map of the
            business and one evidence-backed learning loop.
          </p>
        </section>

        <section className="about-principles marketing-container">
          <article>
            <Eye aria-hidden="true" />
            <h2>Visual before textual</h2>
            <p>
              Width shows volume, position shows sequence, color shows health,
              and motion explains change. Text supports the visual instead of
              replacing it with another report.
            </p>
          </article>
          <article>
            <ShieldCheck aria-hidden="true" />
            <h2>Evidence before advice</h2>
            <p>
              Every conclusion should expose its source, window, freshness,
              confidence, and limitations. Observations, calculations, and
              hypotheses are not interchangeable.
            </p>
          </article>
          <article>
            <Compass aria-hidden="true" />
            <h2>Read-only before automation</h2>
            <p>
              AppClimb can prepare an experiment, but the builder stays in
              control. The product does not silently mutate metadata, ads,
              prices, paywalls, or external systems.
            </p>
          </article>
        </section>

        <section className="about-story marketing-container">
          <div>
            <span className="marketing-eyebrow">Initial focus</span>
            <h2>One truthful iOS subscription journey first.</h2>
          </div>
          <div>
            <p>
              AppClimb begins with independent developers and micro-teams
              running iOS subscription apps. Their path from App Store
              discovery to activation, trial, paid conversion, and renewal is
              measurable—but fragmented across providers.
            </p>
            <p>
              The long-term direction includes Android apps, SaaS products, and
              web services. Expansion comes after the first real iOS journey is
              complete and trusted, not before.
            </p>
          </div>
        </section>

        <section className="about-status">
          <div className="marketing-container">
            <span className="marketing-eyebrow">Current status</span>
            <h2>River Atlas is an early-access product prototype.</h2>
            <p>
              The interactive demo, authentication, trial, pricing, billing,
              account controls, secure connector setup, and production
              foundation are available. Most visible demo data is synthetic.
              Complete live imports and full evidence-backed diagnosis remain
              in development.
            </p>
            <div className="marketing-hero-actions">
              <Link href="/?demo=1" className="marketing-primary-action large">
                Explore the demo <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a
                href="https://github.com/skverall/Appclimb"
                target="_blank"
                rel="noreferrer"
                className="marketing-secondary-action"
              >
                View the technical foundation
              </a>
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
