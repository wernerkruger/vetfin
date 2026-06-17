import { Router } from "express";
import { z } from "zod";
import type { PlaidApi } from "plaid";
import {
  createLinkToken,
  createSandboxPublicToken,
  exchangePublicToken,
  getAuthSummary,
  getLinkedAccountData,
  listAccounts,
  syncTransactions,
  SANDBOX_INSTITUTION_ID,
} from "../plaid/client.js";
import { getConfig } from "../config.js";
import {
  applyTransactionSync,
  getCustomerProfile,
  getLatestPlaidItemForCustomer,
  getTransactionsCursor,
  getTransactionsForCustomer,
  saveLinkedBankAccounts,
  savePlaidItem,
} from "../db/store.js";
import { requireCustomer } from "./customers.js";

const customerIdField = z.object({
  customerId: z.string().uuid(),
});

const linkTokenBody = customerIdField.extend({
  clientUserId: z.string().min(1).optional(),
});

const exchangeBody = customerIdField.extend({
  publicToken: z.string().min(1),
  institutionId: z.string().optional(),
  institutionName: z.string().optional(),
});

const sandboxExchangeBody = customerIdField;

const linkedAccountsBody = customerIdField.extend({
  accountIds: z.array(z.string().min(1)).min(1),
});

const transactionSyncBody = customerIdField.extend({
  accountIds: z.array(z.string().min(1)).optional(),
});

const sandboxPublicTokenQuery = z.object({
  institutionId: z.string().default(SANDBOX_INSTITUTION_ID),
});

