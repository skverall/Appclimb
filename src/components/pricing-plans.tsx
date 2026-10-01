"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Lock, Sparkles } from "lucide-react";
import Link from "next/link";

import { useAccount } from "@/components/account-provider";
import { trackAppEvent } from "@/lib/analytics-client";
import { GUEST_EXPLORER_CHECKS_PER_DAY, PLAN_LIMITS, PRO_MONTHLY_USD, PRO_YEARLY_USD } from "@/lib/plan";

type BillingCycle = "monthly" | "yearly";

const free = PLAN_LIMITS.free;
const pro = PLAN_LIMITS.pro;

const FREE_FEATURES = [
  `${free.explorerChecksPerDay} new keyword checks a day (${GUEST_EXPLORER_CHECKS_PER_DAY} without signing in)`,
  "Apple Ads popularity, difficulty evidence & verdict",
  `${free.historyWeeks} weeks of Apple popularity history per keyword`,
  "Trending, related & autocomplete searches",
  `Track ${free.trackedApps} app · ${free.keywordsPerApp} keywords`,
  `ASO assistant — ${free.aiMessagesPerDay} messages a day`,
];

const PRO_FEATURES = [
  "Unlimited keyword checks",
  `${pro.historyWeeks} weeks of Apple popularity history`,
  "Unlimited apps & keywords",
  `${pro.historyDays} days of rank history`,
  `ASO assistant — ${pro.aiMessagesPerDay} messages a day`,
  "Cloud sync across devices",
  "Weekly email: what changed for your keywords",
];

const YEARLY_PER_MONTH = (PRO_YEARLY_USD / 12).toFixed(2);
const YEARLY_SAVING = PRO_MONTHLY_USD * 12 - PRO_YEARLY_USD;
const SAVE_PERCENT = Math.round((YEARLY_SAVING / (PRO_MONTHLY_USD * 12)) * 100);

/** Pro checkout button for server-rendered sections of the pricing page. */
export function ProCheckoutButton({
  cycle = "yearly",
  className = "pr-btn pr-btn--primary",
  children,
}: {
  cycle?: BillingCycle;
  className?: string;
  children: React.ReactNode;
}) {
  const { isPro, openUpgradeWith } = useAccount();
  if (isPro) {
    return (
      <span className={`${className} is-current`}>
        <Check size={15} aria-hidden="true" /> You&apos;re on Pro
      </span>
    );
  }
  return (
    <button type="button" className={className} onClick={() => openUpgradeWith(cycle)}>
      {children}
    </button>
  );
}

export function PricingPlans() {
  const { account, isPro, openUpgradeWith } = useAccount();
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const yearly = cycle === "yearly";

  useEffect(() => {
    trackAppEvent("pricing_viewed", null, { oncePerDay: "default" });
  }, []);

  return (
    <div className="pr-plans">
      <div className="pr-cycle" role="tablist" aria-label="Billing cycle">
        <button
          type="button"
          role="tab"
          aria-selected={!yearly}
          className={!yearly ? "is-active" : undefined}
          onClick={() => setCycle("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={yearly}
          className={yearly ? "is-active" : undefined}
          onClick={() => setCycle("yearly")}
        >
          Yearly <span className="pr-save">save {SAVE_PERCENT}%</span>
        </button>
      </div>

      <section className="pr-grid" aria-label="Plans">
        <article className="pr-card">
          <header className="pr-card-head">
            <h2>Free</h2>
            <p>For trying ideas and small launches</p>
          </header>
          <p className="pr-price">
            <strong>$0</strong>
            <span>forever</span>
          </p>
          <p className="pr-price-note">No card. Search without an account.</p>
          <Link href="/" className="pr-btn pr-btn--ghost">
            Start free <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <p className="pr-list-label">Includes</p>
          <ul className="pr-features">
            {FREE_FEATURES.map((feature) => (
              <li key={feature}>
                <Check size={15} aria-hidden="true" /> {feature}
              </li>
            ))}
          </ul>
        </article>

        <article className="pr-card pr-card--pro">
          <span className="pr-badge">
            <Sparkles size={12} aria-hidden="true" />
            {yearly ? `${Math.round(YEARLY_SAVING / PRO_MONTHLY_USD)} months free` : "Recommended"}
          </span>
          <header className="pr-card-head">
            <h2>Pro</h2>
            <p>For indie developers who work on keywords every week</p>
          </header>
          <p className="pr-price">
            <strong>${yearly ? YEARLY_PER_MONTH : PRO_MONTHLY_USD}</strong>
            <span>/month</span>
          </p>
          <p className="pr-price-note">
            {yearly ? (
              <>
                ${PRO_YEARLY_USD} billed yearly · you save ${YEARLY_SAVING}
              </>
            ) : (
              <>Billed monthly · yearly saves {SAVE_PERCENT}%</>
            )}
          </p>
          {isPro ? (
            <span className="pr-btn pr-btn--light is-current">
              <Check size={15} aria-hidden="true" /> You&apos;re on Pro
            </span>
          ) : (
            <button type="button" className="pr-btn pr-btn--light" onClick={() => openUpgradeWith(cycle)}>
              <Sparkles size={15} aria-hidden="true" />
              {account.user ? "Upgrade to Pro" : "Get Pro"}
            </button>
          )}
          <p className="pr-secure">
            <Lock size={12} aria-hidden="true" /> Secure checkout by Paddle · cancel anytime
          </p>
          <p className="pr-list-label">Everything in Free, plus</p>
          <ul className="pr-features">
            {PRO_FEATURES.map((feature) => (
              <li key={feature}>
                <Check size={15} aria-hidden="true" /> {feature}
              </li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  );
}
