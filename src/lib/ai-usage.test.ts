import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { consumeAiUsage, readAiUsage, refundAiUsage, usageDay } from "@/lib/ai-usage";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";

const migration = readFileSync(new URL("../../migrations/0005_ai_usage.sql", import.meta.url), "utf8");

let db: FakeD1;

beforeEach(async () => {
  db = await createTestDb(migration);
});

const NOON = new Date("2026-10-01T12:00:00Z");

describe("ai usage counter", () => {
  it("counts up to the cap and then refuses", async () => {
    expect(await consumeAiUsage(db, "user:1", 3, NOON)).toBe(1);
    expect(await consumeAiUsage(db, "user:1", 3, NOON)).toBe(2);
    expect(await consumeAiUsage(db, "user:1", 3, NOON)).toBe(3);
    expect(await consumeAiUsage(db, "user:1", 3, NOON)).toBeNull();
    expect(await readAiUsage(db, "user:1", NOON)).toBe(3);
  });

  it("keeps subjects and UTC days apart", async () => {
    await consumeAiUsage(db, "user:1", 5, NOON);
    await consumeAiUsage(db, "user:2", 5, NOON);
    const tomorrow = new Date("2026-10-02T00:00:01Z");
    expect(await readAiUsage(db, "user:1", tomorrow)).toBe(0);
    expect(await consumeAiUsage(db, "user:1", 5, tomorrow)).toBe(1);
    expect(await readAiUsage(db, "user:2", NOON)).toBe(1);
    expect(usageDay(tomorrow)).toBe("2026-10-02");
  });

  it("refunds a failed reply without going below zero", async () => {
    await consumeAiUsage(db, "user:1", 2, NOON);
    await consumeAiUsage(db, "user:1", 2, NOON);
    await refundAiUsage(db, "user:1", NOON);
    expect(await consumeAiUsage(db, "user:1", 2, NOON)).toBe(2);
    await refundAiUsage(db, "user:9", NOON);
    await refundAiUsage(db, "user:1", NOON);
    await refundAiUsage(db, "user:1", NOON);
    await refundAiUsage(db, "user:1", NOON);
    expect(await readAiUsage(db, "user:1", NOON)).toBe(0);
  });

  it("refuses everything when the cap is zero", async () => {
    expect(await consumeAiUsage(db, "user:1", 0, NOON)).toBeNull();
  });
});
