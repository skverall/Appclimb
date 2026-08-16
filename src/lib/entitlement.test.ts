import { beforeAll, describe, expect, it } from "vitest";

import { upsertUser } from "@/lib/auth";
import { getPlanForUser, getSubscription, planFromSubscription } from "@/lib/entitlement";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadMigrationSql } from "../../tests/helpers/migration";

let db: FakeD1;

beforeAll(async () => {
  db = await createTestDb(loadMigrationSql());
});

async function insertSubscription(userId: string, fields: Record<string, unknown>) {
  await db
    .prepare(
      `INSERT INTO subscriptions
        (user_id, paddle_customer_id, paddle_subscription_id, status, price_id, plan, current_period_end, cancel_at_period_end, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .bind(
      userId,
      fields.paddle_customer_id ?? null,
      fields.paddle_subscription_id ?? null,
      fields.status ?? "free",
      fields.price_id ?? null,
      fields.plan ?? "free",
      fields.current_period_end ?? null,
      fields.cancel_at_period_end ?? 0,
    )
    .run();
}

describe("planFromSubscription", () => {
  it("is free with no subscription", () => {
    expect(planFromSubscription(null)).toBe("free");
  });

  it("is pro for an active pro subscription", () => {
    expect(
      planFromSubscription({
        user_id: "u",
        paddle_customer_id: null,
        paddle_subscription_id: null,
        status: "active",
        price_id: null,
        plan: "pro",
        current_period_end: "2027-01-01T00:00:00.000Z",
        cancel_at_period_end: 0,
        updated_at: "",
      }),
    ).toBe("pro");
  });

  it("is free for a free-plan row even if active", () => {
    expect(
      planFromSubscription({
        user_id: "u",
        paddle_customer_id: null,
        paddle_subscription_id: null,
        status: "active",
        price_id: null,
        plan: "free",
        current_period_end: null,
        cancel_at_period_end: 0,
        updated_at: "",
      }),
    ).toBe("free");
  });
});

describe("subscription reads", () => {
  it("returns null when the user has no subscription", async () => {
    const user = await upsertUser(db, { email: "nosub@example.com" });
    expect(await getSubscription(db, user.id)).toBeNull();
    expect(await getPlanForUser(db, user.id)).toBe("free");
  });

  it("reads an active pro subscription as pro", async () => {
    const user = await upsertUser(db, { email: "pro@example.com" });
    await insertSubscription(user.id, {
      paddle_customer_id: "ctm_1",
      paddle_subscription_id: "sub_1",
      status: "active",
      plan: "pro",
      price_id: "pri_monthly",
      current_period_end: "2027-01-01T00:00:00.000Z",
    });
    const sub = await getSubscription(db, user.id);
    expect(sub?.paddle_subscription_id).toBe("sub_1");
    expect(sub?.plan).toBe("pro");
    expect(await getPlanForUser(db, user.id)).toBe("pro");
  });

  it("reads a canceled-but-unexpired pro subscription as pro", async () => {
    const user = await upsertUser(db, { email: "cancel@example.com" });
    await insertSubscription(user.id, {
      paddle_subscription_id: "sub_2",
      status: "canceled",
      plan: "pro",
      current_period_end: "2099-01-01T00:00:00.000Z",
      cancel_at_period_end: 1,
    });
    expect(await getPlanForUser(db, user.id)).toBe("pro");
  });

  it("reads a paused pro subscription as free", async () => {
    const user = await upsertUser(db, { email: "paused@example.com" });
    await insertSubscription(user.id, {
      paddle_subscription_id: "sub_3",
      status: "paused",
      plan: "pro",
      current_period_end: "2099-01-01T00:00:00.000Z",
    });
    expect(await getPlanForUser(db, user.id)).toBe("free");
  });
});
