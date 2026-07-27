import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

/**
 * Test-only D1 adapter over node:sqlite.
 *
 * Lets the diagnosis pipeline, its persistence and growth-map run against the
 * REAL migration files rather than a hand-written fixture schema, so a CHECK
 * constraint or a missing column fails the test instead of production.
 */

type SqlValue = string | number | bigint | null | Uint8Array;

function normalize(value: unknown): SqlValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return value;
  return JSON.stringify(value);
}

class TestStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: SqlValue[] = [],
  ) {}

  bind(...values: unknown[]): TestStatement {
    return new TestStatement(this.db, this.sql, values.map(normalize));
  }

  runSync(): { success: true; meta: { changes: number; last_row_id: number } } {
    const result = this.db.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params);
    return (row as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: object }> {
    const rows = this.db.prepare(this.sql).all(...this.params);
    return { results: rows as T[], success: true, meta: {} };
  }

  async run() {
    return this.runSync();
  }
}

export class TestDatabase {
  readonly sqlite: DatabaseSync;

  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON;");
    for (const sql of migrationFiles()) {
      this.sqlite.exec(sql);
    }
  }

  prepare(sql: string): TestStatement {
    return new TestStatement(this.sqlite, sql);
  }

  /** D1 batches are atomic; so is this. */
  async batch(statements: TestStatement[]) {
    this.sqlite.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.runSync());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  exec(sql: string): void {
    this.sqlite.exec(sql);
  }

  /** Convenience for assertions. */
  rows<T>(sql: string, ...params: unknown[]): T[] {
    return this.sqlite.prepare(sql).all(...params.map(normalize)) as T[];
  }

  row<T>(sql: string, ...params: unknown[]): T | null {
    return (
      (this.sqlite.prepare(sql).get(...params.map(normalize)) as T | undefined) ??
      null
    );
  }
}

export function migrationsDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
}

export function migrationFileNames(): string[] {
  return readdirSync(migrationsDirectory())
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function migrationFiles(): string[] {
  const directory = migrationsDirectory();
  return migrationFileNames().map((name) =>
    readFileSync(join(directory, name), "utf8"),
  );
}

export interface QueuedMessage {
  type?: string;
  [key: string]: unknown;
}

export class TestQueue {
  readonly sent: QueuedMessage[] = [];

  async send(message: QueuedMessage): Promise<void> {
    this.sent.push(message);
  }

  drain(): QueuedMessage[] {
    return this.sent.splice(0, this.sent.length);
  }
}

export interface TestEnvironment {
  db: TestDatabase;
  queue: TestQueue;
  env: Cloudflare.Env;
}

/**
 * Builds an environment shaped like the Worker's, backed by real SQLite.
 * `vars` seeds rollout flags and other environment variables.
 */
export function createTestEnvironment(
  vars: Record<string, string> = {},
): TestEnvironment {
  const db = new TestDatabase();
  const queue = new TestQueue();
  const env = {
    DB: db,
    SYNC_QUEUE: queue,
    ...vars,
  } as unknown as Cloudflare.Env;
  return { db, queue, env };
}

export interface SeedOptions {
  workspaceId?: string;
  userId?: string;
  appId?: string;
  appName?: string;
  platform?: "iOS" | "Web";
  appleAppId?: string | null;
  bundleId?: string | null;
  subscriptionStatus?: string;
}

export interface SeedResult {
  workspaceId: string;
  userId: string;
  appId: string;
}

/** Minimal entitled workspace with one real (non-placeholder) app. */
export function seedWorkspace(db: TestDatabase, options: SeedOptions = {}): SeedResult {
  const workspaceId = options.workspaceId ?? "ws_test";
  const userId = options.userId ?? "user_test";
  const appId = options.appId ?? "app_test";
  const platform = options.platform ?? "iOS";
  const now = "2026-07-01T00:00:00.000Z";
  const trialEndsAt = "2099-01-01T00:00:00.000Z";

  db.exec("PRAGMA foreign_keys = ON;");
  const insert = (sql: string, params: unknown[]) =>
    db.sqlite.prepare(sql).run(...params.map(normalize));

  insert(
    `INSERT INTO users(id,email,password_hash,avatar_key,created_at,updated_at)
     VALUES(?,?,?,'ridge',?,?)`,
    [userId, `${userId}@example.com`, "hash", now, now],
  );
  insert(
    `INSERT INTO workspaces(id,name,owner_id,subscription_status,trial_ends_at,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?)`,
    [
      workspaceId,
      "Test Workspace",
      userId,
      options.subscriptionStatus ?? "trialing",
      trialEndsAt,
      now,
      now,
    ],
  );
  insert(
    `INSERT INTO workspace_members(workspace_id,user_id,role,created_at)
     VALUES(?,?,'owner',?)`,
    [workspaceId, userId, now],
  );
  insert(
    `INSERT INTO apps(
       id,workspace_id,name,platform,bundle_id,apple_app_id,default_storefront,
       shared_app_user_id_confirmed,created_at,updated_at
     ) VALUES(?,?,?,?,?,?,'US',0,?,?)`,
    [
      appId,
      workspaceId,
      options.appName ?? "Test App",
      platform,
      options.bundleId ?? "com.example.test",
      options.appleAppId ?? "123456789",
      now,
      now,
    ],
  );

  return { workspaceId, userId, appId };
}

/** Inserts one metric_points row per day for a series. */
export function seedMetricSeries(
  db: TestDatabase,
  params: {
    workspaceId: string;
    appId: string;
    provider: string;
    metricKey: string;
    /** Daily values, oldest first, ending on `endDate`. */
    values: number[];
    endDate: string;
    unit?: string;
    completeness?: number;
  },
): void {
  const end = new Date(`${params.endDate}T00:00:00.000Z`).getTime();
  params.values.forEach((value, index) => {
    const offset = params.values.length - 1 - index;
    const day = new Date(end - offset * 86_400_000).toISOString().slice(0, 10);
    db.sqlite
      .prepare(
        `INSERT INTO metric_points(
           id,workspace_id,app_id,provider,metric_key,occurred_at,value,unit,
           dimensions,dimensions_hash,source_updated_at,imported_at,
           freshness_hours,completeness
         ) VALUES(?,?,?,?,?,?,?,?,'{}',?,?,?,?,?)`,
      )
      .run(
        `${params.metricKey}_${day}`,
        params.workspaceId,
        params.appId,
        params.provider,
        params.metricKey,
        `${day}T00:00:00.000Z`,
        value,
        params.unit ?? "count",
        `${params.metricKey}_${day}`,
        `${day}T00:00:00.000Z`,
        `${day}T00:00:00.000Z`,
        1,
        params.completeness ?? 1,
      );
  });
}
