/**
 * One-off: copy all data from the old SQLite database into Postgres.
 *
 * Usage (from api/):
 *   npm run db:migrate-from-sqlite                       # uses ./data/vetfin.sqlite
 *   npm run db:migrate-from-sqlite -- path/to/file.sqlite
 *   npm run db:migrate-from-sqlite -- --truncate         # wipe Postgres tables first
 *
 * The Postgres connection comes from the same settings as the API
 * (DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD in .env / .env.local).
 * Everything runs in one transaction: either all data is copied, or nothing is.
 */
import dotenv from "dotenv";
import Database from "better-sqlite3";
import fs from "node:fs";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

// Imported after dotenv so the DB settings are loaded.
const { redactConnectionString, loadDatabaseConfig } = await import(
  "../src/config.js"
);
const { applySchema, closeDb, execute, query, withTransaction } = await import(
  "../src/db/connection.js"
);

// Parents before children, so foreign keys are satisfied.
const TABLES = [
  "vet_practices",
  "prospect_clinics",
  "customers",
  "loan_applications",
  "plaid_items",
  "bank_accounts",
  "bank_transactions",
] as const;

const BATCH_SIZE = 500;

const args = process.argv.slice(2);
const truncate = args.includes("--truncate");
const sqlitePath = args.find((a) => !a.startsWith("--")) ?? "./data/vetfin.sqlite";

if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}

const dbConfig = loadDatabaseConfig();
console.log(`From: ${sqlitePath}`);
console.log(`To:   ${redactConnectionString(dbConfig.connectionString)}\n`);

const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });

function sqliteTableExists(table: string): boolean {
  return Boolean(
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table),
  );
}

function sqliteColumns(table: string): string[] {
  return (
    sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((c) => c.name);
}

async function pgColumns(table: string): Promise<string[]> {
  const rows = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = ?
     ORDER BY ordinal_position`,
    [table],
  );
  return rows.map((r) => r.column_name);
}

async function pgCount(table: string): Promise<number> {
  const rows = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return rows[0]?.n ?? 0;
}

try {
  await applySchema();

  // Refuse to mix data unless asked to wipe first.
  if (!truncate) {
    const nonEmpty: string[] = [];
    for (const table of TABLES) {
      const n = await pgCount(table);
      if (n > 0) nonEmpty.push(`${table} (${n} rows)`);
    }
    if (nonEmpty.length > 0) {
      console.error(
        `Postgres already has data in: ${nonEmpty.join(", ")}.\n` +
          "Re-run with --truncate to replace it with the SQLite data.",
      );
      process.exit(1);
    }
  }

  const copied: Record<string, number> = {};

  await withTransaction(async () => {
    if (truncate) {
      await execute(`TRUNCATE ${TABLES.join(", ")} CASCADE`);
    }

    for (const table of TABLES) {
      if (!sqliteTableExists(table)) {
        console.log(`- ${table}: not in SQLite, skipped`);
        copied[table] = 0;
        continue;
      }

      const targetCols = new Set(await pgColumns(table));
      const sourceCols = sqliteColumns(table);
      const cols = sourceCols.filter((c) => targetCols.has(c));
      const dropped = sourceCols.filter((c) => !targetCols.has(c));
      if (dropped.length > 0) {
        console.warn(`  ! ${table}: columns not in Postgres, ignored: ${dropped.join(", ")}`);
      }

      const rows = sqlite
        .prepare(`SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM ${table}`)
        .raw()
        .all() as unknown[][];

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const placeholders = batch
          .map(() => `(${cols.map(() => "?").join(", ")})`)
          .join(", ");
        await execute(
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${placeholders}`,
          batch.flat() as Array<string | number | null>,
        );
      }

      copied[table] = rows.length;
      console.log(`- ${table}: ${rows.length} rows`);
    }
  });

  // Verify
  console.log("\nVerifying row counts…");
  let ok = true;
  for (const table of TABLES) {
    const expected = copied[table] ?? 0;
    const actual = await pgCount(table);
    const match = expected === actual;
    if (!match) ok = false;
    console.log(`  ${match ? "✓" : "✗"} ${table}: sqlite ${expected}, postgres ${actual}`);
  }

  if (!ok) {
    console.error("\nRow counts don't match — check the output above.");
    process.exitCode = 1;
  } else {
    console.log("\nDone. All data copied to Postgres.");
  }
} catch (err) {
  console.error("\nMigration failed — nothing was written to Postgres.\n");
  console.error(err);
  process.exitCode = 1;
} finally {
  sqlite.close();
  await closeDb();
}
