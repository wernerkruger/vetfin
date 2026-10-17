import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadDatabaseConfig } from "../config.js";
import { runMigrations } from "./migrate.js";
import { importProspectClinicsIfEmpty } from "./prospectClinics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Return COUNT(*)/SUM(int) (int8) and AVG/ROUND (numeric) as JS numbers instead of strings,
// matching what better-sqlite3 used to return.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number.parseFloat(v));

// No booleans: flag columns are INTEGER 0/1 (pass `x ? 1 : 0`). undefined is sent as NULL.
export type SqlParam = string | number | null | undefined | Date | Buffer;

type Queryable = pg.Pool | pg.PoolClient;

let pool: pg.Pool | undefined;
const txContext = new AsyncLocalStorage<pg.PoolClient>();

export function getPool(): pg.Pool {
  if (pool) return pool;
  const database = loadDatabaseConfig();
  pool = new pg.Pool({
    connectionString: database.connectionString,
    max: database.poolMax,
    ssl:
      database.ssl === "disable"
        ? undefined
        : { rejectUnauthorized: database.ssl === "verify-full" },
  });
  pool.on("error", (err) => {
    console.error("Postgres pool error:", err);
  });
  return pool;
}

/** The active transaction client (inside withTransaction), otherwise the pool. */
function executor(): Queryable {
  return txContext.getStore() ?? getPool();
}

/**
 * Converts SQLite-style `?` placeholders to Postgres `$1, $2, ...`.
 * Skips `?` inside single-quoted string literals.
 */
export function toPgPlaceholders(sql: string): string {
  let out = "";
  let n = 0;
  let inString = false;
  for (const ch of sql) {
    if (ch === "'") inString = !inString;
    if (ch === "?" && !inString) {
      n += 1;
      out += `$${n}`;
    } else {
      out += ch;
    }
  }
  return out;
}

/** True if `err` is a Postgres unique-constraint error (optionally for a specific constraint). */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; constraint?: string };
  return e.code === "23505" && (!constraint || e.constraint === constraint);
}

/** Run a query and return all rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: SqlParam[] = [],
): Promise<T[]> {
  const result = await executor().query(toPgPlaceholders(sql), params);
  return result.rows as T[];
}

/** Run a query and return the first row (or undefined). */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: SqlParam[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

/** Run an INSERT/UPDATE/DELETE and return the number of affected rows. */
export async function execute(
  sql: string,
  params: SqlParam[] = [],
): Promise<number> {
  const result = await executor().query(toPgPlaceholders(sql), params);
  return result.rowCount ?? 0;
}

/**
 * Run `fn` inside a transaction. Every query()/execute() call made while `fn`
 * runs (including in nested helpers) uses the same connection. Nested calls
 * reuse the outer transaction.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txContext.getStore()) return fn();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await txContext.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Small prepared-statement style API (same shape the code used with better-sqlite3,
 * but every call returns a Promise):
 *
 *   const row = await getDb().prepare("SELECT * FROM customers WHERE id = ?").get(id);
 */
export type Statement = {
  get<T = unknown>(...params: SqlParam[]): Promise<T | undefined>;
  all<T = unknown>(...params: SqlParam[]): Promise<T[]>;
  run(...params: SqlParam[]): Promise<{ changes: number }>;
};

export type Db = {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
};

const db: Db = {
  prepare(sql: string): Statement {
    return {
      get: (...params) => queryOne(sql, params),
      all: (...params) => query(sql, params),
      run: async (...params) => ({ changes: await execute(sql, params) }),
    };
  },
  async exec(sql: string) {
    await executor().query(sql);
  },
};

export function getDb(): Db {
  return db;
}

/** Creates/updates tables (schema.sql) and runs pending migrations. Idempotent. */
export async function applySchema(): Promise<void> {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await getPool().query(schema);
  await runMigrations();
}

let initPromise: Promise<void> | undefined;

/** Connects, applies the schema, and seeds prospect clinics. Call once at startup. */
export function initDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await applySchema();
      await importProspectClinicsIfEmpty();
    })();
  }
  return initPromise;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  initPromise = undefined;
}
