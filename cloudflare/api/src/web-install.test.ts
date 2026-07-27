import { beforeEach, describe, expect, it } from "vitest";

import { issueTrackingToken } from "./crypto";
import {
  markPropertyVerified,
  recordCrawlerEvent,
  recordWebEvent,
  saveConversionGoal,
  saveInstallStep,
  webInstallSnapshot,
} from "./web-analytics";
import type { AuthContext } from "./types";

// The signing key is a base64 blob of at least 32 bytes.
const SECRET = Buffer.alloc(32, 7).toString("base64");
const WORKSPACE = "ws-1";
const PROPERTY = "prop-1";
const DOMAIN = "cardealertracker.app";

const auth: AuthContext = {
  userId: "user-1",
  workspaceId: WORKSPACE,
  role: "owner",
};

interface Statement {
  sql: string;
  binds: unknown[];
}

/**
 * Small scripted D1 stand-in. It records every statement so the tests can prove
 * *how* the collector writes verification metadata (a single primary-key
 * UPDATE, no scan) rather than only that a value came back.
 */
function stubDatabase(
  handler: (sql: string, binds: unknown[]) => unknown,
): { db: D1Database; statements: Statement[] } {
  const statements: Statement[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...binds: unknown[]) {
          const record: Statement = { sql: sql.replace(/\s+/gu, " ").trim(), binds };
          return {
            async first() {
              statements.push(record);
              return handler(record.sql, binds) ?? null;
            },
            async run() {
              statements.push(record);
              const result = handler(record.sql, binds);
              if (result instanceof Error) throw result;
              return { meta: { changes: 1 } };
            },
            async all() {
              statements.push(record);
              return { results: (handler(record.sql, binds) as unknown[]) ?? [] };
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as D1Database, statements };
}

function envFor(db: D1Database): Cloudflare.Env {
  return { DB: db, JWT_SECRET: SECRET } as unknown as Cloudflare.Env;
}

let token: string;

beforeEach(async () => {
  token = await issueTrackingToken(SECRET, {
    w: WORKSPACE,
    p: PROPERTY,
    v: 1,
  });
});

describe("markPropertyVerified (Task P0.26)", () => {
  it("writes the verification metadata with one primary-key UPDATE", async () => {
    const { db, statements } = stubDatabase(() => null);
    const now = new Date("2026-07-27T12:00:00.000Z");
    await markPropertyVerified(db, PROPERTY, DOMAIN, now);

    expect(statements).toHaveLength(1);
    const [statement] = statements;
    expect(statement.sql).toContain("UPDATE web_properties");
    // Targeted by primary key — never a full-table scan.
    expect(statement.sql).toContain("WHERE id = ?");
    expect(statement.binds).toContain(PROPERTY);
    // First-event provenance is written once and never overwritten.
    expect(statement.sql).toContain("first_event_at = COALESCE(first_event_at, ?)");
    expect(statement.sql).toContain("verified_at = COALESCE(verified_at, ?)");
    expect(statement.sql).toContain(
      "verified_hostname = COALESCE(verified_hostname, ?)",
    );
    expect(statement.binds).toContain(DOMAIN);
    expect(statement.binds).toContain(now.toISOString());
  });

  it("throttles steady-state traffic instead of rewriting on every event", async () => {
    const { db, statements } = stubDatabase(() => null);
    const now = new Date("2026-07-27T12:00:00.000Z");
    await markPropertyVerified(db, PROPERTY, DOMAIN, now);

    // The predicate keeps the row untouched while it was updated recently, so
    // the first event always lands (last_event_at IS NULL) but page-view floods
    // cost at most one write per minute.
    expect(statements[0].sql).toContain(
      "AND (last_event_at IS NULL OR last_event_at < ?)",
    );
    expect(statements[0].binds.at(-1)).toBe("2026-07-27T11:59:00.000Z");
  });
});

describe("collector verification path", () => {
  const validEvent = {
    eventId: "event-1",
    visitorId: "visitor-1",
    sessionId: "session-1",
    kind: "page_view",
    hostname: DOMAIN,
    path: "/pricing",
  };

  it("marks the property verified after an accepted browser event", async () => {
    const { db, statements } = stubDatabase((sql) => {
      if (sql.startsWith("SELECT id,workspace_id,domain FROM web_properties")) {
        return { id: PROPERTY, workspace_id: WORKSPACE, domain: DOMAIN };
      }
      return null;
    });
    const request = new Request("https://appclimb.app/api/track", {
      method: "POST",
      headers: { "user-agent": "Mozilla/5.0 (Macintosh) Safari/605" },
    });

    await expect(
      recordWebEvent(envFor(db), request, { ...validEvent, token }),
    ).resolves.toBe("accepted");

    const updates = statements.filter((item) =>
      item.sql.startsWith("UPDATE web_properties"),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].binds).toContain(DOMAIN);
  });

  it("does not verify an install from a server-side crawler hit", async () => {
    const { db, statements } = stubDatabase((sql) => {
      if (sql.startsWith("SELECT id,workspace_id,domain FROM web_properties")) {
        return { id: PROPERTY, workspace_id: WORKSPACE, domain: DOMAIN };
      }
      return null;
    });
    const request = new Request("https://appclimb.app/api/track/crawler", {
      method: "POST",
      headers: { "user-agent": "Mozilla/5.0 (compatible; GPTBot/1.0)" },
    });

    await expect(
      recordCrawlerEvent(envFor(db), request, {
        token,
        eventId: "crawler-1",
        hostname: DOMAIN,
        path: "/pricing",
      }),
    ).resolves.toBe("accepted");

    expect(
      statements.filter((item) => item.sql.startsWith("UPDATE web_properties")),
    ).toHaveLength(0);
  });
});

describe("webInstallSnapshot (Tasks P0.24, P0.27)", () => {
  const baseRow = {
    id: PROPERTY,
    name: "Car Dealer Tracker",
    domain: DOMAIN,
    token_version: 1,
    retention_days: 90,
    created_at: "2026-07-27T10:00:00.000Z",
    first_event_at: null,
    last_event_at: null,
    verified_at: null,
    verified_hostname: null,
    installation_version: 1,
    primary_conversion_goal: null,
    setup_step: null,
    setup_completed_at: null,
  };

  it("reports no property without inventing one", async () => {
    const { db } = stubDatabase(() => null);
    const snapshot = await webInstallSnapshot(envFor(db), WORKSPACE);
    expect(snapshot.property).toBeNull();
    expect(snapshot.install).toMatchObject({
      propertyId: null,
      reachedStep: "domain",
    });
    expect(snapshot.firstEvent).toBeNull();
  });

  it("leaves the sample unmeasured before the first accepted event", async () => {
    const { db, statements } = stubDatabase((sql) =>
      sql.includes("FROM web_properties") ? baseRow : null,
    );
    const snapshot = await webInstallSnapshot(envFor(db), WORKSPACE);
    const install = snapshot.install as Record<string, unknown>;

    expect(install.firstEventAt).toBeNull();
    // A missing metric is null, never zero.
    expect(install.baselineSessions).toBeNull();
    expect(install.baselineDays).toBeNull();
    expect(install.reachedStep).toBe("install");
    expect(snapshot.firstEvent).toBeNull();
    // No baseline aggregation is issued before the property is verified.
    expect(
      statements.some((item) => item.sql.includes("COUNT(DISTINCT session_id)")),
    ).toBe(false);
  });

  it("returns the accepted first event and a real sample once verified", async () => {
    const { db } = stubDatabase((sql) => {
      if (sql.includes("FROM web_properties")) {
        return {
          ...baseRow,
          first_event_at: "2026-07-27T11:30:00.000Z",
          last_event_at: "2026-07-27T11:45:00.000Z",
          verified_at: "2026-07-27T11:30:00.000Z",
          verified_hostname: DOMAIN,
          primary_conversion_goal: "subscription_started",
          setup_step: "baseline",
        };
      }
      if (sql.includes("COUNT(DISTINCT session_id)")) {
        return { sessions: 12, days: 2 };
      }
      if (sql.includes("FROM web_events")) {
        return {
          occurred_at: "2026-07-27T11:30:00.000Z",
          created_at: "2026-07-27T11:30:01.000Z",
          hostname: DOMAIN,
          path: "/pricing",
          kind: "page_view",
        };
      }
      return null;
    });

    const snapshot = await webInstallSnapshot(envFor(db), WORKSPACE);
    expect(snapshot.install).toMatchObject({
      firstEventAt: "2026-07-27T11:30:00.000Z",
      verifiedHostname: DOMAIN,
      primaryConversionGoal: "subscription_started",
      baselineSessions: 12,
      baselineDays: 2,
      reachedStep: "baseline",
    });
    expect(snapshot.firstEvent).toEqual({
      acceptedAt: "2026-07-27T11:30:01.000Z",
      hostname: DOMAIN,
      path: "/pricing",
      kind: "page_view",
      source: "browser",
      collectorStatus: "accepted",
    });
    expect(
      String((snapshot.property as { trackingToken: string }).trackingToken),
    ).toMatch(/^acwa1_/u);
  });
});

describe("wizard persistence", () => {
  const row = {
    id: PROPERTY,
    name: "Car Dealer Tracker",
    domain: DOMAIN,
    token_version: 1,
    retention_days: 90,
    created_at: "2026-07-27T10:00:00.000Z",
    first_event_at: null,
    last_event_at: null,
    verified_at: null,
    verified_hostname: null,
    installation_version: 1,
    primary_conversion_goal: null,
    setup_step: "deploy",
    setup_completed_at: null,
  };

  it("persists a forward step so a reload resumes in place", async () => {
    const { db, statements } = stubDatabase((sql) =>
      sql.includes("FROM web_properties") ? row : null,
    );
    await expect(
      saveInstallStep(envFor(db), auth, "verify"),
    ).resolves.toEqual({ reachedStep: "verify" });
    const update = statements.find((item) =>
      item.sql.startsWith("UPDATE web_properties"),
    );
    expect(update?.binds[0]).toBe("verify");
  });

  it("never moves the persisted step backwards", async () => {
    const { db } = stubDatabase((sql) =>
      sql.includes("FROM web_properties") ? row : null,
    );
    await expect(
      saveInstallStep(envFor(db), auth, "install"),
    ).resolves.toEqual({ reachedStep: "deploy" });
  });

  it("rejects an unknown step and a missing property", async () => {
    const { db } = stubDatabase((sql) =>
      sql.includes("FROM web_properties") ? row : null,
    );
    await expect(saveInstallStep(envFor(db), auth, "nope")).rejects.toThrow(
      /invalid_install_step/u,
    );
    const empty = stubDatabase(() => null);
    await expect(
      saveInstallStep(envFor(empty.db), auth, "verify"),
    ).rejects.toThrow(/web_property_missing/u);
  });

  it("normalizes and stores the primary conversion goal", async () => {
    const { db, statements } = stubDatabase((sql) =>
      sql.includes("FROM web_properties") ? row : null,
    );
    await expect(
      saveConversionGoal(envFor(db), auth, " Subscription Started! "),
    ).resolves.toEqual({ primaryConversionGoal: "subscription_started" });
    const update = statements.find((item) =>
      item.sql.startsWith("UPDATE web_properties SET primary_conversion_goal"),
    );
    expect(update?.binds[0]).toBe("subscription_started");
  });

  it("rejects an empty conversion goal instead of storing a blank", async () => {
    const { db } = stubDatabase((sql) =>
      sql.includes("FROM web_properties") ? row : null,
    );
    await expect(saveConversionGoal(envFor(db), auth, "  ")).rejects.toThrow(
      /invalid_conversion_goal/u,
    );
  });
});
