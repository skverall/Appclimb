import {
  base64UrlDecode,
  randomToken,
  sha256,
  timingSafeEqual,
} from "./crypto";
import { nowISO, readSecret, requireSecret } from "./runtime";

const checkoutBindingPrefix = "acb_";
const terminalStatuses = new Set(["canceled", "cancelled", "expired"]);
const subscriptionStatuses = new Set([
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
  "expired",
]);

export interface BillingSubscriptionUpdate {
  subscriptionId: string;
  customerId: string;
  transactionId: string;
  customWorkspaceId: string;
  checkoutBinding: string;
  status: string;
  productId: string;
  priceId: string;
  entitlementEndsAt: string | null;
}

interface PaddleBinding {
  workspaceId: string;
  subscriptionId: string;
  customerId: string;
  transactionId: string;
  productId: string;
  status: string;
  lastOccurredAt: string | null;
}

interface CheckoutBinding extends PaddleBinding {
  id: string;
  priceId: string;
  expectedSubscriptionId: string;
  expectedCustomerId: string;
  expectedTransactionId: string;
  expectedStatus: string;
  consumedAt: string | null;
  supersededAt: string | null;
}

export interface BillingEventResult {
  inserted: boolean;
  applied: boolean;
  reconciliationRequired: boolean;
  reason: string;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseSubscriptionUpdate(
  value: unknown,
  productId: string,
  productIdentity: string,
  allowedPriceIds: Set<string>,
): { update: BillingSubscriptionUpdate | null; ignoredReason: string } {
  const data = recordValue(value);
  if (!data) {
    throw new Error("malformed_webhook_event");
  }
  const customData = recordValue(data.custom_data) ?? {};
  const items = Array.isArray(data.items) ? data.items : [];
  const subscriptionId = stringValue(data.id);
  const customerId = stringValue(data.customer_id);
  const transactionId = stringValue(data.transaction_id);
  const status = stringValue(data.status);
  if (
    !subscriptionId ||
    !customerId ||
    !status ||
    !subscriptionStatuses.has(status) ||
    items.length === 0
  ) {
    throw new Error("malformed_webhook_event");
  }
  if (
    !productId ||
    !productIdentity ||
    (stringValue(customData.product) &&
      stringValue(customData.product) !== productIdentity)
  ) {
    return { update: null, ignoredReason: "product_not_allowed" };
  }
  const priceIds = new Set<string>();
  for (const item of items) {
    const price = recordValue(recordValue(item)?.price);
    const itemPriceId = stringValue(price?.id);
    if (
      !price ||
      stringValue(price.product_id) !== productId ||
      !allowedPriceIds.has(itemPriceId)
    ) {
      return { update: null, ignoredReason: "product_not_allowed" };
    }
    priceIds.add(itemPriceId);
  }
  if (priceIds.size !== 1) {
    return { update: null, ignoredReason: "product_not_allowed" };
  }
  const period = recordValue(data.current_billing_period);
  const endsAt = stringValue(period?.ends_at);
  let entitlementEndsAt: string | null = null;
  if (endsAt) {
    const parsed = new Date(endsAt);
    if (!Number.isFinite(parsed.getTime())) {
      throw new Error("malformed_webhook_event");
    }
    entitlementEndsAt = parsed.toISOString();
  }
  return {
    update: {
      subscriptionId,
      customerId,
      transactionId,
      customWorkspaceId: stringValue(customData.workspace_id),
      checkoutBinding: stringValue(customData.checkout_binding),
      status,
      productId,
      priceId: [...priceIds][0],
      entitlementEndsAt,
    },
    ignoredReason: "",
  };
}

export async function verifyPaddleSignature(
  body: string,
  header: string,
  secret: string,
  now = new Date(),
  toleranceMs = 5 * 60 * 1000,
): Promise<boolean> {
  let timestampText = "";
  const signatures: string[] = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") timestampText = value;
    if (key === "h1") signatures.push(value);
  }
  if (!timestampText || signatures.length === 0 || !secret) return false;
  const timestamp = Number(timestampText);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(now.getTime() - timestamp * 1000) > toleranceMs
  ) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestampText}:${body}`),
    ),
  );
  return signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/iu.test(candidate)) return false;
    const bytes = new Uint8Array(candidate.length / 2);
    for (let index = 0; index < candidate.length; index += 2) {
      bytes[index / 2] = Number.parseInt(candidate.slice(index, index + 2), 16);
    }
    return timingSafeEqual(expected, bytes);
  });
}

export async function checkoutBindingHash(raw: string): Promise<Uint8Array> {
  if (!raw.startsWith(checkoutBindingPrefix)) {
    throw new Error("checkout_binding_invalid");
  }
  const encoded = raw.slice(checkoutBindingPrefix.length);
  let decoded: Uint8Array;
  try {
    decoded = base64UrlDecode(encoded);
  } catch {
    throw new Error("checkout_binding_invalid");
  }
  if (decoded.length !== 32) {
    throw new Error("checkout_binding_invalid");
  }
  return sha256(raw);
}

export async function createCheckoutBinding(
  env: Cloudflare.Env,
  workspaceId: string,
  priceId: string,
): Promise<{ checkoutBinding: string; priceId: string; expiresAt: string }> {
  const allowedPrices = new Set(
    requireSecret(env, "PADDLE_ALLOWED_PRICE_IDS")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!allowedPrices.has(priceId)) {
    throw new Error("billing_price_not_allowed");
  }
  const workspace = await env.DB.prepare(
    `SELECT subscription_status,
            COALESCE(paddle_subscription_id,'') AS subscription_id,
            COALESCE(paddle_customer_id,'') AS customer_id,
            COALESCE(paddle_transaction_id,'') AS transaction_id
     FROM workspaces WHERE id = ?`,
  )
    .bind(workspaceId)
    .first<{
      subscription_status: string;
      subscription_id: string;
      customer_id: string;
      transaction_id: string;
    }>();
  if (!workspace) throw new Error("workspace_not_found");
  const hasBinding = Boolean(
    workspace.subscription_id ||
      workspace.customer_id ||
      workspace.transaction_id,
  );
  if (
    hasBinding &&
    !terminalStatuses.has(workspace.subscription_status.toLowerCase())
  ) {
    throw new Error("billing_subscription_exists");
  }
  const checkoutBinding = `${checkoutBindingPrefix}${randomToken(32)}`;
  const tokenHash = await checkoutBindingHash(checkoutBinding);
  const createdAt = nowISO();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE paddle_checkout_bindings SET superseded_at = ?
         WHERE workspace_id = ? AND consumed_at IS NULL AND superseded_at IS NULL`,
      ).bind(createdAt, workspaceId),
      env.DB.prepare(
        `INSERT INTO paddle_checkout_bindings(
           id,workspace_id,token_hash,price_id,expected_subscription_id,
           expected_customer_id,expected_transaction_id,expected_status,
           expires_at,created_at
         ) VALUES(?,?,?,?,NULLIF(?,''),NULLIF(?,''),NULLIF(?,''),?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        workspaceId,
        tokenHash.buffer,
        priceId,
        workspace.subscription_id,
        workspace.customer_id,
        workspace.transaction_id,
        workspace.subscription_status.toLowerCase(),
        expiresAt,
        createdAt,
      ),
    ]);
  } catch {
    throw new Error("checkout_already_pending");
  }
  return { checkoutBinding, priceId, expiresAt };
}

function evaluatePaddleBinding(
  bindings: PaddleBinding[],
  update: BillingSubscriptionUpdate,
  occurredAt: string,
): { binding: PaddleBinding | null; reason: string; apply: boolean } {
  if (bindings.length === 0) return { binding: null, reason: "unbound", apply: false };
  if (bindings.length !== 1) {
    return { binding: null, reason: "binding_conflict", apply: false };
  }
  const binding = bindings[0];
  if (
    (update.customWorkspaceId &&
      update.customWorkspaceId !== binding.workspaceId) ||
    (binding.subscriptionId &&
      binding.subscriptionId !== update.subscriptionId) ||
    (binding.customerId && binding.customerId !== update.customerId) ||
    (binding.productId && binding.productId !== update.productId)
  ) {
    return { binding, reason: "binding_mismatch", apply: false };
  }
  if (
    binding.lastOccurredAt &&
    new Date(occurredAt).getTime() <=
      new Date(binding.lastOccurredAt).getTime()
  ) {
    return { binding, reason: "stale_event", apply: false };
  }
  return { binding, reason: "apply", apply: true };
}

function evaluateCheckoutBinding(
  binding: CheckoutBinding,
  update: BillingSubscriptionUpdate,
  eventId: string,
): { binding: PaddleBinding | null; reason: string; apply: boolean } {
  if (binding.consumedAt) {
    return { binding: null, reason: "checkout_binding_consumed", apply: false };
  }
  if (binding.supersededAt) {
    return { binding: null, reason: "checkout_binding_superseded", apply: false };
  }
  if (
    !eventId ||
    !update.customWorkspaceId ||
    update.customWorkspaceId !== binding.workspaceId ||
    !update.priceId ||
    update.priceId !== binding.priceId
  ) {
    return { binding: null, reason: "checkout_binding_mismatch", apply: false };
  }
  if (
    binding.subscriptionId !== binding.expectedSubscriptionId ||
    binding.customerId !== binding.expectedCustomerId ||
    binding.transactionId !== binding.expectedTransactionId ||
    binding.status !== binding.expectedStatus
  ) {
    return {
      binding: null,
      reason: "checkout_binding_state_changed",
      apply: false,
    };
  }
  if (
    binding.subscriptionId &&
    !terminalStatuses.has(binding.status.toLowerCase())
  ) {
    return {
      binding: null,
      reason: "subscription_already_bound",
      apply: false,
    };
  }
  return { binding, reason: "apply", apply: true };
}

async function markBillingEvent(
  db: D1Database,
  eventId: string,
  status: "applied" | "ignored" | "reconciliation_required",
  reason: string,
  workspaceId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE billing_events SET processing_status = ?,processing_reason = ?,
       workspace_id = NULLIF(?,''),processed_at = ? WHERE paddle_event_id = ?`,
    )
    .bind(status, reason, workspaceId, nowISO(), eventId)
    .run();
}

