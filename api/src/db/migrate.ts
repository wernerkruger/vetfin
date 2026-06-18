import type Database from "better-sqlite3";

function columnExists(
  database: Database.Database,
  table: string,
  column: string,
): boolean {
  const cols = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  return cols.some((c) => c.name === column);
}

function tableExists(database: Database.Database, table: string): boolean {
  const row = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

export function runMigrations(database: Database.Database): void {
  if (!tableExists(database, "vet_practices")) {
    database.exec(`
      CREATE TABLE vet_practices (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_at TEXT,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        contact_name TEXT,
        phone TEXT,
        address_line1 TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_vet_practices_slug ON vet_practices(slug);
    `);
  }

  if (!columnExists(database, "plaid_items", "transactions_cursor")) {
    database.exec(
      "ALTER TABLE plaid_items ADD COLUMN transactions_cursor TEXT",
    );
  }

  for (const [col, def] of [
    ["applicant_name", "TEXT"],
    ["practice_id", "TEXT"],
    ["referral_slug", "TEXT"],
    ["password_hash", "TEXT"],
    ["first_name", "TEXT"],
    ["last_name", "TEXT"],
    ["phone", "TEXT"],
    ["date_of_birth", "TEXT"],
    ["ssn_last4", "TEXT"],
    ["address_line1", "TEXT"],
    ["address_line2", "TEXT"],
    ["city", "TEXT"],
    ["state", "TEXT"],
    ["zip", "TEXT"],
  ] as const) {
    if (!columnExists(database, "customers", col)) {
      database.exec(`ALTER TABLE customers ADD COLUMN ${col} ${def}`);
    }
  }

  if (!columnExists(database, "customers", "application_status")) {
    database.exec(
      "ALTER TABLE customers ADD COLUMN application_status TEXT NOT NULL DEFAULT 'draft'",
    );
  }

  if (!tableExists(database, "loan_applications")) {
    database.exec(`
      CREATE TABLE loan_applications (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        practice_id TEXT NOT NULL REFERENCES vet_practices(id),
        referral_slug TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        loan_amount REAL,
        service_type TEXT,
        animal_type TEXT,
        animal_name TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_loan_applications_customer ON loan_applications(customer_id);
      CREATE INDEX IF NOT EXISTS idx_loan_applications_practice ON loan_applications(practice_id);
    `);
  }

  for (const [col, def] of [
    ["amount_repaid", "REAL NOT NULL DEFAULT 0"],
    ["monthly_payment", "REAL"],
    ["term_months", "INTEGER"],
    ["term_months_remaining", "INTEGER"],
    ["interest_rate", "REAL"],
    ["approved_at", "TEXT"],
    ["vet_approved", "INTEGER"],
    ["vet_reviewed_at", "TEXT"],
  ] as const) {
    if (!columnExists(database, "loan_applications", col)) {
      database.exec(`ALTER TABLE loan_applications ADD COLUMN ${col} ${def}`);
    }
  }

  if (columnExists(database, "customers", "practice_id")) {
    database.exec(
      "CREATE INDEX IF NOT EXISTS idx_customers_practice ON customers(practice_id)",
    );
  }

  if (!columnExists(database, "bank_accounts", "customer_id")) {
    database.exec(
      "ALTER TABLE bank_accounts ADD COLUMN customer_id TEXT REFERENCES customers(id)",
    );
    database.exec(`
      UPDATE bank_accounts
      SET customer_id = (
        SELECT pi.customer_id FROM plaid_items pi
        WHERE pi.id = bank_accounts.plaid_item_id
      )
      WHERE customer_id IS NULL
    `);
  }

  if (!columnExists(database, "bank_accounts", "loan_application_id")) {
    database.exec(
      "ALTER TABLE bank_accounts ADD COLUMN loan_application_id TEXT REFERENCES loan_applications(id)",
    );
  }

  if (!columnExists(database, "bank_transactions", "customer_id")) {
    database.exec(
      "ALTER TABLE bank_transactions ADD COLUMN customer_id TEXT REFERENCES customers(id)",
    );
    database.exec(`
      UPDATE bank_transactions
      SET customer_id = (
        SELECT ba.customer_id FROM bank_accounts ba
        WHERE ba.id = bank_transactions.bank_account_id
      )
      WHERE customer_id IS NULL
    `);
    database.exec(`
      UPDATE bank_transactions
      SET customer_id = (
        SELECT pi.customer_id FROM bank_accounts ba
        INNER JOIN plaid_items pi ON pi.id = ba.plaid_item_id
        WHERE ba.id = bank_transactions.bank_account_id
      )
      WHERE customer_id IS NULL
    `);
  }

  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_bank_accounts_customer ON bank_accounts(customer_id)",
  );
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_bank_accounts_loan_application ON bank_accounts(loan_application_id)",
  );
  if (!columnExists(database, "bank_transactions", "loan_application_id")) {
    database.exec(
      "ALTER TABLE bank_transactions ADD COLUMN loan_application_id TEXT REFERENCES loan_applications(id)",
    );
    database.exec(`
      UPDATE bank_transactions
      SET loan_application_id = (
        SELECT ba.loan_application_id FROM bank_accounts ba
        WHERE ba.id = bank_transactions.bank_account_id
      )
      WHERE loan_application_id IS NULL
    `);
  }

  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_bank_transactions_customer ON bank_transactions(customer_id)",
  );
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_bank_transactions_loan_application ON bank_transactions(loan_application_id)",
  );

  for (const table of ["customers", "vet_practices"] as const) {
    if (!columnExists(database, table, "failed_login_attempts")) {
      database.exec(
        `ALTER TABLE ${table} ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0`,
      );
    }
    if (!columnExists(database, table, "locked_at")) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN locked_at TEXT`);
    }
    if (!columnExists(database, table, "must_change_password")) {
      database.exec(
        `ALTER TABLE ${table} ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0`,
      );
    }
  }
}
