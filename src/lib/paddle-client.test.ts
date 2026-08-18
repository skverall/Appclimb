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