function bindingFromRow(row: Record<string, unknown>): PaddleBinding {
  return {
    workspaceId: String(row.workspace_id),
    subscriptionId: stringValue(row.subscription_id),
    customerId: stringValue(row.customer_id),
    transactionId: stringValue(row.transaction_id),
    productId: stringValue(row.product_id),
    status: stringValue(row.status),
    lastOccurredAt: stringValue(row.last_occurred_at) || null,
  };
}

export async function recordBillingEvent(
  env: Cloudflare.Env,
  eventId: string,
  eventType: string,
  occurredAt: string,
  payload: string,
  update: BillingSubscriptionUpdate | null,
): Promise<BillingEventResult> {
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO billing_events(
       id,paddle_event_id,event_type,occurred_at,payload,processed_at,
       processing_status
     ) VALUES(?,?,?,?,?,?,'received')`,
  )
    .bind(
      crypto.randomUUID(),
      eventId,
      eventType,
      occurredAt,
      payload,
      nowISO(),
    )
    .run();
  if (!inserted.meta.changes) {
    const previous = await env.DB.prepare(
      `SELECT processing_status FROM billing_events WHERE paddle_event_id = ?`,
    )
      .bind(eventId)
      .first<{ processing_status: string }>();
    if (
      previous &&
      previous.processing_status !== "received" &&
      previous.processing_status !== "reconciliation_required"
    ) {
      return {
        inserted: false,
        applied: false,
        reconciliationRequired: false,
        reason: "duplicate",
      };
    }
  }
  if (!update || !eventType.startsWith("subscription.")) {
    await markBillingEvent(
      env.DB,
      eventId,
      "ignored",
      "event_not_entitlement_bearing",
      "",
    );
    return {
      inserted: Boolean(inserted.meta.changes),
      applied: false,
      reconciliationRequired: false,
      reason: "event_not_entitlement_bearing",
    };
  }
  const rows = await env.DB.prepare(
    `SELECT id AS workspace_id,
            COALESCE(paddle_subscription_id,'') AS subscription_id,
            COALESCE(paddle_customer_id,'') AS customer_id,
            COALESCE(paddle_transaction_id,'') AS transaction_id,
            COALESCE(paddle_product_id,'') AS product_id,
            subscription_status AS status,
            paddle_last_event_occurred_at AS last_occurred_at
     FROM workspaces
     WHERE (? <> '' AND paddle_subscription_id = ?)
        OR (? <> '' AND paddle_customer_id = ?)
        OR (? <> '' AND paddle_transaction_id = ?)`,
  )
    .bind(
      update.subscriptionId,
      update.subscriptionId,
      update.customerId,
      update.customerId,
      update.transactionId,
      update.transactionId,
    )
    .all<Record<string, unknown>>();
  const unique = new Map<string, PaddleBinding>();
  for (const row of rows.results) {
    const binding = bindingFromRow(row);
    unique.set(binding.workspaceId, binding);
  }
  let evaluation = evaluatePaddleBinding(
    [...unique.values()],
    update,
    occurredAt,
  );
  let checkout: CheckoutBinding | null = null;
  if (
    !evaluation.apply &&
    ["unbound", "binding_mismatch"].includes(evaluation.reason) &&
    update.checkoutBinding
  ) {
    try {
      const tokenHash = await checkoutBindingHash(update.checkoutBinding);
      const row = await env.DB.prepare(
        `SELECT cb.id,cb.workspace_id,cb.price_id,cb.consumed_at,cb.superseded_at,
                COALESCE(cb.expected_subscription_id,'') AS expected_subscription_id,
                COALESCE(cb.expected_customer_id,'') AS expected_customer_id,
                COALESCE(cb.expected_transaction_id,'') AS expected_transaction_id,
                cb.expected_status,
                COALESCE(w.paddle_subscription_id,'') AS subscription_id,
                COALESCE(w.paddle_customer_id,'') AS customer_id,
                COALESCE(w.paddle_transaction_id,'') AS transaction_id,
                COALESCE(w.paddle_product_id,'') AS product_id,
                w.subscription_status AS status,
                w.paddle_last_event_occurred_at AS last_occurred_at
         FROM paddle_checkout_bindings cb
         JOIN workspaces w ON w.id = cb.workspace_id
         WHERE cb.token_hash = ?`,
      )
        .bind(tokenHash.buffer)
        .first<Record<string, unknown>>();
      if (!row) {
        evaluation = {
          binding: null,
          reason: "checkout_binding_not_found",
          apply: false,
        };
      } else {
        checkout = {
          ...bindingFromRow(row),
          id: String(row.id),
          priceId: stringValue(row.price_id),
          expectedSubscriptionId: stringValue(row.expected_subscription_id),
          expectedCustomerId: stringValue(row.expected_customer_id),
          expectedTransactionId: stringValue(row.expected_transaction_id),
          expectedStatus: stringValue(row.expected_status),
          consumedAt: stringValue(row.consumed_at) || null,
          supersededAt: stringValue(row.superseded_at) || null,
        };
        evaluation = evaluateCheckoutBinding(checkout, update, eventId);
      }
    } catch {
      evaluation = {
        binding: null,
        reason: "checkout_binding_invalid",
        apply: false,
      };
    }
  }
  if (!evaluation.apply || !evaluation.binding) {
    const workspaceId =
      checkout?.workspaceId ?? evaluation.binding?.workspaceId ?? "";
    const reconciliationRequired =
      Boolean(checkout?.workspaceId) ||
      ["binding_mismatch", "binding_conflict"].includes(evaluation.reason);
    await markBillingEvent(
      env.DB,
      eventId,
      reconciliationRequired ? "reconciliation_required" : "ignored",
      evaluation.reason,
      workspaceId,
    );
    return {
      inserted: Boolean(inserted.meta.changes),
      applied: false,
      reconciliationRequired,
      reason: evaluation.reason,
    };
  }
  const binding = evaluation.binding;
  let updateResult: D1Result<unknown>;
  if (checkout) {
    const [consumeResult, workspaceResult] = await env.DB.batch([
      env.DB.prepare(
        `UPDATE paddle_checkout_bindings
         SET consumed_at = ?,consumed_by_event_id = ?
         WHERE id = ? AND consumed_at IS NULL AND superseded_at IS NULL`,
      ).bind(nowISO(), eventId, checkout.id),
      env.DB.prepare(
        `UPDATE workspaces SET
           paddle_subscription_id = NULLIF(?,''),paddle_customer_id = NULLIF(?,''),
           paddle_transaction_id = NULLIF(?,''),paddle_product_id = ?,
           paddle_price_id = ?,paddle_last_event_occurred_at = ?,
           subscription_status = ?,entitlement_ends_at = ?,updated_at = ?
         WHERE id = ?
           AND (paddle_last_event_occurred_at IS NULL OR paddle_last_event_occurred_at < ?)
           AND EXISTS(
             SELECT 1 FROM paddle_checkout_bindings
             WHERE id = ? AND consumed_by_event_id = ?
           )`,
      ).bind(
        update.subscriptionId,
        update.customerId,
        update.transactionId,
        update.productId,
        update.priceId,
        occurredAt,
        update.status,
        update.entitlementEndsAt,
        nowISO(),
        binding.workspaceId,
        occurredAt,
        checkout.id,
        eventId,
      ),
    ]);
    if (!consumeResult.meta.changes || !workspaceResult.meta.changes) {
      await markBillingEvent(
        env.DB,
        eventId,
        "reconciliation_required",
        "checkout_binding_race",
        binding.workspaceId,
      );
      return {
        inserted: Boolean(inserted.meta.changes),
        applied: false,
        reconciliationRequired: true,
        reason: "checkout_binding_race",
      };
    }
    updateResult = workspaceResult;
  } else {
    updateResult = await env.DB.prepare(
      `UPDATE workspaces SET
         paddle_subscription_id = COALESCE(paddle_subscription_id,NULLIF(?,'')),
         paddle_customer_id = COALESCE(paddle_customer_id,NULLIF(?,'')),
         paddle_transaction_id = COALESCE(paddle_transaction_id,NULLIF(?,'')),
         paddle_product_id = ?,paddle_price_id = ?,
         paddle_last_event_occurred_at = ?,subscription_status = ?,
         entitlement_ends_at = ?,updated_at = ?
       WHERE id = ?
         AND (paddle_last_event_occurred_at IS NULL OR paddle_last_event_occurred_at < ?)`,
    )
      .bind(
        update.subscriptionId,
        update.customerId,
        update.transactionId,
        update.productId,
        update.priceId,
        occurredAt,
        update.status,
        update.entitlementEndsAt,
        nowISO(),
        binding.workspaceId,
        occurredAt,
      )
      .run();
  }
  if (!updateResult.meta.changes) {
    await markBillingEvent(
      env.DB,
      eventId,
      "ignored",
      "stale_event",
      binding.workspaceId,
    );
    return {
      inserted: Boolean(inserted.meta.changes),
      applied: false,
      reconciliationRequired: false,
      reason: "stale_event",
    };
  }
  await markBillingEvent(
    env.DB,
    eventId,
    "applied",
    "applied",
    binding.workspaceId,
  );
  return {
    inserted: Boolean(inserted.meta.changes),
    applied: true,
    reconciliationRequired: false,
    reason: "applied",
  };
}

export function redactCheckoutBinding(payload: Record<string, unknown>): string {
  const copy = structuredClone(payload);
  const data = recordValue(copy.data);
  const customData = recordValue(data?.custom_data);
  if (customData) {
    delete customData.checkout_binding;
  }
  return JSON.stringify(copy);
}

export function billingConfigured(env: Cloudflare.Env): boolean {
  return Boolean(
    readSecret(env, "PADDLE_WEBHOOK_SECRET") &&
      readSecret(env, "PADDLE_PRODUCT_ID") &&
      readSecret(env, "PADDLE_PRODUCT_IDENTITY") &&
      readSecret(env, "PADDLE_ALLOWED_PRICE_IDS"),
  );
}
