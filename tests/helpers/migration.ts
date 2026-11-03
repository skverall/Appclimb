import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

/** Read the project's D1 migration SQL for use with the in-memory emulator. */
export function loadMigrationSql(): string {
  return readFileSync(fileURLToPath(new URL("../../migrations/0001_init.sql", import.meta.url)), "utf8");
}

/** Every migration (0001, 0002, ...) concatenated in order, like `wrangler d1 migrations apply`. */
export function loadAllMigrationsSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort()
    .map((name) => readFileSync(`${MIGRATIONS_DIR}${name}`, "utf8"))
    .join("\n");
}
