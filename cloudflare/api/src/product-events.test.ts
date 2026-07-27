import { beforeEach, describe, expect, it } from "vitest";

import {
  PRODUCT_EVENT_NAMES,
  normalizeProductEvents,
  recordProductEvents,
} from "./product-events";
import { FakeD1Database } from "../test-helpers/fake-d1";
import type { AuthContext } from "./types";

const auth: AuthContext = {
  userId: "user-1",
  workspaceId: "ws-1",
  role: "owner",
};

let db: FakeD1Database;

beforeEach(() => {
  db = new FakeD1Database(["audit_events"]);
});

describe("normalizeProductEvents", () => {
  it("keeps only the event names section 14 defines", () => {
    const events = normalizeProductEvents({
      events: [
        { name: "insight_opened" },
        { name: "totally_made_up_event" },
        { name: "experiment_created" },
      ],
    });
    expect(events.map((event) => event.name)).toEqual([
      "insight_opened",
      "experiment_created",
    ]);
  });

  it("bounds the batch, the property count and each value", () => {
    const events = normalizeProductEvents({
      events: Array.from({ length: 40 }, () => ({
        name: "action_plan_opened",
        properties: Object.fromEntries(
          Array.from({ length: 30 }, (_, index) => [
            `key${index}`,
            "v".repeat(500),
          ]),
        ),
      })),
    });
    expect(events).toHaveLength(20);
    expect(Object.keys(events[0].properties)).toHaveLength(12);
    expect(String(events[0].properties.key0)).toHaveLength(200);
  });

  it("drops non-primitive property values", () => {
    const [event] = normalizeProductEvents({
      events: [
        {
          name: "insight_opened",
          properties: {
            insightId: "insight-1",
            nested: { secret: "token" },
            list: [1, 2, 3],
            ok: true,
            count: 4,
          },
        },
      ],
    });
    expect(event.properties).toEqual({
      insightId: "insight-1",
      ok: true,
      count: 4,
    });
  });

  it("falls back to now for a missing or invalid timestamp", () => {
    const [event] = normalizeProductEvents({
      events: [{ name: "insight_opened", occurredAt: "not-a-date" }],
    });
    expect(Number.isFinite(Date.parse(event.occurredAt))).toBe(true);
  });

  it("covers the Growth CI product event allow-list", () => {
    expect(PRODUCT_EVENT_NAMES.length).toBeGreaterThanOrEqual(21);
    expect(PRODUCT_EVENT_NAMES).toContain("release_verdict_completed");
    expect(PRODUCT_EVENT_NAMES).toContain("agent_task_claimed");
    expect(PRODUCT_EVENT_NAMES).toContain("verification_completed");
  });
});

describe("recordProductEvents", () => {
  it("writes each accepted event as a prefixed audit row", async () => {
    const result = await recordProductEvents(
      db as unknown as D1Database,
      auth,
      {
        events: [
          { name: "insight_opened", properties: { insightId: "insight-1" } },
          { name: "unknown_event" },
        ],
      },
    );
    expect(result).toEqual({ accepted: 1 });
    const rows = db.rows("audit_events");
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("product_event.insight_opened");
    expect(rows[0].target_type).toBe("product_event");
    expect(JSON.parse(String(rows[0].metadata))).toMatchObject({
      insightId: "insight-1",
      origin: "client",
    });
  });
});
