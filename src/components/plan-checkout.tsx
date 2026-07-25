"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { Check, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BILLING_PLANS } from "@/lib/billing";
import { trackWebConversion } from "@/lib/browser-analytics";
import { ModalDialog } from "@/components/modal-dialog";

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
  }).catch((error) => {
    paddlePromise = null;
    throw error;
  });

  return paddlePromise;
}

export function PlanCheckout({
  workspaceId,
  customerEmail,
  triggerClassName,
  triggerLabel,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  workspaceId?: string;
  customerEmail?: string;
  triggerClassName?: string;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const canCheckout = Boolean(workspaceId && customerEmail);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (nextOpen: boolean) => {
    setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const [selectedPlan, setSelectedPlan] =
    useState<BillingInterval>("yearly");
  const [paddle, setPaddle] = useState<Paddle>();
  const [checkoutState, setCheckoutState] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const checkoutAbort = useRef<AbortController | null>(null);
  const launchGeneration = useRef(0);

  useEffect(() => {
    if (!canCheckout) {
      return;
    }
    const pendingPaddle = getPaddle();
    if (!pendingPaddle) {
      return;
    }

    pendingPaddle
      .then((instance) => {
        if (instance) {
          setPaddle(instance);
        }
      })
      .catch(() => {
        setCheckoutState("error");
      });
  }, [canCheckout]);

  useEffect(() => {
    if (open) return;
    launchGeneration.current += 1;
    checkoutAbort.current?.abort();
  }, [open]);

  const launchCheckout = async () => {
    if (!workspaceId || !customerEmail) {
      window.location.assign("/login");
      return;
    }
    const plan = BILLING_PLANS[selectedPlan];

    setCheckoutState("loading");
    checkoutAbort.current?.abort();
    const controller = new AbortController();
    checkoutAbort.current = controller;
    const generation = ++launchGeneration.current;
    const canceled = () =>
      controller.signal.aborted || generation !== launchGeneration.current;
    try {
      const checkout = paddle ?? (await getPaddle());
      if (canceled()) return;
      if (!checkout || !plan.paddlePriceId) {
        throw new Error("checkout_unavailable");
      }
      if (!paddle) {
        setPaddle(checkout);
      }

      const bindingResponse = await fetch("/api/billing/checkout-binding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ priceId: plan.paddlePriceId }),
        signal: controller.signal,
      });
      if (canceled()) return;
      if (!bindingResponse.ok) {
        throw new Error("checkout_binding_failed");
      }
      const bindingPayload = (await bindingResponse.json()) as {
        data?: {
          checkoutBinding?: string;
          priceId?: string;
        };
      };
      const checkoutBinding = bindingPayload.data?.checkoutBinding;
      if (canceled()) return;
      if (
        !checkoutBinding ||
        bindingPayload.data?.priceId !== plan.paddlePriceId
      ) {
        throw new Error("checkout_binding_invalid");
      }

      checkout.Checkout.open({
        items: [{ priceId: plan.paddlePriceId, quantity: 1 }],
        customData: {
          product: "appclimb-pro",
          workspace_id: workspaceId,
          checkout_binding: checkoutBinding,
        },
        customer: { email: customerEmail },
        settings: {
          variant: "one-page",
          theme: "light",
          successUrl: `${window.location.origin}/checkout/success`,
        },
      });
      if (canceled()) {
        checkout.Checkout.close();
        return;
      }
      trackWebConversion("checkout_started");
      setOpen(false);
      setCheckoutState("idle");
    } catch {
      if (canceled()) return;
      setCheckoutState("error");
    }
  };

  return (
    <>
      {!hideTrigger && (
        <button
          className={triggerClassName}
          type="button"
          onClick={() => {
            if (!canCheckout) {
              window.location.assign("/login");
              return;
            }
            setCheckoutState("idle");
            setOpen(true);
          }}
        >
          {canCheckout
            ? (triggerLabel ?? "Choose plan")
            : "Start private workspace"}
        </button>
      )}

      {open && (
        <ModalDialog
          labelledBy="billing-title"
          onClose={() => {
            launchGeneration.current += 1;
            checkoutAbort.current?.abort();
            setCheckoutState("idle");
            setOpen(false);
          }}
          backdropClassName="billing-backdrop"
          dialogClassName="billing-dialog"
          closeClassName="billing-close"
          closeLabel="Close plan chooser"
        >
          <span className="eyebrow">AppClimb Pro</span>
          <h2 id="billing-title">Keep your growth map running</h2>
          <p className="billing-intro">
            Continue your private read-only workspace. Live connector
            coverage is expanding during the current private beta.
          </p>

          <div className="billing-options">
            <button
              className={
                selectedPlan === "monthly"
                  ? "billing-option selected"
                  : "billing-option"
              }
              type="button"
              disabled={checkoutState === "loading"}
              onClick={() => {
                setSelectedPlan("monthly");
                setCheckoutState("idle");
              }}
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
              disabled={checkoutState === "loading"}
              onClick={() => {
                setSelectedPlan("yearly");
                setCheckoutState("idle");
              }}
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
              <Check size={15} /> Private read-only workspace and source controls
            </li>
            <li>
              <Check size={15} /> Evidence lineage and local draft experiments
            </li>
            <li>
              <Check size={15} /> New connector coverage as it becomes available
            </li>
          </ul>

          {checkoutState === "error" && (
            <p className="billing-error" role="alert">
              Secure checkout could not open. No payment was started; try again
              in a moment.
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
        </ModalDialog>
      )}
    </>
  );
}
