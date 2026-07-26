import { createInterface } from "node:readline";

const tableOrder = [
  "users",
  "workspaces",
  "workspace_members",
  "refresh_sessions",
  "apps",
  "source_connections",
  "metric_points",
  "change_events",
  "evidence",
  "insights",
  "action_proposals",
  "experiments",
  "sync_jobs",
  "diagnosis_runs",
  "keyword_tracks",
  "keyword_rank_points",
  "billing_events",
  "paddle_checkout_bindings",
  "audit_events",
  "web_properties",
  "web_events",
  "web_crawler_events",
  "password_reset_tokens",
  "schema_migrations",
];

const jsonColumns = new Set([
  "source_connections.credential_envelope",
  "metric_points.dimensions",
  "change_events.payload",
  "evidence.metric_keys",
  "evidence.before_value",
  "evidence.after_value",
  "insights.evidence_ids",
  "experiments.result",
  "billing_events.payload",
  "audit_events.metadata",
]);

const booleanColumns = new Set([
  "apps.shared_app_user_id_confirmed",
  "action_proposals.external_mutation_allowed",
  "keyword_tracks.active",
]);

const byteaColumns = new Set([
  "refresh_sessions.token_hash",
  "paddle_checkout_bindings.token_hash",
  "password_reset_tokens.token_hash",
]);

const rowsByTable = new Map();
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  const value = JSON.parse(trimmed);
  if (
    !value ||
    typeof value !== "object" ||
    !tableOrder.includes(value.table) ||
    !Array.isArray(value.rows) ||
    rowsByTable.has(value.table)
  ) {
    throw new Error("invalid_postgres_export");
  }
  rowsByTable.set(value.table, value.rows);
}

for (const table of tableOrder) {
  if (!rowsByTable.has(table)) {
    throw new Error(`missing_table:${table}`);
  }
}

function identifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) {
    throw new Error("invalid_identifier");
  }
  return `"${value}"`;
}

function sqlValue(table, column, value) {
  if (value === null || typeof value === "undefined") return "NULL";
  const key = `${table}.${column}`;
  if (byteaColumns.has(key)) {
    if (typeof value !== "string" || !/^\\x[0-9a-f]+$/iu.test(value)) {
      throw new Error(`invalid_bytea:${key}`);
    }
    return `X'${value.slice(2)}'`;
  }
  if (booleanColumns.has(key)) {
    return value ? "1" : "0";
  }
  if (jsonColumns.has(key)) {
    return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`invalid_number:${key}`);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`unsupported_value:${key}`);
}

const reverseOrder = [...tableOrder].reverse();
const statements = [];
for (const table of reverseOrder) {
  statements.push(`DELETE FROM ${identifier(table)};`);
}
for (const table of tableOrder) {
  for (const row of rowsByTable.get(table)) {
    const columns = Object.keys(row);
    if (!columns.length) continue;
    const values = columns.map((column) =>
      sqlValue(table, column, row[column]),
    );
    statements.push(
      `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(",")}) VALUES (${values.join(",")});\n`,
    );
  }
}

if (process.argv.includes("--chunked")) {
  const maxChunkBytes = 32 * 1024;
  let chunk = [];
  let chunkBytes = 0;
  const flush = () => {
    if (!chunk.length) return;
    const sql = chunk.join("\n");
    process.stdout.write(`${Buffer.from(sql).toString("base64")}\n`);
    chunk = [];
    chunkBytes = 0;
  };
  for (const statement of statements) {
    const bytes = Buffer.byteLength(statement) + 1;
    if (bytes > maxChunkBytes) {
      throw new Error("single_statement_exceeds_chunk_limit");
    }
    if (chunkBytes + bytes > maxChunkBytes) flush();
    chunk.push(statement);
    chunkBytes += bytes;
  }
  flush();
} else {
  process.stdout.write(statements.join("\n"));
  process.stdout.write("\n");
}
