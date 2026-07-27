/**
 * Minimal ambient types for `node:sqlite`.
 *
 * The repository pins @types/node v20, which predates the module. Only the
 * surface the diagnosis test harness uses is declared here; this file is
 * test-support only and is never bundled into the Worker.
 */
declare module "node:sqlite" {
  type SQLInputValue = string | number | bigint | null | Uint8Array;

  interface StatementRunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class StatementSync {
    get(...params: SQLInputValue[]): unknown;
    all(...params: SQLInputValue[]): unknown[];
    run(...params: SQLInputValue[]): StatementRunResult;
  }

  export class DatabaseSync {
    constructor(path: string, options?: Record<string, unknown>);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
