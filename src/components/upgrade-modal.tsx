"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, LogIn, Sparkles, X } from "lucide-react";

import { useModalFocus } from "@/components/use-modal-focus";
import type { AccountUser } from "@/lib/account";
import { openProCheckout, paddleEnabled, proPriceIds } from "@/lib/paddle-client";
import { PRO_MONTHLY_USD, PRO_YEARLY_USD } from "@/lib/plan";

type BillingCycle = "monthly" | "yearly";

const PRO_FEATURES = [
  "Unlimited keyword checks",
  "Unlimited apps & keywords in My Apps",
  "Cloud sync across devices",
  "90-day history and charts",
  "200 AI assistant messages / day",
  "500 official popularity lookups / day",
];

export function UpgradeModal({
  open,
  user,
  onClose,
  onRequireAuth,
}: {
  open: boolean;
  user: AccountUser | null;
  onClose: () => void;
  onRequireAuth: () => void;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(open, modalRef);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setCycle("monthly");
      setError(null);
      setBusy(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const prices = proPriceIds();
  const configured = paddleEnabled() && Boolean(user ? prices[cycle] : true);

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
    }
    // On success the Paddle overlay takes over; leave busy state as-is.
  };

  return (
    <div className="tracker-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tracker-modal tracker-modal--wide"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tracker-modal-header">
          <div>
            <h2 id={titleId}>
              <Sparkles size={18} aria-hidden="true" /> Upgrade to Pro
            </h2>
            <p>Lift the limits, sync your keywords everywhere.</p>
          </div>
          <button
            type="button"
            className="tracker-icon-button"
            onClick={onClose}
            aria-label="Close upgrade dialog"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="tracker-modal-body upgrade-modal-body">
          <div className="upgrade-cycle-toggle" role="tablist" aria-label="Billing cycle">
            <button
              type="button"
              role="tab"
              aria-selected={cycle === "monthly"}
              className={cycle === "monthly" ? "is-active" : undefined}
              onClick={() => setCycle("monthly")}
            >
              ${PRO_MONTHLY_USD} / month
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={cycle === "yearly"}
              className={cycle === "yearly" ? "is-active" : undefined}
              onClick={() => setCycle("yearly")}
            >
              ${PRO_YEARLY_USD} / year
              <small>≈ ${(PRO_YEARLY_USD / 12).toFixed(2)}/mo · save 33%</small>
            </button>
          </div>

          <ul className="upgrade-features">
            {PRO_FEATURES.map((feature) => (
              <li key={feature}>
                <Check size={15} aria-hidden="true" /> {feature}
              </li>
            ))}
          </ul>

          {user ? (
            <button
              type="button"
              className="tracker-button-primary large upgrade-cta"
              onClick={() => void startCheckout()}
              disabled={busy || !configured}
            >
              {busy ? (
                <Loader2 className="spin" size={16} aria-hidden="true" />
              ) : (
                <Sparkles size={16} aria-hidden="true" />
              )}
              {busy
                ? "Opening checkout…"
                : cycle === "monthly"
                  ? `Upgrade — $${PRO_MONTHLY_USD}/month`
                  : `Upgrade — $${PRO_YEARLY_USD}/year`}
            </button>
          ) : (
            <button
              type="button"
              className="tracker-button-primary large upgrade-cta"
              onClick={onRequireAuth}
            >
              <LogIn size={16} aria-hidden="true" /> Sign in to upgrade
            </button>
          )}

          {error && (
            <div className="keyword-error" role="alert">
              {error}
            </div>
          )}

          <p className="upgrade-footnote">
            Cancel anytime — Pro stays active until the end of the period you
            paid for. Payments are handled securely by Paddle.
          </p>
        </div>
      </div>
    </div>
  );
}
