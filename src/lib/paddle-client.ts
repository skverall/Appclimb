/**
 * Client-side Paddle checkout helpers (ADR 0004). Wraps `@paddle/paddle-js`
 * to open the Pro overlay checkout. All configuration comes from
 * `NEXT_PUBLIC_*` env vars, which are safe to ship to the browser.
 */
import { initializePaddle, type Environments, type Paddle } from "@paddle/paddle-js";

export interface ProPriceIds {
  monthly: string;
  yearly: string;
}

export function paddleEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN);
}

export function paddleEnvironment(): Environments {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
}

export function proPriceIds(): ProPriceIds {
  return {
    monthly: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTHLY ?? "",
    yearly: process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_YEARLY ?? "",
  };
}

let paddlePromise: Promise<Paddle | undefined> | null = null;

function getPaddle(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    paddlePromise = initializePaddle({
      token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "",
      environment: paddleEnvironment(),
    });
  }
  return paddlePromise;
}

export interface OpenCheckoutInput {
  priceId: string;
  email?: string | null;
  /** AppClimb user id, carried through to the webhook via custom_data. */
  userId?: string | null;
}

export async function openProCheckout(input: OpenCheckoutInput): Promise<{ ok: boolean; error?: string }> {
  if (!paddleEnabled() || !input.priceId) {
    return { ok: false, error: "Checkout is not configured yet." };
  }
  try {
    const paddle = await getPaddle();
    if (!paddle) return { ok: false, error: "Checkout failed to load. Try again." };

    paddle.Checkout.open({
      ...(input.email ? { customer: { email: input.email } } : {}),
      items: [{ priceId: input.priceId, quantity: 1 }],
      ...(input.userId ? { customData: { user_id: input.userId } } : {}),
      settings: {
        displayMode: "overlay",
        theme: "light",
        locale: "en",
        successUrl: `${window.location.origin}/?checkout=success`,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "Checkout failed to load. Try again." };
  }
}
