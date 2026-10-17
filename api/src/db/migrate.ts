import { execute, getDb, query, withTransaction } from "./connection.js";

/**
 * Schema changes after the initial Postgres schema (schema.sql).
 *
 * The old SQLite column-by-column migrations are no longer needed: schema.sql
 * already describes the full current schema. Add future changes here as new
 * entries with a unique id — each runs once, in order, inside a transaction.
 *
 * Example:
 *   { id: "2026-10-10-add-loan-notes", sql: "ALTER TABLE loan_applications ADD COLUMN notes TEXT" },
 */
const migrations: Array<{ id: string; sql: string }> = [
  {
    // Repayment plan chosen by the borrower + Truth in Lending acceptance record.
    id: "2026-10-03-repayment-plan-and-tila",
    sql: `
      ALTER TABLE loan_applications
        ADD COLUMN IF NOT EXISTS amount_financed DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS origination_fee DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS final_payment DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS finance_charge DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS total_of_payments DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS apr DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS plan_selected_at TEXT,
        ADD COLUMN IF NOT EXISTS first_payment_due_date TEXT,
        ADD COLUMN IF NOT EXISTS tila_accepted_at TEXT,
        ADD COLUMN IF NOT EXISTS tila_signature_name TEXT,
        ADD COLUMN IF NOT EXISTS tila_esign_consent_at TEXT,
        ADD COLUMN IF NOT EXISTS tila_ip_address TEXT,
        ADD COLUMN IF NOT EXISTS tila_user_agent TEXT,
        ADD COLUMN IF NOT EXISTS tila_disclosure_json TEXT
    `,
  },
  {
    // The 2% origination fee is paid up front; funding is blocked until it's recorded as paid.
    id: "2026-10-03-origination-fee-paid",
    sql: `
      ALTER TABLE loan_applications
        ADD COLUMN IF NOT EXISTS origination_fee_paid_at TEXT,
        ADD COLUMN IF NOT EXISTS origination_fee_marked_paid_by TEXT
    `,
  },
  {
    // Loan servicing: per-loan payment schedule, payments received, contact notes,
    // admin audit log, and cancel / write-off details.
    id: "2026-10-03-loan-servicing",
    sql: `
      ALTER TABLE loan_applications
        ADD COLUMN IF NOT EXISTS cancelled_at TEXT,
        ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
        ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
        ADD COLUMN IF NOT EXISTS written_off_at TEXT,
        ADD COLUMN IF NOT EXISTS written_off_by TEXT,
        ADD COLUMN IF NOT EXISTS write_off_reason TEXT,
        ADD COLUMN IF NOT EXISTS written_off_amount DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS paid_off_at TEXT;

      CREATE TABLE IF NOT EXISTS loan_installments (
        id TEXT PRIMARY KEY,
        loan_application_id TEXT NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
        number INTEGER NOT NULL,
        due_date TEXT NOT NULL,
        original_due_date TEXT NOT NULL,
        amount_due DOUBLE PRECISION NOT NULL,
        principal DOUBLE PRECISION NOT NULL,
        interest DOUBLE PRECISION NOT NULL,
        amount_paid DOUBLE PRECISION NOT NULL DEFAULT 0,
        -- scheduled | partial | paid | closed_early | written_off
        status TEXT NOT NULL DEFAULT 'scheduled',
        paid_at TEXT,
        created_at TEXT NOT NULL DEFAULT now_text(),
        updated_at TEXT NOT NULL DEFAULT now_text(),
        UNIQUE (loan_application_id, number)
      );
      CREATE INDEX IF NOT EXISTS idx_loan_installments_due ON loan_installments(due_date);

      CREATE TABLE IF NOT EXISTS loan_payments (
        id TEXT PRIMARY KEY,
        loan_application_id TEXT NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
        amount DOUBLE PRECISION NOT NULL,
        received_on TEXT NOT NULL,
        method TEXT NOT NULL,
        reference TEXT,
        -- regular | payoff
        kind TEXT NOT NULL DEFAULT 'regular',
        recorded_by TEXT NOT NULL,
        voided_at TEXT,
        voided_by TEXT,
        void_reason TEXT,
        created_at TEXT NOT NULL DEFAULT now_text()
      );
      CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_application_id);

      CREATE TABLE IF NOT EXISTS loan_notes (
        id TEXT PRIMARY KEY,
        loan_application_id TEXT NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        -- phone | email | sms | in_person | other | null (internal note)
        contact_method TEXT,
        author TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT now_text()
      );
      CREATE INDEX IF NOT EXISTS idx_loan_notes_loan ON loan_notes(loan_application_id);

      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id TEXT PRIMARY KEY,
        loan_application_id TEXT REFERENCES loan_applications(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        reason TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT now_text()
      );
      CREATE INDEX IF NOT EXISTS idx_admin_audit_log_loan ON admin_audit_log(loan_application_id);
    `,
  },
];

export async function runMigrations(): Promise<void> {
  const applied = new Set(
    (await query<{ id: string }>("SELECT id FROM schema_migrations")).map(
      (r) => r.id,
    ),
  );
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await withTransaction(async () => {
      // exec = simple query protocol, so one migration can hold several statements.
      await getDb().exec(migration.sql);
      await execute("INSERT INTO schema_migrations (id) VALUES (?)", [
        migration.id,
      ]);
    });
    console.log(`Applied migration ${migration.id}`);
  }
}
