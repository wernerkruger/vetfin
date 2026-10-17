-- VetFin Postgres schema. Safe to run on every startup (idempotent).
--
-- Timestamps are stored as UTC text 'YYYY-MM-DD HH24:MI:SS' and flags as 0/1 integers,
-- exactly like the original SQLite schema, so existing data and app code keep working.

CREATE OR REPLACE FUNCTION now_text() RETURNS TEXT
  LANGUAGE sql STABLE
  AS $$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') $$;

CREATE TABLE IF NOT EXISTS vet_practices (
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
  prospect_clinic_id TEXT,
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_at TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  applicant_name TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  date_of_birth TEXT,
  ssn_last4 TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  practice_id TEXT REFERENCES vet_practices(id),
  referral_slug TEXT,
  application_status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS loan_applications (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES vet_practices(id),
  referral_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  loan_amount DOUBLE PRECISION,
  service_type TEXT,
  animal_type TEXT,
  animal_name TEXT,
  amount_repaid DOUBLE PRECISION NOT NULL DEFAULT 0,
  monthly_payment DOUBLE PRECISION,
  term_months INTEGER,
  term_months_remaining INTEGER,
  interest_rate DOUBLE PRECISION,
  approved_at TEXT,
  vet_approved INTEGER,
  vet_reviewed_at TEXT,
  disbursement_status TEXT,
  disbursed_at TEXT,
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT NOT NULL DEFAULT now_text()
);

CREATE TABLE IF NOT EXISTS plaid_items (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  transactions_cursor TEXT,
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT NOT NULL DEFAULT now_text(),
  UNIQUE(customer_id, item_id)
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_application_id TEXT REFERENCES loan_applications(id) ON DELETE SET NULL,
  plaid_item_id TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
  plaid_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mask TEXT,
  subtype TEXT,
  type TEXT NOT NULL,
  official_name TEXT,
  routing TEXT,
  account_number TEXT,
  owners_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT NOT NULL DEFAULT now_text(),
  UNIQUE(plaid_item_id, plaid_account_id)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_application_id TEXT REFERENCES loan_applications(id) ON DELETE SET NULL,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT NOT NULL,
  plaid_account_id TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  iso_currency_code TEXT,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  merchant_name TEXT,
  category_json TEXT NOT NULL DEFAULT '[]',
  pending INTEGER NOT NULL DEFAULT 0,
  payment_channel TEXT,
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT NOT NULL DEFAULT now_text(),
  UNIQUE(plaid_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_vet_practices_slug ON vet_practices(slug);

CREATE TABLE IF NOT EXISTS prospect_clinics (
  id TEXT PRIMARY KEY,
  category TEXT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  state_short TEXT,
  phone TEXT,
  website TEXT,
  rating DOUBLE PRECISION,
  source_url TEXT,
  email TEXT,
  signed_up INTEGER NOT NULL DEFAULT 0,
  practice_id TEXT,
  created_at TEXT NOT NULL DEFAULT now_text(),
  updated_at TEXT NOT NULL DEFAULT now_text()
);

CREATE INDEX IF NOT EXISTS idx_prospect_clinics_name ON prospect_clinics(name);
CREATE INDEX IF NOT EXISTS idx_prospect_clinics_signed_up ON prospect_clinics(signed_up);
CREATE INDEX IF NOT EXISTS idx_prospect_clinics_city ON prospect_clinics(city);
CREATE INDEX IF NOT EXISTS idx_prospect_clinics_state_short ON prospect_clinics(state_short);
CREATE INDEX IF NOT EXISTS idx_customers_practice ON customers(practice_id);
CREATE INDEX IF NOT EXISTS idx_loan_applications_customer ON loan_applications(customer_id);
CREATE INDEX IF NOT EXISTS idx_loan_applications_practice ON loan_applications(practice_id);
CREATE INDEX IF NOT EXISTS idx_plaid_items_customer ON plaid_items(customer_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_customer ON bank_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_loan_application ON bank_accounts(loan_application_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_customer ON bank_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_loan_application ON bank_transactions(loan_application_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_plaid_item ON bank_accounts(plaid_item_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(date);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT now_text()
);
