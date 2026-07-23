"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { Check, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

import { BILLING_PLANS } from "@/lib/billing";

type BillingInterval = keyof typeof BILLING_PLANS;

let paddlePromise: Promise<Paddle | undefined> | null = null;

function getPaddle() {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const environment = process.env.NEXT_PUBLIC_PADDLE_ENV;

  if (!token || (environment !== "sandbox" && environment !== "production")) {
    return null;
  }

  paddlePromise ??= initializePaddle({
    token,
    environment,
  });

  return paddlePromise;
}

export function PlanCheckout({
  workspaceId,
  customerEmail,
}: {
  workspaceId?: string;
  customerEmail?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] =
    useState<BillingInterval>("yearly");
  const [paddle, setPaddle] = useState<Paddle>();
  const [checkoutState, setCheckoutState] = useState<
    "idle" | "loading" | "error"
  >("idle");

  useEffect(() => {
    const pendingPaddle = getPaddle();
    if (!pendingPaddle) {
      return;
    }

    pendingPaddle.then((instance) => {
      if (instance) {
        setPaddle(instance);
      }
    });
  }, []);

  const launchCheckout = () => {
    const plan = BILLING_PLANS[selectedPlan];

    if (!paddle || !plan.paddlePriceId) {
      setCheckoutState("error");
      return;
    }

    setCheckoutState("loading");
    paddle.Checkout.open({
      items: [{ priceId: plan.paddlePriceId, quantity: 1 }],
      customData: {
        plan: selectedPlan,
        product: "appclimb-pro",
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
      },
      ...(customerEmail ? { customer: { email: customerEmail } } : {}),
      settings: {
        variant: "one-page",
        theme: "light",
        successUrl: `${window.location.origin}/checkout/success`,
      },
    });
    setCheckoutState("idle");
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Choose plan
      </button>

      {open && (
        <div
          className="billing-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setOpen(false);
            }
          }}
        >
          <section
            className="billing-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="billing-title"
          >
            <button
              className="billing-close"
              type="button"
              aria-label="Close plan chooser"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>

            <span className="eyebrow">AppClimb Pro</span>
            <h2 id="billing-title">Keep your growth map running</h2>
            <p className="billing-intro">
              Keep all sources synced, retain 90 days of history and turn every
              confirmed bottleneck into an experiment.
            </p>

            <div className="billing-options">
              <button
                className={
                  selectedPlan === "monthly"
                    ? "billing-option selected"
                    : "billing-option"
                }
                type="button"
                onClick={() => setSelectedPlan("monthly")}
                aria-pressed={selectedPlan === "monthly"}
              >
                <span>
                  <strong>Monthly</strong>
                  <small>Flexible billing</small>
                </span>
                <span className="billing-price">
                  <strong>$12.99</strong>
                  <small>/month</small>
                </span>
              </button>

              <button
                className={
                  selectedPlan === "yearly"
                    ? "billing-option selected"
                    : "billing-option"
                }
                type="button"
                onClick={() => setSelectedPlan("yearly")}
                aria-pressed={selectedPlan === "yearly"}
              >
                <span>
                  <span className="billing-save">Save 17%</span>
                  <strong>Yearly</strong>
                  <small>$10.75/month equivalent</small>
                </span>
                <span className="billing-price">
                  <strong>$129</strong>
                  <small>/year</small>
                </span>
              </button>
            </div>

            <ul className="billing-benefits">
              <li>
                <Check size={15} /> Four read-only data connectors
              </li>
              <li>
                <Check size={15} /> Evidence-backed diagnosis and Growth Replay
              </li>
              <li>
                <Check size={15} /> Read-only by design
              </li>
            </ul>

            {checkoutState === "error" && (
              <p className="billing-error" role="alert">
                Checkout is not configured for this environment yet.
              </p>
            )}

            <button
              className="billing-checkout-button"
              type="button"
              onClick={launchCheckout}
              disabled={checkoutState === "loading"}
            >
              {checkoutState === "loading" ? (
                <>
                  <LoaderCircle className="spin" size={17} /> Opening secure
                  checkout…
                </>
              ) : (
                <>Continue with {BILLING_PLANS[selectedPlan].label}</>
              )}
            </button>

            <p className="billing-secure">
              <ShieldCheck size={14} />
              Secure checkout and tax handling by Paddle
            </p>
          </section>
        </div>
      )}
    </>
  );
}
