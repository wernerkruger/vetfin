import { randomUUID } from "node:crypto";
import type {
  LinkedPlaidAccount,
  PlaidTransactionPayload,
} from "../plaid/client.js";
import { decryptSecret, encryptSecret } from "../crypto/secrets.js";
import { getConfig } from "../config.js";
import { getDb, withTransaction } from "./connection.js";

export type CustomerRow = {
  id: string;
  client_user_id: string;
  email: string | null;
  applicant_name: string | null;
  practice_id: string | null;
  referral_slug: string | null;
  application_status: string;
  created_at: string;
  updated_at: string;
};

export type PlaidItemRow = {
  id: string;
  customer_id: string;
  item_id: string;
  access_token: string;
  institution_id: string | null;
  institution_name: string | null;
  transactions_cursor: string | null;
  created_at: string;
  updated_at: string;
};

export type BankAccountRow = {
  id: string;
  customer_id: string;
  loan_application_id: string | null;
  plaid_item_id: string;
  plaid_account_id: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  type: string;
  official_name: string | null;
  routing: string | null;
  account_number: string | null;
  owners_json: string;
  created_at: string;
  updated_at: string;
};

export type BankTransactionRow = {
  id: string;
  customer_id: string;
  loan_application_id: string | null;
  bank_account_id: string;
  plaid_transaction_id: string;
  plaid_account_id: string;
  amount: number;
  iso_currency_code: string | null;
  date: string;
  name: string;
  merchant_name: string | null;
  category_json: string;
  pending: number;
  payment_channel: string | null;
  created_at: string;
  updated_at: string;
};

export function protectSecret(value: string): string {
  const key = getConfig().dataEncryptionKey;
  return key ? encryptSecret(value, key) : value;
}

export function revealSecret(value: string): string {
  const key = getConfig().dataEncryptionKey;
  return key ? decryptSecret(value, key) : value;
}

export async function upsertCustomer(input: {
  clientUserId: string;
  email?: string;
}): Promise<CustomerRow> {
  const database = getDb();
  const existing = (await database
    .prepare("SELECT * FROM customers WHERE client_user_id = ?")
    .get(input.clientUserId)) as CustomerRow | undefined;

  if (existing) {
    if (input.email && input.email !== existing.email) {
      await database
        .prepare(
          "UPDATE customers SET email = ?, updated_at = now_text() WHERE id = ?",
        )
        .run(input.email, existing.id);
      return (await database
        .prepare("SELECT * FROM customers WHERE id = ?")
        .get(existing.id)) as CustomerRow;
    }
    return existing;
  }

  const id = randomUUID();
  await database
    .prepare(
      `INSERT INTO customers (id, client_user_id, email)
       VALUES (?, ?, ?)`,
    )
    .run(id, input.clientUserId, input.email ?? null);

  return (await database
    .prepare("SELECT * FROM customers WHERE id = ?")
    .get(id)) as CustomerRow;
}

export async function getCustomerById(
  id: string,
): Promise<CustomerRow | undefined> {
  return (await getDb()
    .prepare("SELECT * FROM customers WHERE id = ?")
    .get(id)) as CustomerRow | undefined;
}

