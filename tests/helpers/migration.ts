import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Read the project's D1 migration SQL for use with the in-memory emulator. */
export function loadMigrationSql(): string {
  return readFileSync(fileURLToPath(new URL("../../migrations/0001_init.sql", import.meta.url)), "utf8");
}
