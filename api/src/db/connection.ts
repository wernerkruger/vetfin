import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../config.js";
import { runMigrations } from "./migrate.js";
import { importProspectClinicsIfEmpty } from "./prospectClinics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | undefined;

export function getDb(): Database.Database {
  if (db) return db;

  const { databasePath } = getConfig();
  const dir = path.dirname(databasePath);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schema = fs.readFileSync(
    path.join(__dirname, "schema.sql"),
    "utf8",
  );
  db.exec(schema);
  runMigrations(db);
  importProspectClinicsIfEmpty();

  return db;
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