export async function savePlaidItem(input: {
  customerId: string;
  itemId: string;
  accessToken: string;
  institutionId?: string | null;
  institutionName?: string | null;
}): Promise<PlaidItemRow> {
  const database = getDb();
  const existing = (await database
    .prepare("SELECT * FROM plaid_items WHERE customer_id = ? AND item_id = ?")
    .get(input.customerId, input.itemId)) as PlaidItemRow | undefined;

  const protectedToken = protectSecret(input.accessToken);

  if (existing) {
    await database
      .prepare(
        `UPDATE plaid_items
         SET access_token = ?, institution_id = ?, institution_name = ?,
             updated_at = now_text()
         WHERE id = ?`,
      )
      .run(
        protectedToken,
        input.institutionId ?? null,
        input.institutionName ?? null,
        existing.id,
      );
    return (await database
      .prepare("SELECT * FROM plaid_items WHERE id = ?")
      .get(existing.id)) as PlaidItemRow;
  }

  const id = randomUUID();
  await database
    .prepare(
      `INSERT INTO plaid_items (
        id, customer_id, item_id, access_token, institution_id, institution_name
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.customerId,
      input.itemId,
      protectedToken,
      input.institutionId ?? null,
      input.institutionName ?? null,
    );

  return (await database
    .prepare("SELECT * FROM plaid_items WHERE id = ?")
    .get(id)) as PlaidItemRow;
}

export async function getLatestPlaidItemForCustomer(
  customerId: string,
): Promise<(PlaidItemRow & { access_token_plain: string }) | undefined> {
  const row = (await getDb()
    .prepare(
      `SELECT * FROM plaid_items
       WHERE customer_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(customerId)) as PlaidItemRow | undefined;

  if (!row) return undefined;

  return {
    ...row,
    access_token_plain: revealSecret(row.access_token),
  };
}

export type SaveLinkedAccountsInput = {
  customerId: string;
  plaidItemId: string;
  accounts: LinkedPlaidAccount[];
  loanApplicationId?: string | null;
};

export async function saveLinkedBankAccounts(
  input: SaveLinkedAccountsInput | string,
  accountsLegacy?: LinkedPlaidAccount[],
): Promise<BankAccountRow[]> {
  const inputNorm: SaveLinkedAccountsInput =
    typeof input === "string"
      ? {
          customerId: await getCustomerIdForPlaidItem(input),
          plaidItemId: input,
          accounts: accountsLegacy ?? [],
        }
      : input;

  const { customerId, plaidItemId, accounts, loanApplicationId } = inputNorm;
  const database = getDb();
  const find = database.prepare(
    "SELECT * FROM bank_accounts WHERE plaid_item_id = ? AND plaid_account_id = ?",
  );
  const insert = database.prepare(
    `INSERT INTO bank_accounts (
      id, customer_id, loan_application_id, plaid_item_id, plaid_account_id,
      name, mask, subtype, type, official_name, routing, account_number, owners_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = database.prepare(
    `UPDATE bank_accounts SET
      customer_id = ?, loan_application_id = ?,
      name = ?, mask = ?, subtype = ?, type = ?, official_name = ?,
      routing = ?, account_number = ?, owners_json = ?,
      updated_at = now_text()
     WHERE id = ?`,
  );

  const saved: BankAccountRow[] = [];

  for (const account of accounts) {
    const routing = account.ach?.routing ?? null;
    const accountNumber = account.ach
      ? protectSecret(account.ach.account)
      : null;
    const ownersJson = JSON.stringify(account.owners);
    const existing = (await find.get(plaidItemId, account.accountId)) as
      BankAccountRow | undefined;

    if (existing) {
      await update.run(
        customerId,
        loanApplicationId ?? existing.loan_application_id,
        account.name,
        account.mask,
        account.subtype,
        account.type,
        account.officialName,
        routing,
        accountNumber,
        ownersJson,
        existing.id,
      );
    } else {
      await insert.run(
        randomUUID(),
        customerId,
        loanApplicationId ?? null,
        plaidItemId,
        account.accountId,
        account.name,
        account.mask,
        account.subtype,
        account.type,
        account.officialName,
        routing,
        accountNumber,
        ownersJson,
      );
    }

    saved.push(
      (await find.get(plaidItemId, account.accountId)) as BankAccountRow,
    );
  }

  return saved;
}

async function getCustomerIdForPlaidItem(plaidItemId: string): Promise<string> {
  const row = (await getDb()
    .prepare("SELECT customer_id FROM plaid_items WHERE id = ?")
    .get(plaidItemId)) as { customer_id: string } | undefined;
  if (!row) {
    throw new Error(`Plaid item not found: ${plaidItemId}`);
  }
  return row.customer_id;
}

async function getBankAccountIdMap(
  plaidItemId: string,
  plaidAccountIds: string[],
): Promise<Map<string, string>> {
  const database = getDb();
  const map = new Map<string, string>();
  const stmt = database.prepare(
    "SELECT id, plaid_account_id FROM bank_accounts WHERE plaid_item_id = ? AND plaid_account_id = ?",
  );
  for (const plaidAccountId of plaidAccountIds) {
    const row = (await stmt.get(plaidItemId, plaidAccountId)) as
      { id: string; plaid_account_id: string } | undefined;
    if (row) map.set(plaidAccountId, row.id);
  }
  return map;
}

export async function getTransactionsCursor(
  plaidItemId: string,
): Promise<string | null> {
  const row = (await getDb()
    .prepare("SELECT transactions_cursor FROM plaid_items WHERE id = ?")
    .get(plaidItemId)) as { transactions_cursor: string | null } | undefined;
  return row?.transactions_cursor ?? null;
}

export async function setTransactionsCursor(
  plaidItemId: string,
  cursor: string | null,
): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE plaid_items SET transactions_cursor = ?, updated_at = now_text() WHERE id = ?`,
    )
    .run(cursor, plaidItemId);
}

