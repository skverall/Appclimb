/**
 * Server-only Paddle Billing helpers (ADR 0004): webhook signature
 * verification, event parsing, and a thin REST client. Paddle is the merchant
 * of record; we only mirror subscription state into D1 via the signed webhook.
 *
 * Signature algorithm matches Paddle's official SDKs: the signed message is
 * `${ts}:${rawBody}` HMAC-SHA256'd with the notification secret, hex-encoded,
 * and compared in constant time against the `h1` field of the
 * `Paddle-Signature` header (`ts=…;h1=…`).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PADDLE_WEBHOOK_SECRET_ENV = "PADDLE_WEBHOOK_SECRET";
export const PADDLE_API_KEY_ENV = "PADDLE_API_KEY";

const LIVE_API_BASE = "https://api.paddle.com";
const SANDBOX_API_BASE = "https://sandbox-api.paddle.com";
const API_TIMEOUT_MS = 20_000;

export interface PaddleConfig {
  apiKey: string;
  webhookSecret: string;
  apiBase: string;
  /** Price ids that map to the Pro plan; empty means "any subscription". */
  proPriceIds: string[];
}

export function readPaddleConfig(): PaddleConfig | null {
  const apiKey = process.env[PADDLE_API_KEY_ENV]?.trim();
  const webhookSecret = process.env[PADDLE_WEBHOOK_SECRET_ENV]?.trim();
  if (!apiKey || !webhookSecret) return null;
  const sandbox = process.env.PADDLE_ENVIRONMENT === "sandbox";
  const proPriceIds = (process.env.PADDLE_PRO_PRICE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    apiKey,
    webhookSecret,
    apiBase: sandbox ? SANDBOX_API_BASE : LIVE_API_BASE,
    proPriceIds,
  };
}

interface ParsedSignature {
  timestamp: number;
  hashes: string[];
}

/** Parse a `Paddle-Signature` header value (`ts=…;h1=…`). */
export function parsePaddleSignature(header: string): ParsedSignature | null {
  let timestamp = 0;
  const hashes: string[] = [];
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) return null;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key === "ts") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return null;
      timestamp = parsed;
    } else if (key === "h1") {
      hashes.push(value);
    } else {
      return null;
    }
  }
  if (!timestamp || hashes.length === 0) return null;
  return { timestamp, hashes };
}

/** Verify a webhook signature. Returns false on any mismatch or malformed input. */
export function verifyPaddleWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!rawBody || !signatureHeader || !secret) return false;
  const parsed = parsePaddleSignature(signatureHeader);
  if (!parsed) return false;

  const message = `${parsed.timestamp}:${rawBody}`;
  const expected = createHmac("sha256", secret).update(message, "utf8").digest("hex");

  return parsed.hashes.some((candidate) => safeEqualHex(expected, candidate));
}

function safeEqualHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export interface PaddleWebhookEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

/** Parse and minimally validate a webhook event body. */
export function parsePaddleEvent(rawBody: string): PaddleWebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as Partial<PaddleWebhookEvent>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.event_type !== "string" || typeof parsed.event_id !== "string") return null;
    if (!parsed.data || typeof parsed.data !== "object") return null;
    return {
      event_id: parsed.event_id,
      event_type: parsed.event_type,
      occurred_at: typeof parsed.occurred_at === "string" ? parsed.occurred_at : "",
      data: parsed.data,
    };
  } catch {
    return null;
  }
}

export interface PaddleSubscriptionInfo {
  subscriptionId: string;
  customerId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** User id passed through checkout `custom_data`, when present. */
  userId: string | null;
}

/** Normalize a subscription object from a webhook `data` payload. */
export function extractSubscriptionInfo(data: Record<string, unknown>): PaddleSubscriptionInfo | null {
  if (!data || typeof data !== "object") return null;
  const subscriptionId = typeof data.id === "string" ? data.id : "";
  if (!subscriptionId) return null;
  const customerId = typeof data.customer_id === "string" ? data.customer_id : "";
  const status = typeof data.status === "string" ? data.status : "";

  let priceId: string | null = null;
  const items = data.items;
  if (Array.isArray(items) && items.length > 0) {
    const first = items[0] as { price_id?: unknown };
    if (first && typeof first.price_id === "string") priceId = first.price_id;
  }

  let currentPeriodEnd: string | null = null;
  const period = data.current_billing_period as { ends_at?: unknown } | undefined;
  if (period && typeof period.ends_at === "string") currentPeriodEnd = period.ends_at;

  const scheduledChange = data.scheduled_change as { action?: unknown } | undefined;
  const cancelAtPeriodEnd = scheduledChange?.action === "cancel";

  const customData = data.custom_data as { user_id?: unknown } | undefined;
  const userId =
    customData && typeof customData.user_id === "string" ? customData.user_id : null;

  return {
    subscriptionId,
    customerId,
    status,
    priceId,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    userId,
  };
}

/** Decide whether a price id belongs to the Pro plan. */
export function isProPrice(config: PaddleConfig, priceId: string | null): boolean {
  if (config.proPriceIds.length === 0) return true; // single-product setup
  return priceId !== null && config.proPriceIds.includes(priceId);
}

export interface PaddleApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/** Minimal authenticated GET against the Paddle REST API. */
export async function paddleGet<T = unknown>(
  config: PaddleConfig,
  path: string,
): Promise<PaddleApiResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`${config.apiBase}${path}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, data: null, error: text.slice(0, 500) };
    }
    const parsed = JSON.parse(text) as { data?: T };
    return { ok: true, status: res.status, data: (parsed.data ?? null) as T | null };
  } catch (error) {
    return { ok: false, status: 502, data: null, error: error instanceof Error ? error.message : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}
