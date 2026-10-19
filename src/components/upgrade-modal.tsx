"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarRange,
  Check,
  Cloud,
  Infinity as InfinityIcon,
  LayoutGrid,
  LineChart,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

import { useModalFocus } from "@/components/use-modal-focus";
import type { AccountUser } from "@/lib/account";
import { trackAppEvent } from "@/lib/analytics-client";
import { openProCheckout, PADDLE_CHECKOUT_CLOSED_EVENT, proPriceIds } from "@/lib/paddle-client";
import {
  PRO_MONTHLY_USD,
  PRO_YEARLY_MONTHS_FREE,
  PRO_YEARLY_PER_MONTH_USD,
  PRO_YEARLY_USD,
  REFUND_WINDOW_DAYS,
} from "@/lib/plan";
import {
  GUEST_UPGRADE_NOTE,
  orderedProFeatures,
  PRO_FEATURE_LABELS,
  upgradeCopy,
  type BillingCycle,
  type PendingUpgrade,
  type ProFeatureId,
  type UpgradeReason,
} from "@/lib/upgrade";

const FEATURE_ICONS: Record<ProFeatureId, LucideIcon> = {
  checks: InfinityIcon,
  history: CalendarRange,
  apps: LayoutGrid,
  ranks: LineChart,
  sync: Cloud,
  email: Mail,
  assistant: Bot,
};

/** Decorative climbing line: the brand idea, drawn behind the hero copy. */
function ClimbArt() {
  return (
    <svg className="upgrade-art" viewBox="0 0 320 120" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="upgrade-art-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 104 C 34 100, 52 92, 78 90 S 120 72, 150 70 S 196 48, 226 40 S 284 14, 320 8 L 320 120 L 0 120 Z"
        fill="url(#upgrade-art-fill)"
      />
      <path
        d="M0 104 C 34 100, 52 92, 78 90 S 120 72, 150 70 S 196 48, 226 40 S 284 14, 320 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="320" cy="8" r="5" fill="currentColor" />
    </svg>
  );
}