export async function applyTransactionSync(
  customerId: string,
  plaidItemId: string,
  linkedPlaidAccountIds: string[],
  sync: {
    added: PlaidTransactionPayload[];
    modified: PlaidTransactionPayload[];
    removed: string[];
    cursor: string | null;
  },
  loanApplicationId?: string | null,
): Promise<{ added: number; modified: number; removed: number }> {
  const allowed = new Set(linkedPlaidAccountIds);
  const accountMap = await getBankAccountIdMap(
    plaidItemId,
    linkedPlaidAccountIds,
  );
  const database = getDb();

  const upsert = database.prepare(
    `INSERT INTO bank_transactions (
      id, customer_id, loan_application_id, bank_account_id, plaid_transaction_id,
      plaid_account_id, amount, iso_currency_code, date, name, merchant_name,
      category_json, pending, payment_channel
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(plaid_transaction_id) DO UPDATE SET
      customer_id = excluded.customer_id,
      loan_application_id = excluded.loan_application_id,
      bank_account_id = excluded.bank_account_id,
      amount = excluded.amount,
      iso_currency_code = excluded.iso_currency_code,
      date = excluded.date,
      name = excluded.name,
      merchant_name = excluded.merchant_name,
      category_json = excluded.category_json,
      pending = excluded.pending,
      payment_channel = excluded.payment_channel,
      updated_at = now_text()`,
  );

  const remove = database.prepare(
    "DELETE FROM bank_transactions WHERE plaid_transaction_id = ?",
  );

  let added = 0;
  let modified = 0;

  const write = async (rows: PlaidTransactionPayload[], isNew: boolean) => {
    for (const tx of rows) {
      if (!allowed.has(tx.accountId)) continue;
      const bankAccountId = accountMap.get(tx.accountId);
      if (!bankAccountId) continue;

      await upsert.run(
        randomUUID(),
        customerId,
        loanApplicationId ?? null,
        bankAccountId,
        tx.transactionId,
        tx.accountId,
        tx.amount,
        tx.isoCurrencyCode,
        tx.date,
        tx.name,
        tx.merchantName,
        JSON.stringify(tx.categories),
        tx.pending ? 1 : 0,
        tx.paymentChannel,
      );
      if (isNew) added += 1;
      else modified += 1;
    }
  };

  let removed = 0;
  await withTransaction(async () => {
    await write(sync.added, true);
    await write(sync.modified, false);

    for (const transactionId of sync.removed) {
      removed += (await remove.run(transactionId)).changes;
    }

    await setTransactionsCursor(plaidItemId, sync.cursor);
  });

  return { added, modified, removed };
}

