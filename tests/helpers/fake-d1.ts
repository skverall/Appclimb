/**
 * In-memory D1 emulator backed by Node's built-in `node:sqlite`.
 *
 * It implements the small slice of the D1 binding API this repo uses
 * (`prepare/bind/first/all/run`, plus `exec`) so server libraries can be
 * exercised against real SQLite semantics in unit tests without a Worker.
 * Apply the actual migration SQL (migrations/0001_init.sql) before use.
 */
import { DatabaseSync } from "node:sqlite";

interface SqliteRunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}

class FakePreparedStatement implements D1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new FakePreparedStatement(this.db, this.sql, values);
  }

  private normalize(value: unknown): unknown {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
  }

  private boundParams(): unknown[] {
    return this.params.map((p) => this.normalize(p));
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...(this.boundParams() as never[]));
    return (row ?? null) as T | null;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...(this.boundParams() as never[]));
    return this.result(rows as T[], { changes: 0, lastInsertRowid: 0 });
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...(this.boundParams() as never[])) as SqliteRunResult;
    return this.result<T>([], {
      changes: Number(info.changes ?? 0),
      lastInsertRowid: Number(info.lastInsertRowid ?? 0),
    });
  }

  async raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  async raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(
    options?: { columnNames?: boolean },
  ): Promise<T[] | [string[], ...T[]]> {
    const stmt = this.db.prepare(this.sql);
    const rows = stmt.all(...(this.boundParams() as never[])) as Record<string, unknown>[];
    const asArrays = rows.map((row) => Object.values(row)) as T[];
    if (options?.columnNames) {
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      return [columns, ...asArrays];
    }
    return asArrays;
  }

  private result<T>(results: T[], info: { changes: number; lastInsertRowid: number }): D1Result<T> {
    return {
      results,
      success: true,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: info.changes,
        last_row_id: info.lastInsertRowid,
        changed_db: info.changes > 0,
        changes: info.changes,
      },
    };
  }
}

export class FakeD1 implements D1Database {
  readonly sqlite: DatabaseSync;

  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
  }

  prepare(query: string): D1PreparedStatement {
    return new FakePreparedStatement(this.sqlite, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const stmt of statements) {
      results.push((await stmt.run()) as D1Result<T>);
    }
    return results;
  }

  async exec(query: string): Promise<D1ExecResult> {
    const start = Date.now();
    this.sqlite.exec(query);
    return { count: query.split(";").filter((s) => s.trim()).length, duration: Date.now() - start };
  }

  close(): void {
    this.sqlite.close();
  }
}

/** Create an in-memory D1 with the project's migration schema applied. */
export async function createTestDb(migrationSql: string): Promise<FakeD1> {
  const db = new FakeD1();
  await db.exec(migrationSql);
  return db;
}
