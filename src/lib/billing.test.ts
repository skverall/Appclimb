import { beforeAll, describe, expect, it } from "vitest";

import { upsertUser } from "@/lib/auth";
import { resolveSubscriptionOwner, upsertSubscription } from "@/lib/billing";
import { getSubscription } from "@/lib/entitlement";
import type { PaddleSubscriptionInfo } from "@/lib/paddle";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadMigrationSql } from "../../tests/helpers/migration";

let db: FakeD1;

beforeAll(async () => {
  db = await createTestDb(loadMigrationSql());
});

function info(overrides: Partial<PaddleSubscriptionInfo> = {}): PaddleSubscriptionInfo {
  return {
    subscriptionId: "sub_1",
    customerId: "ctm_1",
    status: "active",
    priceId: "pri_monthly",
    currentPeriodEnd: "2026-09-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    userId: null,
    ...overrides,
  };
}

describe("resolveSubscriptionOwner", () => {
  it("prefers a valid user_id from custom_data", async () => {
    const user = await upsertUser(db, { email: "owner1@example.com" });
    const owner = await resolveSubscriptionOwner(db, info({ userId: user.id }));
    expect(owner).toBe(user.id);
  });

  it("ignores a custom_data user_id that does not exist, falling back to stored row", async () => {
    const user = await upsertUser(db, { email: "owner2@example.com" });
    await upsertSubscription(db, user.id, info({ subscriptionId: "sub_fallback" }), "pro");
    const owner = await resolveSubscriptionOwner(
      db,
      info({ subscriptionId: "sub_fallback", userId: "ghost-user" }),
    );
    expect(owner).toBe(user.id);
  });

  it("returns null when neither custom_data nor a stored row resolves", async () => {
    expect(await resolveSubscriptionOwner(db, info({ subscriptionId: "sub_unknown" }))).toBeNull();
  });
});

describe("upsertSubscription", () => {
  it("inserts a new subscription row", async () => {
    const user = await upsertUser(db, { email: "sub-insert@example.com" });
    await upsertSubscription(db, user.id, info({ subscriptionId: "sub_ins" }), "pro");
    const sub = await getSubscription(db, user.id);
    expect(sub?.paddle_subscription_id).toBe("sub_ins");
    expect(sub?.plan).toBe("pro");
    expect(sub?.status).toBe("active");
    expect(sub?.cancel_at_period_end).toBe(0);
    expect(sub?.current_period_end).toBe("2026-09-01T00:00:00.000Z");
  });

  it("updates the same user's row on replay (idempotent)", async () => {
    const user = await upsertUser(db, { email: "sub-update@example.com" });
    await upsertSubscription(db, user.id, info({ subscriptionId: "sub_a", status: "active" }), "pro");
    await upsertSubscription(
      db,
      user.id,
      info({ subscriptionId: "sub_a", status: "canceled", cancelAtPeriodEnd: true }),
      "pro",
    );
    const sub = await getSubscription(db, user.id);
    expect(sub?.status).toBe("canceled");
    expect(sub?.cancel_at_period_end).toBe(1);
  });

  it("stores empty strings as null for optional paddle ids", async () => {
    const user = await upsertUser(db, { email: "sub-null@example.com" });
    await upsertSubscription(db, user.id, info({ subscriptionId: "", customerId: "" }), "free");
    const sub = await getSubscription(db, user.id);
    expect(sub?.paddle_customer_id).toBeNull();
    expect(sub?.plan).toBe("free");
  });
});
