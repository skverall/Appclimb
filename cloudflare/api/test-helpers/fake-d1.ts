/**
 * A deliberately small in-memory stand-in for D1, used by the experiment and
 * feedback tests so a create can be read back through a *second* handler call
 * — the API-side equivalent of a browser reload.
 *
 * It understands only the statement shapes this repository actually issues for
 * those tables: single-table SELECT / INSERT / UPDATE / DELETE with `col=?`
 * conjunctions, `COUNT(*) AS total`, one `ORDER BY`, one `LIMIT`, and `batch`.
 * It is not a SQL engine and must not be used to prove anything about SQL
 * semantics — production behaviour is still verified against real D1.
 */

export type FakeRow = Record<string, unknown>;

interface ParsedStatement {
  verb: "select" | "insert" | "update" | "delete";
  table: string;
  columns: string[];
  setColumns: Array<{ column: string; coalesceWith?: string }>;
  where: string[];
  orderBy?: { column: string; descending: boolean };
  limit?: number;
  isCount: boolean;
}

function splitTopLevel(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function parse(rawSql: string): ParsedStatement {
  const sql = rawSql.replace(/\s+/gu, " ").trim();
  const lower = sql.toLowerCase();

  const verb: ParsedStatement["verb"] = lower.startsWith("insert")
    ? "insert"
    : lower.startsWith("update")
      ? "update"
      : lower.startsWith("delete")
        ? "delete"
        : "select";

  const tableMatch =
    verb === "insert"
      ? /insert into (\w+)/iu.exec(sql)
      : verb === "update"
        ? /update (\w+)/iu.exec(sql)
        : /from (\w+)/iu.exec(sql);
  const table = tableMatch?.[1] ?? "";

  let columns: string[] = [];
  if (verb === "insert") {
    const start = sql.indexOf("(");
    const end = sql.toLowerCase().indexOf(") values");
    columns = splitTopLevel(sql.slice(start + 1, end));
  }

  const setColumns: ParsedStatement["setColumns"] = [];
  if (verb === "update") {
    const setStart = lower.indexOf(" set ") + 5;
    const whereStart = lower.indexOf(" where ");
    for (const assignment of splitTopLevel(sql.slice(setStart, whereStart))) {
      const [column, expression] = assignment.split("=");
      const coalesce = /coalesce\(\?,(\w+)\)/iu.exec(expression ?? "");
      setColumns.push({
        column: column.trim(),
        ...(coalesce ? { coalesceWith: coalesce[1] } : {}),
      });
    }
  }

  const whereStart = lower.indexOf(" where ");
  let where: string[] = [];
  if (whereStart >= 0) {
    const tail = sql.slice(whereStart + 7);
    const stop = tail.search(/ order by | limit /iu);
    const clause = stop >= 0 ? tail.slice(0, stop) : tail;
    where = clause
      .split(/ and /iu)
      .map((item) => item.split("=")[0].trim())
      .filter(Boolean);
  }

  const orderMatch = /order by (\w+)( desc)?/iu.exec(sql);
  const limitMatch = /limit (\d+)/iu.exec(sql);

  return {
    verb,
    table,
    columns,
    setColumns,
    where,
    ...(orderMatch
      ? {
          orderBy: {
            column: orderMatch[1],
            descending: Boolean(orderMatch[2]),
          },
        }
      : {}),
    ...(limitMatch ? { limit: Number(limitMatch[1]) } : {}),
    isCount: /count\(\*\)/iu.test(sql),
  };
}

export class FakeD1Database {
  readonly tables: Record<string, FakeRow[]> = {};

  constructor(tables: string[]) {
    for (const table of tables) this.tables[table] = [];
  }

  rows(table: string): FakeRow[] {
    this.tables[table] ??= [];
    return this.tables[table];
  }

  prepare(sql: string) {
    return new FakeD1Statement(this, parse(sql));
  }

  async batch(statements: FakeD1Statement[]) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

export class FakeD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly parsed: ParsedStatement,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  private matches(row: FakeRow, offset: number): boolean {
    return this.parsed.where.every(
      (column, index) => row[column] === this.values[offset + index],
    );
  }

  private select(): FakeRow[] {
    let rows = this.db
      .rows(this.parsed.table)
      .filter((row) => this.matches(row, 0));
    const { orderBy, limit } = this.parsed;
    if (orderBy) {
      rows = [...rows].sort((left, right) => {
        const a = String(left[orderBy.column] ?? "");
        const b = String(right[orderBy.column] ?? "");
        return orderBy.descending ? b.localeCompare(a) : a.localeCompare(b);
      });
    }
    return limit === undefined ? rows : rows.slice(0, limit);
  }

  async first<T = FakeRow>(): Promise<T | null> {
    if (this.parsed.isCount) {
      return { total: this.select().length } as unknown as T;
    }
    return (this.select()[0] ?? null) as T | null;
  }

  async all<T = FakeRow>(): Promise<{ results: T[] }> {
    return { results: this.select() as T[] };
  }

  async run(): Promise<{ success: true }> {
    const { verb, table, columns, setColumns, where } = this.parsed;
    if (verb === "insert") {
      const row: FakeRow = {};
      columns.forEach((column, index) => {
        row[column] = this.values[index] ?? null;
      });
      this.db.rows(table).push(row);
      return { success: true };
    }
    if (verb === "update") {
      const targets = this.db
        .rows(table)
        .filter((row) => this.matches(row, setColumns.length));
      for (const row of targets) {
        setColumns.forEach((assignment, index) => {
          const value = this.values[index];
          if (assignment.coalesceWith) {
            row[assignment.column] =
              value ?? row[assignment.coalesceWith] ?? null;
            return;
          }
          row[assignment.column] = value ?? null;
        });
      }
      return { success: true };
    }
    if (verb === "delete") {
      const remaining = this.db
        .rows(table)
        .filter((row) => !where.every((column, index) => row[column] === this.values[index]));
      this.db.tables[table] = remaining;
      return { success: true };
    }
    return { success: true };
  }
}

export function fakeDatabase(): FakeD1Database {
  return new FakeD1Database([
    "apps",
    "experiments",
    "action_proposals",
    "action_proposal_feedback",
    "audit_events",
  ]);
}
