import { afterEach, describe, expect, it, vi } from "vitest";

import { openProCheckout } from "./paddle-client";

describe("openProCheckout when Paddle is unconfigured", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a clean not-configured error instead of throwing", async () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", undefined);
    const result = await openProCheckout({ priceId: "pri_1", userId: "u1" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });
});

describe("openProCheckout when the SDK fails to load", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@paddle/paddle-js");
    vi.resetModules();
  });

  it("surfaces a clean checkout-failed error when initializePaddle resolves undefined", async () => {
    vi.doMock("@paddle/paddle-js", () => ({
      initializePaddle: async () => undefined,
    }));
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "tok");
    const { openProCheckout: fresh } = await import("./paddle-client");
    const result = await fresh({ priceId: "pri_m", userId: "u1" });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Checkout failed to load/i);
  });
});

describe("Paddle checkout events", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.doUnmock("@paddle/paddle-js");
    vi.resetModules();
  });

  it("announces an unpaid overlay close so the dialog can reset", async () => {
    let callback: ((event: { name?: string }) => void) | undefined;
    const open = vi.fn();
    vi.doMock("@paddle/paddle-js", () => ({
      initializePaddle: async (options: { eventCallback?: (event: { name?: string }) => void }) => {
        callback = options.eventCallback;
        return { Checkout: { open } };
      },
    }));
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "tok");
    const fakeWindow = Object.assign(new EventTarget(), { location: { origin: "https://appclimb.app" } });
    vi.stubGlobal("window", fakeWindow);

    const { openProCheckout: fresh, PADDLE_CHECKOUT_CLOSED_EVENT } = await import("./paddle-client");
    const result = await fresh({ priceId: "pri_y", email: "a@b.co", userId: "u1" });
    expect(result.ok).toBe(true);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ priceId: "pri_y", quantity: 1 }],
        customer: { email: "a@b.co" },
        customData: { user_id: "u1" },
      }),
    );

    const heard = vi.fn();
    fakeWindow.addEventListener(PADDLE_CHECKOUT_CLOSED_EVENT, heard);
    callback?.({ name: "checkout.loaded" });
    expect(heard).not.toHaveBeenCalled();
    callback?.({ name: "checkout.closed" });
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
