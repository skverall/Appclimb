"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";

import { useAccount } from "@/components/account-provider";
import { PRO_MONTHLY_USD, PRO_YEARLY_USD } from "@/lib/plan";

type BillingCycle = "monthly" | "yearly";

const FREE_FEATURES = [
  "8 keyword checks per day as a guest",
  "Official Apple Ads popularity (30 lookups/day)",
  "Free sign-in: 1 tracked app · 25 keywords",
  "ASO assistant after sign-in — 5 messages/day",
  "30-day trend history in this browser",
  "No card required",
];

const PRO_FEATURES = [
  "Unlimited keyword checks",
  "Unlimited apps & keywords in My Apps",
  "500 official popularity lookups/day",
  "90-day trend history",
  "AI assistant — 200 messages/day",
  "Cloud sync across devices",
  "Cancel anytime — Pro runs to period end",
];

export function PricingPlans() {
  const { account, isPro, openUpgrade } = useAccount();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const price = cycle === "monthly" ? PRO_MONTHLY_USD : PRO_YEARLY_USD;
  const priceSuffix = cycle === "monthly" ? "/month" : "/year";
  const perMonth = cycle === "monthly" ? "" : `≈ $${(PRO_YEARLY_USD / 12).toFixed(2)}/month`;

  return (
    <>
      <div className="pricing-cycle-toggle" role="tablist" aria-label="Billing cycle">
        <button
          type="button"
          role="tab"
          aria-selected={cycle === "monthly"}
          className={cycle === "monthly" ? "is-active" : undefined}
          onClick={() => setCycle("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={cycle === "yearly"}
          className={cycle === "yearly" ? "is-active" : undefined}
          onClick={() => setCycle("yearly")}
        >
          Yearly <span className="pricing-save-chip">save 33%</span>
        </button>
      </div>

      <section className="pricing-grid" aria-label="Plans">
        <article className="pricing-card">
          <h2>Free</h2>
          <p className="pricing-price">
            $0 <span>forever</span>
          </p>
          <p className="pricing-card-deck">
            Search keywords as a guest. Sign in free to track one app and use
            the assistant.
          </p>
          <ul className="pricing-features">
            {FREE_FEATURES.map((feature) => (
              <li key={feature}>
                <Check size={15} aria-hidden="true" /> {feature}
              </li>
            ))}
          </ul>
          <Link href="/" className="pricing-cta pricing-cta-secondary">
            Open Keyword Explorer
          </Link>
        </article>

        <article className="pricing-card pricing-card-featured">
          <span className="pricing-card-badge">
            <Sparkles size={12} aria-hidden="true" /> Most popular
          </span>
          <h2>Pro</h2>
          <p className="pricing-price">
            ${price} <span>{priceSuffix}</span>
          </p>
          {perMonth && <p className="pricing-per-month">{perMonth}</p>}
          <p className="pricing-card-deck">
            Unlimited everything plus cloud sync — less than lunch, versus
            $89–$4,000/month ASO suites.
          </p>
          <ul className="pricing-features">
            {PRO_FEATURES.map((feature) => (
              <li key={feature}>
                <Check size={15} aria-hidden="true" /> {feature}
              </li>
            ))}
          </ul>
          {isPro ? (
            <span className="pricing-cta pricing-cta-current">
              <Check size={15} aria-hidden="true" /> You&apos;re on Pro
            </span>
          ) : (
            <button type="button" className="pricing-cta pricing-cta-primary" onClick={openUpgrade}>
              <Sparkles size={15} aria-hidden="true" />
              {account.user ? "Upgrade to Pro" : "Sign in & upgrade"}
            </button>
          )}
        </article>
      </section>
    </>
  );
}
