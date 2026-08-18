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