export function plaidRouter(plaid: PlaidApi): Router {
  const router = Router();
  const config = getConfig();

  router.get("/status", (_req, res) => {
    res.json({
      environment: config.plaidEnv,
      sandboxInstitutionId: SANDBOX_INSTITUTION_ID,
      databasePath: config.databasePath,
      encryptionEnabled: Boolean(config.dataEncryptionKey),
    });
  });

  router.post("/link-token", async (req, res, next) => {
    try {
      const body = linkTokenBody.parse(req.body);
      requireCustomer(body.customerId);

      const existingItem = getLatestPlaidItemForCustomer(body.customerId);
      const linkToken = await createLinkToken(plaid, {
        clientUserId: body.clientUserId ?? body.customerId,
        accessToken: existingItem?.access_token_plain,
      });
      res.json({ linkToken, customerId: body.customerId });
    } catch (err) {
      next(err);
    }
  });

  router.post("/exchange-public-token", async (req, res, next) => {
    try {
      const body = exchangeBody.parse(req.body);
      requireCustomer(body.customerId);

      const tokens = await exchangePublicToken(plaid, body.publicToken);
      const plaidItem = savePlaidItem({
        customerId: body.customerId,
        itemId: tokens.itemId,
        accessToken: tokens.accessToken,
        institutionId: body.institutionId ?? null,
        institutionName: body.institutionName ?? null,
      });

      res.json({
        customerId: body.customerId,
        plaidItemId: plaidItem.id,
        itemId: tokens.itemId,
        accessToken: tokens.accessToken,
      });
    } catch (err) {
      next(err);
    }
  });

  /** Dev: sandbox token + exchange + persist in one step. */
  router.post("/sandbox/connect", async (req, res, next) => {
    if (config.plaidEnv !== "sandbox") {
      res.status(403).json({
        error: "Sandbox connect is only allowed when PLAID_ENV=sandbox",
      });
      return;
    }

    try {
      const { customerId } = sandboxExchangeBody.parse(req.body);
      requireCustomer(customerId);

      const { institutionId } = sandboxPublicTokenQuery.parse(req.query);
      const publicToken = await createSandboxPublicToken(plaid, institutionId);
      const tokens = await exchangePublicToken(plaid, publicToken);
      const plaidItem = savePlaidItem({
        customerId,
        itemId: tokens.itemId,
        accessToken: tokens.accessToken,
        institutionId,
        institutionName: "Sandbox institution",
      });

      res.json({
        customerId,
        plaidItemId: plaidItem.id,
        itemId: tokens.itemId,
        accessToken: tokens.accessToken,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/sandbox/public-token", async (req, res, next) => {
    if (config.plaidEnv !== "sandbox") {
      res.status(403).json({
        error: "Sandbox public token creation is only allowed when PLAID_ENV=sandbox",
      });
      return;
    }

    try {
      const { institutionId } = sandboxPublicTokenQuery.parse(req.query);
      const publicToken = await createSandboxPublicToken(plaid, institutionId);
      res.json({ publicToken, institutionId });
    } catch (err) {
      next(err);
    }
  });

  router.get("/accounts", async (req, res, next) => {
    const parsed = customerIdField.safeParse({
      customerId: req.query.customerId,
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Query parameter customerId is required" });
      return;
    }

    try {
      requireCustomer(parsed.data.customerId);
      const item = getLatestPlaidItemForCustomer(parsed.data.customerId);
      if (!item) {
        res.status(404).json({ error: "No Plaid item for this customer" });
        return;
      }

      const accounts = await listAccounts(plaid, item.access_token_plain);
      res.json({ accounts, plaidItemId: item.id, itemId: item.item_id });
    } catch (err) {
      next(err);
    }
  });

  router.get("/auth", async (req, res, next) => {
    const customerId =
      typeof req.query.customerId === "string" ? req.query.customerId : undefined;
    const accessToken =
      typeof req.query.accessToken === "string" ? req.query.accessToken : undefined;

    const accountIds =
      typeof req.query.accountIds === "string"
        ? req.query.accountIds.split(",").filter(Boolean)
        : undefined;

    try {
      let token = accessToken;
      if (customerId) {
        requireCustomer(customerId);
        const item = getLatestPlaidItemForCustomer(customerId);
        if (!item) {
          res.status(404).json({ error: "No Plaid item for this customer" });
          return;
        }
        token = item.access_token_plain;
      }

      if (!token) {
        res
          .status(400)
          .json({ error: "Provide customerId or accessToken query parameter" });
        return;
      }

      const summary = await getAuthSummary(plaid, token, accountIds);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  router.post("/linked-accounts", async (req, res, next) => {
    try {
      const { customerId, accountIds } = linkedAccountsBody.parse(req.body);
      requireCustomer(customerId);

      const item = getLatestPlaidItemForCustomer(customerId);
      if (!item) {
        res.status(404).json({ error: "No Plaid item for this customer" });
        return;
      }

      const data = await getLinkedAccountData(
        plaid,
        item.access_token_plain,
        accountIds,
      );
      saveLinkedBankAccounts({
        customerId,
        plaidItemId: item.id,
        accounts: data.accounts,
      });

      let transactionSync:
        | { added: number; modified: number; removed: number }
        | { error: string } = { added: 0, modified: 0, removed: 0 };

      try {
        const cursor = getTransactionsCursor(item.id);
        const sync = await syncTransactions(
          plaid,
          item.access_token_plain,
          cursor,
        );
        transactionSync = applyTransactionSync(
          customerId,
          item.id,
          accountIds,
          sync,
        );
      } catch (syncErr) {
        const message =
          syncErr instanceof Error ? syncErr.message : "Transaction sync failed";
        transactionSync = { error: message };
      }

      const profile = getCustomerProfile(customerId);
      const transactions = getTransactionsForCustomer(customerId, {
        limit: 100,
      });

      res.json({
        customerId,
        accounts: data.accounts,
        transactionSync,
        transactions,
        stored: profile,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/transactions/sync", async (req, res, next) => {
    try {
      const { customerId, accountIds } = transactionSyncBody.parse(req.body);

      requireCustomer(customerId);
      const item = getLatestPlaidItemForCustomer(customerId);
      if (!item) {
        res.status(404).json({ error: "No Plaid item for this customer" });
        return;
      }

      const linkedAccountIds =
        accountIds ??
        (
          getCustomerProfile(customerId)?.bankAccounts.map(
            (a) => a.plaidAccountId,
          ) ?? []
        );

      if (!linkedAccountIds.length) {
        res.status(400).json({
          error: "No linked accounts — pull linked accounts first",
        });
        return;
      }

      const cursor = getTransactionsCursor(item.id);
      const sync = await syncTransactions(
        plaid,
        item.access_token_plain,
        cursor,
      );
      const counts = applyTransactionSync(
        customerId,
        item.id,
        linkedAccountIds,
        sync,
      );

      res.json({
        customerId,
        ...counts,
        transactions: getTransactionsForCustomer(customerId, { limit: 100 }),
        stored: getCustomerProfile(customerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/transactions", async (req, res, next) => {
    const parsed = customerIdField.safeParse({
      customerId: req.query.customerId,
    });
    if (!parsed.success) {
      res.status(400).json({ error: "Query parameter customerId is required" });
      return;
    }

    const bankAccountId =
      typeof req.query.bankAccountId === "string"
        ? req.query.bankAccountId
        : undefined;
    const limit =
      typeof req.query.limit === "string"
        ? Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 500))
        : 500;

    try {
      requireCustomer(parsed.data.customerId);
      const transactions = getTransactionsForCustomer(parsed.data.customerId, {
        bankAccountId,
        limit,
      });
      res.json({ transactions });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
