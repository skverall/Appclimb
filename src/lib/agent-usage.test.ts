import { beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_PRO_DAILY_CHECKS,
  agentDailyChecks,
  consumeAgentChecks,
  readAgentUsage,
  refundAgentChecks,
} from "@/lib/agent-usage";
import { createTestDb, type FakeD1 } from "../../tests/helpers/fake-d1";
import { loadAllMigrationsSql } from "../../tests/helpers/migration";

const MIGRATIONS = loadAllMigrationsSql();
const NOON = new Date("2026-11-03T12:00:00Z");

let db: FakeD1;

beforeEach(async () => {
  db = await createTestDb(MIGRATIONS);
});

describe("agentDailyChecks", () => {
  it("uses the plan's explorer checks, with a fair-use cap for unlimited Pro", () => {
    expect(agentDailyChecks("free")).toBe(30);
    expect(agentDailyChecks("pro")).toBe(AGENT_PRO_DAILY_CHECKS);
    expect(AGENT_PRO_DAILY_CHECKS).toBe(1000);
  });
});

describe("consumeAgentChecks", () => {
  it("grants in full, then partially, then nothing at the cap", async () => {
    expect(await consumeAgentChecks(db, "user:1", 5, 8, NOON)).toBe(5);
    expect(await consumeAgentChecks(db, "user:1", 5, 8, NOON)).toBe(3);
    expect(await consumeAgentChecks(db, "user:1", 1, 8, NOON)).toBe(0);
    expect(await readAgentUsage(db, "user:1", NOON)).toBe(8);
  });

  it("floors fractional requests and refuses non-positive ones", async () => {
    expect(await consumeAgentChecks(db, "user:1", 2.7, 10, NOON)).toBe(2);
    expect(await consumeAgentChecks(db, "user:1", -3, 10, NOON)).toBe(0);
    expect(await consumeAgentChecks(db, "user:1", 0, 10, NOON)).toBe(0);
    expect(await consumeAgentChecks(db, "user:1", 1, 0, NOON)).toBe(0);
    expect(await readAgentUsage(db, "user:1", NOON)).toBe(2);
  });

  it("keeps subjects and UTC days apart", async () => {
    await consumeAgentChecks(db, "user:1", 4, 4, NOON);
    expect(await consumeAgentChecks(db, "user:2", 4, 4, NOON)).toBe(4);
    const tomorrow = new Date("2026-11-04T00:00:01Z");
    expect(await readAgentUsage(db, "user:1", tomorrow)).toBe(0);
    expect(await consumeAgentChecks(db, "user:1", 4, 4, tomorrow)).toBe(4);
  });

  it("does not let parallel calls overshoot the cap", async () => {
    const grants = await Promise.all([
      consumeAgentChecks(db, "user:1", 4, 5, NOON),
      consumeAgentChecks(db, "user:1", 4, 5, NOON),
    ]);
    expect(grants.sort()).toEqual([1, 4]);
    expect(await readAgentUsage(db, "user:1", NOON)).toBe(5);
  });

  it("gives up after three lost races", async () => {
    let upserts = 0;
    const contended = {
      prepare: (sql: string) => ({
        bind: () => ({
          first: async () => {
            if (sql.startsWith("SELECT")) return { count: 0 };
            upserts += 1;
            return null;
          },
        }),
      }),
    } as unknown as D1Database;
    expect(await consumeAgentChecks(contended, "user:1", 2, 10, NOON)).toBe(0);
    expect(upserts).toBe(3);
  });

  it("defaults to the current day", async () => {
    expect(await consumeAgentChecks(db, "user:1", 2, 10)).toBe(2);
    expect(await readAgentUsage(db, "user:1")).toBe(2);
  });
});

describe("refundAgentChecks", () => {
  it("gives checks back without going below zero", async () => {
    await consumeAgentChecks(db, "user:1", 5, 10, NOON);
    await refundAgentChecks(db, "user:1", 3, NOON);
    expect(await readAgentUsage(db, "user:1", NOON)).toBe(2);
    await refundAgentChecks(db, "user:1", 0, NOON);
    await refundAgentChecks(db, "user:1", -4, NOON);
    expect(await readAgentUsage(db, "user:1", NOON)).toBe(2);
    await refundAgentChecks(db, "user:1", 9, NOON);
    expect(await readAgentUsage(db, "user:1", NOON)).toBe(0);
    await expect(refundAgentChecks(db, "user:9", 1, NOON)).resolves.toBeUndefined();
    await expect(refundAgentChecks(db, "user:1", 1)).resolves.toBeUndefined();
  });
});
