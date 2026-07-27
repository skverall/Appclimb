/**
 * AppClimb's own product analytics emitter (plan section 14).
 *
 * Scope and honesty rules:
 * - These events describe how the founder uses AppClimb. They are never mixed
 *   with the founder's own app metrics and never reach a third-party analytics
 *   vendor.
 * - Server audit events remain the source of truth for critical lifecycle
 *   events. `recommendation_accepted`, `recommendation_dismissed` and
 *   `experiment_created` are written server-side by the API routes that perform
 *   the transition; the client copies here are supplementary and may be lost.
 * - Nothing is sent for an anonymous or demo visitor: the relay requires a
 *   session, so a demo click never becomes workspace data.
 */

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

export type ProductEventProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface ProductEvent {
  name: ProductEventName;
  occurredAt: string;
  properties: Record<string, string | number | boolean>;
}

const MAX_BUFFER = 20;
const FLUSH_DELAY_MS = 400;

let buffer: ProductEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let enabled = false;

/**
 * Turned on once per session by the workspace shell when a real workspace is
 * loaded. Left off for the public demo so synthetic interaction never lands in
 * a private workspace's audit trail.
 */
export function configureProductEvents(options: { enabled: boolean }) {
  enabled = options.enabled;
  if (!enabled) {
    buffer = [];
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }
}

export function productEventsEnabled() {
  return enabled;
}

function cleanProperties(
  properties: ProductEventProperties,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties).slice(0, 12)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "boolean") result[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
    } else if (typeof value === "string" && value.trim()) {
      result[key] = value.trim().slice(0, 200);
    }
  }
  return result;
}

export async function flushProductEvents(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!buffer.length) return;
  const events = buffer;
  buffer = [];
  try {
    await fetch("/api/product-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events }),
      keepalive: true,
    });
  } catch {
    // A dropped product event must never break the workspace. Server audit
    // events already cover the critical transitions.
  }
}

/**
 * Records one product event. Also dispatches a DOM `CustomEvent` so other
 * surfaces can observe the stream without importing this module's internals.
 */
export function trackProductEvent(
  name: ProductEventName,
  properties: ProductEventProperties = {},
): void {
  if (typeof window === "undefined") return;
  const event: ProductEvent = {
    name,
    occurredAt: new Date().toISOString(),
    properties: cleanProperties(properties),
  };
  window.dispatchEvent(
    new CustomEvent("appclimb:product-event", { detail: event }),
  );
  if (!enabled) return;
  buffer.push(event);
  if (buffer.length >= MAX_BUFFER) {
    void flushProductEvents();
    return;
  }
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    void flushProductEvents();
  }, FLUSH_DELAY_MS);
}
