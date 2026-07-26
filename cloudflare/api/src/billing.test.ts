import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  checkoutBindingHash,
  parseSubscriptionUpdate,
  redactCheckoutBinding,
  verifyPaddleSignature,
} from "./billing";

const subscription = {
  id: "sub_1",
  customer_id: "ctm_1",
  transaction_id: "txn_1",
  status: "active",
  custom_data: {
    product: "appclimb-pro",
    workspace_id: "workspace-1",
    checkout_binding:
      "acb_0123456789012345678901234567890123456789012",
  },
  items: [
    { price: { id: "pri_monthly", product_id: "pro_appclimb" } },
  ],
  current_billing_period: { ends_at: "2026-08-25T12:00:00Z" },
};

describe("Cloudflare Paddle billing", () => {
  it("accepts only the configured product and price", () => {
    const accepted = parseSubscriptionUpdate(
      subscription,
      "pro_appclimb",
      "appclimb-pro",
      new Set(["pri_monthly"]),
    );
    expect(accepted.ignoredReason).toBe("");
    expect(accepted.update).toMatchObject({
      subscriptionId: "sub_1",
      customerId: "ctm_1",
      customWorkspaceId: "workspace-1",
      priceId: "pri_monthly",
      entitlementEndsAt: "2026-08-25T12:00:00.000Z",
    });

    const rejected = parseSubscriptionUpdate(
      subscription,
      "pro_appclimb",
      "appclimb-pro",
      new Set(["pri_yearly"]),
    );
    expect(rejected).toEqual({
      update: null,
      ignoredReason: "product_not_allowed",
    });
  });

  it("verifies Paddle's timestamped HMAC and rejects tampering", async () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    const body = '{"event_id":"evt_1"}';
    const timestamp = Math.floor(now.getTime() / 1000).toString();
    const signature = createHmac("sha256", "pdl_secret")
      .update(`${timestamp}:${body}`)
      .digest("hex");
    const header = `ts=${timestamp};h1=${signature}`;
    await expect(
      verifyPaddleSignature(body, header, "pdl_secret", now),
    ).resolves.toBe(true);
    await expect(
      verifyPaddleSignature(
        '{"event_id":"tampered"}',
        header,
        "pdl_secret",
        now,
      ),
    ).resolves.toBe(false);
  });

  it("redacts the one-time token and validates its opaque format", async () => {
    const raw =
      "acb_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    await expect(checkoutBindingHash(raw)).resolves.toHaveLength(32);
    await expect(checkoutBindingHash("workspace-1")).rejects.toThrow(
      "checkout_binding_invalid",
    );
    const stored = redactCheckoutBinding({
      event_id: "evt_1",
      data: subscription,
    });
    expect(stored).not.toContain("checkout_binding");
    expect(stored).not.toContain("acb_");
  });
});
