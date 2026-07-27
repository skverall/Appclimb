/**
 * AppClimb's own product analytics sink (plan section 14).
 *
 * These are events about how the founder uses AppClimb, not metrics about the
 * founder's app. They are written to `audit_events` with an explicit
 * `product_event.` action prefix so they never masquerade as the server-side
 * lifecycle audit events, which stay the source of truth for critical
 * transitions (a client can drop a beacon; the server write cannot be lost).
 *
 * Only the 21 names the plan lists are accepted. An unknown name is dropped
 * rather than stored, so a typo in a component cannot silently create a new
 * metric nobody defined.
 */
import { audit } from "./db";
import type { AuthContext } from "./types";

export const PRODUCT_EVENT_NAMES = [
  "product_add_started",
  "product_added",
  "source_connect_started",
  "source_access_verified",
  "source_sync_queued",
  "source_first_data_received",
  "source_pending_shown",
  "posthog_mapping_generated",
  "posthog_mapping_confirmed",
  "web_install_prompt_copied",
  "web_verification_started",
  "web_first_event_verified",
  "diagnosis_queued",
  "diagnosis_generated",
  "diagnosis_no_issue",
  "diagnosis_failed",
  "insight_opened",
  "action_plan_opened",
  "recommendation_accepted",
  "recommendation_dismissed",
  "experiment_created",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

const MAX_BATCH = 20;
const MAX_PROPERTY_KEYS = 12;
const MAX_PROPERTY_LENGTH = 200;

export interface AcceptedProductEvent {
  name: ProductEventName;
  occurredAt: string;
  properties: Record<string, string | number | boolean>;
}

/**
 * Property values are coerced to primitives and bounded. Nothing free-form
 * reaches the database: a component cannot accidentally ship an access token,
 * a raw provider payload or a user row through this channel.
 */
function sanitizeProperties(
  value: unknown,
): Record<string, string | number | boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key && key.length <= 40)
    .slice(0, MAX_PROPERTY_KEYS);
  const result: Record<string, string | number | boolean> = {};
  for (const [key, raw] of entries) {
    if (typeof raw === "boolean") result[key] = raw;
    else if (typeof raw === "number" && Number.isFinite(raw)) result[key] = raw;
    else if (typeof raw === "string" && raw.trim()) {
      result[key] = raw.trim().slice(0, MAX_PROPERTY_LENGTH);
    }
  }
  return result;
}

export function normalizeProductEvents(input: unknown): AcceptedProductEvent[] {
  const list = Array.isArray(input)
    ? input
    : Array.isArray((input as { events?: unknown })?.events)
      ? ((input as { events: unknown[] }).events as unknown[])
      : [];
  const now = new Date().toISOString();
  const accepted: AcceptedProductEvent[] = [];
  for (const raw of list.slice(0, MAX_BATCH)) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!PRODUCT_EVENT_NAMES.includes(name as ProductEventName)) continue;
    const occurredAt =
      typeof item.occurredAt === "string" &&
      Number.isFinite(Date.parse(item.occurredAt))
        ? new Date(item.occurredAt).toISOString()
        : now;
    accepted.push({
      name: name as ProductEventName,
      occurredAt,
      properties: sanitizeProperties(item.properties),
    });
  }
  return accepted;
}

export async function recordProductEvents(
  db: D1Database,
  auth: AuthContext,
  input: unknown,
): Promise<{ accepted: number }> {
  const events = normalizeProductEvents(input);
  for (const event of events) {
    await audit(
      db,
      auth.workspaceId,
      auth.userId,
      `product_event.${event.name}`,
      "product_event",
      null,
      { ...event.properties, occurredAt: event.occurredAt, origin: "client" },
    );
  }
  return { accepted: events.length };
}