export function UpgradeModal({
  open,
  initialCycle = "yearly",
  reason = "default",
  user,
  onClose,
  onRequireAuth,
}: {
  open: boolean;
  initialCycle?: BillingCycle;
  reason?: UpgradeReason;
  user: AccountUser | null;
  onClose: () => void;
  /** Guests sign in first; the pending choice comes back after sign-in. */
  onRequireAuth: (pending: PendingUpgrade) => void;
}) {
  const eyebrowId = useId();
  const titleId = useId();
  const bodyId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, modalRef);
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setCycle(initialCycle);
      setError(null);
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialCycle]);

  // Closing the Paddle overlay without paying hands control back to the dialog.
  useEffect(() => {
    if (!open) return;
    const onClosed = () => setBusy(false);
    window.addEventListener(PADDLE_CHECKOUT_CLOSED_EVENT, onClosed);
    return () => window.removeEventListener(PADDLE_CHECKOUT_CLOSED_EVENT, onClosed);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Keep the page behind the dialog still while it is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const copy = upgradeCopy(reason);
  const features = orderedProFeatures(reason);
  const prices = proPriceIds();
  const yearly = cycle === "yearly";
  const priceLabel = yearly ? `$${PRO_YEARLY_USD}/year` : `$${PRO_MONTHLY_USD}/month`;

  const startCheckout = async () => {
    if (busy) return;
    const priceId = prices[cycle];
    if (!priceId) {
      setError("Checkout is still being configured. Check back shortly.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await openProCheckout({
      priceId,
      email: user?.email ?? null,
      userId: user?.id ?? null,
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? "Checkout failed to load.");
      return;
    }
    trackAppEvent("checkout_opened", { cycle, reason }, { oncePerDay: cycle });
    // On success the Paddle overlay takes over; leave busy state as-is.
  };

  return (
    <div className="upgrade-backdrop" role="presentation" onClick={onClose}>
      <div
        className="upgrade-dialog"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${eyebrowId} ${titleId}`}
        aria-describedby={bodyId}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="upgrade-close" onClick={onClose} aria-label="Close upgrade dialog">
          <X size={18} aria-hidden="true" />
        </button>

        <section className="upgrade-hero">
          <ClimbArt />
          <p className="upgrade-eyebrow" id={eyebrowId}>
            <Sparkles size={13} aria-hidden="true" /> Upgrade to Pro
          </p>
          <h2 id={titleId}>{copy.headline}</h2>
          <p className="upgrade-lede" id={bodyId}>
            {copy.body}
          </p>

          <div className="upgrade-compare">
            <span className="upgrade-compare-label">{copy.compare.label}</span>
            <div className="upgrade-compare-row is-free">
              <span>Free</span>
              <i aria-hidden="true">
                <b style={{ width: `${Math.round(copy.compare.freeShare * 100)}%` }} />
              </i>
              <strong>{copy.compare.free}</strong>
            </div>
            <div className="upgrade-compare-row is-pro">
              <span>Pro</span>
              <i aria-hidden="true">
                <b />
              </i>
              <strong>{copy.compare.pro}</strong>
            </div>
          </div>

          <div className="upgrade-guarantee">
            <ShieldCheck size={20} aria-hidden="true" />
            <p>
              <strong>{REFUND_WINDOW_DAYS}-day money-back guarantee</strong>
              <span>Full refund of any payment within {REFUND_WINDOW_DAYS} days. No questions asked.</span>
            </p>
          </div>
        </section>

        <section className="upgrade-panel" aria-label="Choose a plan">
          <p className="upgrade-list-label upgrade-panel-title">Choose your plan</p>
          <div className="upgrade-plans" role="radiogroup" aria-label="Billing cycle">
            <label className={`upgrade-plan${yearly ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="upgrade-cycle"
                value="yearly"
                checked={yearly}
                onChange={() => setCycle("yearly")}
                aria-label={`Yearly — $${PRO_YEARLY_USD} a year, $${PRO_YEARLY_PER_MONTH_USD} a month, ${PRO_YEARLY_MONTHS_FREE} months free`}
              />
              <span className="upgrade-plan-radio" aria-hidden="true" />
              <span className="upgrade-plan-main">
                <strong>
                  Yearly <em>{PRO_YEARLY_MONTHS_FREE} months free</em>
                </strong>
                <small>${PRO_YEARLY_USD} billed once a year</small>
              </span>
              <span className="upgrade-plan-price">
                <strong>${PRO_YEARLY_PER_MONTH_USD}</strong>
                <small>/month</small>
              </span>
            </label>

            <label className={`upgrade-plan${!yearly ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="upgrade-cycle"
                value="monthly"
                checked={!yearly}
                onChange={() => setCycle("monthly")}
                aria-label={`Monthly — $${PRO_MONTHLY_USD} a month`}
              />
              <span className="upgrade-plan-radio" aria-hidden="true" />
              <span className="upgrade-plan-main">
                <strong>Monthly</strong>
                <small>Billed monthly · cancel anytime</small>
              </span>
              <span className="upgrade-plan-price">
                <strong>${PRO_MONTHLY_USD}</strong>
                <small>/month</small>
              </span>
            </label>
          </div>

          <p className="upgrade-list-label">Everything in Pro</p>
          <ul className="upgrade-features">
            {features.map((id, index) => {
              const Icon = FEATURE_ICONS[id];
              return (
                <li key={id} className={index === 0 ? "is-lead" : undefined}>
                  <span className="upgrade-feature-icon" aria-hidden="true">
                    <Icon size={15} />
                  </span>
                  {PRO_FEATURE_LABELS[id]}
                  {index === 0 && <Check className="upgrade-feature-check" size={14} aria-hidden="true" />}
                </li>
              );
            })}
          </ul>

          <div className="upgrade-action">
            {user ? (
              <button
                type="button"
                className="upgrade-cta"
                onClick={() => void startCheckout()}
                // Keep the button clickable even when checkout isn't configured yet:
                // the startCheckout handler surfaces an honest "still being
                // configured" error instead of leaving a mysteriously disabled CTA.
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Loader2 className="spin" size={17} aria-hidden="true" /> Opening secure checkout…
                  </>
                ) : (
                  <>
                    Get Pro — {priceLabel} <ArrowRight size={17} aria-hidden="true" />
                  </>
                )}
              </button>
            ) : (
              <>
                <button type="button" className="upgrade-cta" onClick={() => onRequireAuth({ cycle, reason })}>
                  Sign in &amp; get Pro — {priceLabel} <ArrowRight size={17} aria-hidden="true" />
                </button>
                <p className="upgrade-guest-note">{GUEST_UPGRADE_NOTE}</p>
              </>
            )}

            {error && (
              <div className="keyword-error" role="alert">
                {error}
              </div>
            )}

            <p className="upgrade-fineprint">
              <Lock size={12} aria-hidden="true" /> Secure checkout by Paddle · Cancel anytime · Prices in USD, local
              tax may apply
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