export async function getTransactionsForCustomer(
  customerId: string,
  options?: { bankAccountId?: string; limit?: number },
) {
  const limit = options?.limit ?? 500;
  const params: string[] = [customerId];
  let accountFilter = "";

  if (options?.bankAccountId) {
    accountFilter = " AND bt.bank_account_id = ?";
    params.push(options.bankAccountId);
  }

  const rows = (await getDb()
    .prepare(
      `SELECT bt.* FROM bank_transactions bt
       WHERE bt.customer_id = ?${accountFilter}
       ORDER BY bt.date DESC, bt.created_at DESC, bt.id
       LIMIT ?`,
    )
    .all(...params, limit)) as BankTransactionRow[];

  return rows.map(toPublicTransaction);
}

function toPublicTransaction(row: BankTransactionRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    loanApplicationId: row.loan_application_id,
    bankAccountId: row.bank_account_id,
    plaidTransactionId: row.plaid_transaction_id,
    plaidAccountId: row.plaid_account_id,
    amount: row.amount,
    isoCurrencyCode: row.iso_currency_code,
    date: row.date,
    name: row.name,
    merchantName: row.merchant_name,
    categories: JSON.parse(row.category_json) as string[],
    pending: Boolean(row.pending),
    paymentChannel: row.payment_channel,
    createdAt: row.created_at,
  };
}

export async function getTransactionCountsByAccount(
  customerId: string,
): Promise<Record<string, number>> {
  const rows = (await getDb()
    .prepare(
      `SELECT bank_account_id, COUNT(*) AS count
       FROM bank_transactions
       WHERE customer_id = ?
       GROUP BY bank_account_id`,
    )
    .all(customerId)) as Array<{ bank_account_id: string; count: number }>;

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.bank_account_id] = row.count;
  }
  return counts;
}

export async function getCustomerProfile(customerId: string) {
  const customer = await getCustomerById(customerId);
  if (!customer) return undefined;

  const plaidItems = (await getDb()
    .prepare(
      "SELECT * FROM plaid_items WHERE customer_id = ? ORDER BY created_at DESC, id",
    )
    .all(customerId)) as PlaidItemRow[];

  const bankAccounts = (await getDb()
    .prepare(
      `SELECT * FROM bank_accounts
       WHERE customer_id = ?
       ORDER BY created_at DESC, id`,
    )
    .all(customerId)) as BankAccountRow[];

  const transactionCounts = await getTransactionCountsByAccount(customerId);

  return {
    customer: {
      id: customer.id,
      clientUserId: customer.client_user_id,
      email: customer.email,
      createdAt: customer.created_at,
      updatedAt: customer.updated_at,
    },
    plaidItems: plaidItems.map((item) => ({
      id: item.id,
      itemId: item.item_id,
      institutionId: item.institution_id,
      institutionName: item.institution_name,
      createdAt: item.created_at,
    })),
    bankAccounts: bankAccounts.map((account) => ({
      id: account.id,
      customerId: account.customer_id,
      loanApplicationId: account.loan_application_id,
      plaidItemId: account.plaid_item_id,
      plaidAccountId: account.plaid_account_id,
      name: account.name,
      mask: account.mask,
      subtype: account.subtype,
      type: account.type,
      officialName: account.official_name,
      routing: account.routing,
      accountNumberMask: account.account_number
        ? maskAccountNumber(revealSecret(account.account_number))
        : null,
      owners: JSON.parse(account.owners_json) as LinkedPlaidAccount["owners"],
      transactionCount: transactionCounts[account.id] ?? 0,
      createdAt: account.created_at,
    })),
  };
}

function maskAccountNumber(account: string): string {
  if (account.length <= 4) return "****";
  return `****${account.slice(-4)}`;
}

export function toPublicCustomer(row: CustomerRow) {
  return {
    id: row.id,
    clientUserId: row.client_user_id,
    email: row.email,
    applicantName: row.applicant_name ?? null,
    practiceId: row.practice_id ?? null,
    referralSlug: row.referral_slug ?? null,
    applicationStatus: row.application_status ?? "started",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
