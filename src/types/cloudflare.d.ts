/**
 * Minimal Cloudflare D1 type surface for this repo.
 *
 * We deliberately do NOT add `/// <reference types="@cloudflare/workers-types" />`
 * here: that package declares global `Buffer`, `fetch`, `Request`, etc. that
 * collide with `@types/node` and the DOM lib, breaking `node:crypto` typing
 * (e.g. `randomBytes(...).toString("base64url")`). Instead we declare just the
 * D1 binding shapes we use, structurally identical to the real runtime binding
 * provided by the OpenNext worker (`getCloudflareContext().env.DB`).
 *
 * If more Cloudflare bindings are needed later, extend this file rather than
 * importing the full workers-types package into the app program.
 */

interface D1Meta {
  duration: number;
  size_after: number;
  rows_read: number;
  rows_written: number;
  last_row_id: number;
  changed_db: boolean;
  changes: number;
  served_by_region?: string;
  served_by_colo?: string;
  served_by_primary?: boolean;
  timings?: {
    sql_duration_ms: number;
  };
  total_attempts?: number;
}

interface D1Response {
  success: true;
  meta: D1Meta & Record<string, unknown>;
  error?: never;
}

type D1Result<T = unknown> = D1Response & {
  results: T[];
};

interface D1ExecResult {
  count: number;
  duration: number;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
}

/**
 * Extends the global `CloudflareEnv` interface declared by
 * `@opennextjs/cloudflare` so the D1 binding is typed when accessed via
 * `getCloudflareContext().env.DB` (see ADR 0004).
 */
interface CloudflareEnv {
  DB: D1Database;
}
