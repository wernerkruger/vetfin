CREATE TABLE IF NOT EXISTS vet_practices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  address_line1 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  client_user_id TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loan_applications (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES vet_practices(id),
  referral_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  loan_amount REAL,
  service_type TEXT,
  animal_type TEXT,
  animal_name TEXT,
  amount_repaid REAL NOT NULL DEFAULT 0,
  monthly_payment REAL,
  term_months INTEGER,
  term_months_remaining INTEGER,
  interest_rate REAL,
  approved_at TEXT,
  vet_approved INTEGER,
  vet_reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plaid_items (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  transactions_cursor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(plaid_item_id, plaid_account_id)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  loan_application_id TEXT REFERENCES loan_applications(id) ON DELETE SET NULL,
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  plaid_transaction_id TEXT NOT NULL,
  plaid_account_id TEXT NOT NULL,
  amount REAL NOT NULL,
  iso_currency_code TEXT,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  merchant_name TEXT,
  category_json TEXT NOT NULL DEFAULT '[]',
  pending INTEGER NOT NULL DEFAULT 0,
  payment_channel TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(plaid_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_vet_practices_slug ON vet_practices(slug);
-- idx_customers_practice is created in migrate.ts after practice_id column exists
CREATE INDEX IF NOT EXISTS idx_plaid_items_customer ON plaid_items(customer_id);
-- bank_accounts / bank_transactions customer_id indexes created in migrate.ts
CREATE INDEX IF NOT EXISTS idx_bank_accounts_plaid_item ON bank_accounts(plaid_item_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(date);
