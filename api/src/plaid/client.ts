import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  DepositoryAccountSubtype,
  type Transaction,
} from "plaid";
import type { AppConfig } from "../config.js";

/** First Platypus Bank — same non-OAuth sandbox institution Lawfi uses. */
export const SANDBOX_INSTITUTION_ID = "ins_109508";

const CLIENT_NAME = "VetFin";

export function createPlaidClient(config: AppConfig): PlaidApi {
  const basePath =
    config.plaidEnv === "sandbox"
      ? PlaidEnvironments.sandbox
      : PlaidEnvironments.production;

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": config.plaidClientId,
        "PLAID-SECRET": config.plaidSecret,
      },
    },
  });

  return new PlaidApi(configuration);
}

export type LinkTokenOptions = {
  clientUserId: string;
  accessToken?: string;
};

export async function createLinkToken(
  plaid: PlaidApi,
  { clientUserId, accessToken }: LinkTokenOptions,
): Promise<string> {
  const response = await plaid.linkTokenCreate({
    user: { client_user_id: clientUserId },
    client_name: CLIENT_NAME,
    products: [Products.Auth, Products.Identity, Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
    access_token: accessToken,
    account_filters: {
      depository: {
        account_subtypes: [
          DepositoryAccountSubtype.Checking,
          DepositoryAccountSubtype.Savings,
        ],
      },
    },
    auth: {
      auth_type_select_enabled: true,
      automated_microdeposits_enabled: true,
      same_day_microdeposits_enabled: true,
    },
  });

  return response.data.link_token;
}

export async function exchangePublicToken(
  plaid: PlaidApi,
  publicToken: string,
): Promise<{ accessToken: string; itemId: string }> {
  const response = await plaid.itemPublicTokenExchange({
    public_token: publicToken,
  });

  return {
    accessToken: response.data.access_token,
    itemId: response.data.item_id,
  };
}

export async function createSandboxPublicToken(
  plaid: PlaidApi,
  institutionId: string = SANDBOX_INSTITUTION_ID,
): Promise<string> {
  const response = await plaid.sandboxPublicTokenCreate({
    institution_id: institutionId,
    initial_products: [
      Products.Auth,
      Products.Identity,
      Products.Transactions,
    ],
  });

  return response.data.public_token;
}

export type AccountSummary = {
  accountId: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  type: string;
  officialName: string | null;
};

export type AchNumber = {
  accountId: string;
  account: string;
  routing: string;
};

function filterByAccountIds<T extends { accountId: string }>(
  rows: T[],
  accountIds?: string[],
): T[] {
  if (!accountIds?.length) return rows;
  const allowed = new Set(accountIds);
  return rows.filter((row) => allowed.has(row.accountId));
}

export async function listAccounts(plaid: PlaidApi, accessToken: string) {
  const response = await plaid.accountsGet({ access_token: accessToken });

  return response.data.accounts.map((a) => ({
    accountId: a.account_id,
    name: a.name,
    mask: a.mask,
    subtype: a.subtype,
    type: a.type,
    officialName: a.official_name ?? null,
  })) satisfies AccountSummary[];
}

export async function getAuthSummary(
  plaid: PlaidApi,
  accessToken: string,
  accountIds?: string[],
) {
  const response = await plaid.authGet({ access_token: accessToken });

  const accounts = response.data.accounts.map((a) => ({
    accountId: a.account_id,
    name: a.name,
    mask: a.mask,
    subtype: a.subtype,
    type: a.type,
    officialName: a.official_name ?? null,
  })) satisfies AccountSummary[];

  const numbers =
    response.data.numbers.ach?.map((n) => ({
      accountId: n.account_id,
      account: n.account,
      routing: n.routing,
    })) ?? [];

  return {
    accounts: filterByAccountIds(accounts, accountIds),
    numbers: filterByAccountIds(numbers, accountIds),
  };
}

export async function getLinkedAccountData(
  plaid: PlaidApi,
  accessToken: string,
  accountIds: string[],
) {
  const [auth, identity] = await Promise.all([
    getAuthSummary(plaid, accessToken, accountIds),
    plaid.identityGet({ access_token: accessToken }),
  ]);

  const ownersByAccount = new Map(
    identity.data.accounts
      .filter((a) => accountIds.includes(a.account_id))
      .map((a) => [
        a.account_id,
        a.owners.map((o) => ({
          names: o.names,
          emails: o.emails?.map((e) => e.data) ?? [],
          phoneNumbers: o.phone_numbers?.map((p) => p.data) ?? [],
        })),
      ]),
  );

  return {
    accounts: auth.accounts.map((account) => ({
      ...account,
      owners: ownersByAccount.get(account.accountId) ?? [],
      ach: auth.numbers.find((n) => n.accountId === account.accountId) ?? null,
    })),
  };
}

export type LinkedPlaidAccount = Awaited<
  ReturnType<typeof getLinkedAccountData>
>["accounts"][number];

export type PlaidTransactionPayload = {
  transactionId: string;
  accountId: string;
  amount: number;
  isoCurrencyCode: string | null;
  date: string;
  name: string;
  merchantName: string | null;
  categories: string[];
  pending: boolean;
  paymentChannel: string | null;
};

function mapPlaidTransaction(t: Transaction): PlaidTransactionPayload {
  return {
    transactionId: t.transaction_id,
    accountId: t.account_id,
    amount: t.amount,
    isoCurrencyCode: t.iso_currency_code,
    date: t.date,
    name: t.name,
    merchantName: t.merchant_name ?? null,
    categories: t.category ?? [],
    pending: t.pending,
    paymentChannel: t.payment_channel,
  };
}

/** Incremental sync via /transactions/sync (all pages). */
export async function syncTransactions(
  plaid: PlaidApi,
  accessToken: string,
  cursor?: string | null,
) {
  let currentCursor = cursor ?? undefined;
  const added: PlaidTransactionPayload[] = [];
  const modified: PlaidTransactionPayload[] = [];
  const removed: string[] = [];

  for (;;) {
    const response = await plaid.transactionsSync({
      access_token: accessToken,
      cursor: currentCursor,
    });
    const data = response.data;

    for (const t of data.added) {
      added.push(mapPlaidTransaction(t));
    }
    for (const t of data.modified) {
      modified.push(mapPlaidTransaction(t));
    }
    for (const t of data.removed) {
      removed.push(t.transaction_id);
    }

    currentCursor = data.next_cursor;
    if (!data.has_more) break;
  }

  return {
    added,
    modified,
    removed,
    cursor: currentCursor ?? null,
  };
}
