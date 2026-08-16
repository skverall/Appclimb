import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  extractSubscriptionInfo,
  isProPrice,
  parsePaddleEvent,
  parsePaddleSignature,
  paddleGet,
  readPaddleConfig,
  verifyPaddleWebhookSignature,
  type PaddleConfig,
} from "@/lib/paddle";

function sign(secret: string, ts: number, body: string): string {
  return createHmac("sha256", secret).update(`${ts}:${body}`, "utf8").digest("hex");
}

describe("readPaddleConfig", () => {
  const orig = { ...process.env };

  afterEach(() => {
    process.env = { ...orig };
  });

  it("returns null without api key or webhook secret", () => {
    delete process.env.PADDLE_API_KEY;
    delete process.env.PADDLE_WEBHOOK_SECRET;
    expect(readPaddleConfig()).toBeNull();
    process.env.PADDLE_API_KEY = "key";
    expect(readPaddleConfig()).toBeNull();
  });

  it("returns live config by default", () => {
    process.env.PADDLE_API_KEY = "key";
    process.env.PADDLE_WEBHOOK_SECRET = "secret";
    delete process.env.PADDLE_ENVIRONMENT;
    const cfg = readPaddleConfig();
    expect(cfg?.apiBase).toBe("https://api.paddle.com");
    expect(cfg?.proPriceIds).toEqual([]);
  });

  it("returns sandbox base and parsed price ids when configured", () => {
    process.env.PADDLE_API_KEY = "key";
    process.env.PADDLE_WEBHOOK_SECRET = "secret";
    process.env.PADDLE_ENVIRONMENT = "sandbox";
    process.env.PADDLE_PRO_PRICE_IDS = "pri_a, pri_b ,";
    const cfg = readPaddleConfig();
    expect(cfg?.apiBase).toBe("https://sandbox-api.paddle.com");
    expect(cfg?.proPriceIds).toEqual(["pri_a", "pri_b"]);
  });
});

describe("parsePaddleSignature", () => {
  it("parses ts and h1", () => {
    expect(parsePaddleSignature("ts=123;h1=abc")).toEqual({ timestamp: 123, hashes: ["abc"] });
  });

  it("collects multiple h1 values", () => {
    expect(parsePaddleSignature("ts=5;h1=a;h1=b")).toEqual({ timestamp: 5, hashes: ["a", "b"] });
  });

  it("rejects malformed headers", () => {
    expect(parsePaddleSignature("")).toBeNull();
    expect(parsePaddleSignature("ts=abc;h1=x")).toBeNull();
    expect(parsePaddleSignature("h1=x")).toBeNull();
    expect(parsePaddleSignature("ts=1")).toBeNull();
    expect(parsePaddleSignature("ts=1;zz=x")).toBeNull();
    expect(parsePaddleSignature("noseparator")).toBeNull();
  });
});

describe("verifyPaddleWebhookSignature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ event_type: "subscription.created", data: {} });

  it("accepts a valid signature", () => {
    const ts = 1_700_000_000;
    const header = `ts=${ts};h1=${sign(secret, ts, body)}`;
    expect(verifyPaddleWebhookSignature(body, header, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const ts = 1_700_000_000;
    const header = `ts=${ts};h1=${sign(secret, ts, body)}`;
    expect(verifyPaddleWebhookSignature(body + "x", header, secret)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const ts = 1_700_000_000;
    const header = `ts=${ts};h1=${sign("other", ts, body)}`;
    expect(verifyPaddleWebhookSignature(body, header, secret)).toBe(false);
  });

  it("accepts when one of several h1 values matches (key rotation)", () => {
    const ts = 1_700_000_000;
    const header = `ts=${ts};h1=deadbeef;h1=${sign(secret, ts, body)}`;
    expect(verifyPaddleWebhookSignature(body, header, secret)).toBe(true);
  });

  it("rejects empty or malformed input", () => {
    expect(verifyPaddleWebhookSignature("", "ts=1;h1=x", secret)).toBe(false);
    expect(verifyPaddleWebhookSignature(body, "", secret)).toBe(false);
    expect(verifyPaddleWebhookSignature(body, "ts=1;h1=x", "")).toBe(false);
    expect(verifyPaddleWebhookSignature(body, "garbage", secret)).toBe(false);
    expect(verifyPaddleWebhookSignature(body, "ts=1;h1=nothex!", secret)).toBe(false);
  });
});

describe("parsePaddleEvent", () => {
  it("parses a valid event", () => {
    const raw = JSON.stringify({
      event_id: "evt_1",
      event_type: "subscription.updated",
      occurred_at: "2026-08-16T00:00:00Z",
      data: { id: "sub_1" },
    });
    const event = parsePaddleEvent(raw);
    expect(event?.event_type).toBe("subscription.updated");
    expect(event?.data.id).toBe("sub_1");
  });

  it("rejects invalid payloads", () => {
    expect(parsePaddleEvent("not json")).toBeNull();
    expect(parsePaddleEvent("{}")).toBeNull();
    expect(parsePaddleEvent(JSON.stringify({ event_id: "e", event_type: "t" }))).toBeNull();
    expect(parsePaddleEvent(JSON.stringify({ event_id: "e", event_type: "t", data: "nope" }))).toBeNull();
  });
});

describe("extractSubscriptionInfo", () => {
  it("extracts a full subscription payload", () => {
    const info = extractSubscriptionInfo({
      id: "sub_1",
      customer_id: "ctm_1",
      status: "active",
      items: [{ price_id: "pri_monthly", quantity: 1 }],
      current_billing_period: { starts_at: "2026-08-01", ends_at: "2026-09-01" },
      scheduled_change: { action: "cancel" },
      custom_data: { user_id: "user_1" },
    });
    expect(info).toEqual({
      subscriptionId: "sub_1",
      customerId: "ctm_1",
      status: "active",
      priceId: "pri_monthly",
      currentPeriodEnd: "2026-09-01",
      cancelAtPeriodEnd: true,
      userId: "user_1",
    });
  });

  it("handles missing optional fields", () => {
    const info = extractSubscriptionInfo({ id: "sub_2", status: "canceled" });
    expect(info?.customerId).toBe("");
    expect(info?.priceId).toBeNull();
    expect(info?.currentPeriodEnd).toBeNull();
    expect(info?.cancelAtPeriodEnd).toBe(false);
    expect(info?.userId).toBeNull();
  });

  it("returns null without an id", () => {
    expect(extractSubscriptionInfo({ status: "active" })).toBeNull();
    expect(extractSubscriptionInfo(null as never)).toBeNull();
  });
});

describe("isProPrice", () => {
  const base: PaddleConfig = {
    apiKey: "k",
    webhookSecret: "s",
    apiBase: "https://api.paddle.com",
    proPriceIds: [],
  };

  it("treats any price as pro when no allowlist is set", () => {
    expect(isProPrice(base, "pri_any")).toBe(true);
    expect(isProPrice(base, null)).toBe(true);
  });

  it("checks the allowlist when configured", () => {
    const cfg = { ...base, proPriceIds: ["pri_a"] };
    expect(isProPrice(cfg, "pri_a")).toBe(true);
    expect(isProPrice(cfg, "pri_b")).toBe(false);
    expect(isProPrice(cfg, null)).toBe(false);
  });
});

describe("paddleGet", () => {
  const config: PaddleConfig = {
    apiKey: "k",
    webhookSecret: "s",
    apiBase: "https://api.paddle.com",
    proPriceIds: [],
  };

  afterEach(() => vi.unstubAllGlobals());

  it("returns data on success", async () => {
    type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    const fetchMock = vi.fn<FetchFn>(async () => new Response(JSON.stringify({ data: { id: "sub_1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await paddleGet(config, "/subscriptions/sub_1");
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ id: "sub_1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.paddle.com/subscriptions/sub_1");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("returns an error on failure", async () => {
    type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn<FetchFn>(async () => new Response("nope", { status: 404 })));
    const res = await paddleGet(config, "/subscriptions/missing");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
  });

  it("handles network errors", async () => {
    type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchFn>(async () => {
        throw new Error("down");
      }),
    );
    const res = await paddleGet(config, "/x");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(502);
  });
});
