import { Router } from "express";
import type { PlaidApi } from "plaid";
import { z } from "zod";
import { ANIMAL_TYPES, SERVICE_TYPES } from "../constants/application.js";
import {
  cancelApplicationSubmission,
  getApplicationForBorrower,
  getOrCreateDraftApplication,
  markApplicationBankLinked,
  submitApplication,
  toPublicApplication,
  updateApplicationLoanDetails,
  updateApplicationProfile,
} from "../db/applications.js";
import { getBorrowerById } from "../db/borrowers.js";
import { getPracticeBySlug, toPublicPractice } from "../db/practices.js";
import {
  applyTransactionSync,
  getCustomerProfile,
  getLatestPlaidItemForCustomer,
  getTransactionsCursor,
  saveLinkedBankAccounts,
  savePlaidItem,
} from "../db/store.js";
import { syncTransactions } from "../plaid/client.js";
import { getBorrowerAuth, requireBorrowerAuth } from "../middleware/requireBorrower.js";
import { getConfig } from "../config.js";
import {
  createLinkToken,
  createSandboxPublicToken,
  exchangePublicToken,
  getLinkedAccountData,
  listAccounts,
  SANDBOX_INSTITUTION_ID,
} from "../plaid/client.js";

const referralSlugQuery = z.object({
  referralSlug: z.string().min(1),
});

const loanBody = z.object({
  loanAmount: z.number().int().positive().max(25000),
  serviceType: z.enum(SERVICE_TYPES),
  animalType: z.enum(ANIMAL_TYPES),
  animalName: z.string().max(80).optional(),
});

const exchangeBody = z.object({
  publicToken: z.string().min(1),
  institutionId: z.string().optional(),
  institutionName: z.string().optional(),
});

const linkedAccountsBody = z.object({
  accountIds: z.array(z.string().min(1)).min(1),
});

function paramId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function applicationsRouter(plaid: PlaidApi): Router {
  const router = Router();
  const config = getConfig();

  router.get("/current", requireBorrowerAuth, (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const { referralSlug } = referralSlugQuery.parse(req.query);
      const practice = getPracticeBySlug(referralSlug);
      if (!practice) {
        res.status(404).json({ error: "Practice not found" });
        return;
      }

      const application = getOrCreateDraftApplication(
        customerId,
        practice.id,
        practice.slug,
      );

      res.json({
        application: toPublicApplication(application),
        practice: { id: practice.id, name: practice.name, slug: practice.slug },
        profile: toPublicBorrowerSafe(getBorrowerById(customerId)!),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:applicationId/complete-profile", requireBorrowerAuth, (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const application = updateApplicationProfile(
        paramId(req.params.applicationId),
        customerId,
      );
      res.json({ application: toPublicApplication(application) });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:applicationId/loan", requireBorrowerAuth, (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const body = loanBody.parse(req.body);
      const application = updateApplicationLoanDetails(
        paramId(req.params.applicationId),
        customerId,
        body,
      );
      res.json({ application: toPublicApplication(application) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:applicationId/plaid/link-token", requireBorrowerAuth, async (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const app = getApplicationForBorrower(paramId(req.params.applicationId), customerId);
      if (!app) {
        res.status(404).json({ error: "Application not found" });
        return;
      }

      const existingItem = getLatestPlaidItemForCustomer(customerId);
      const linkToken = await createLinkToken(plaid, {
        clientUserId: customerId,
        accessToken: existingItem?.access_token_plain,
      });
      res.json({ linkToken, customerId });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:applicationId/plaid/exchange", requireBorrowerAuth, async (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const app = getApplicationForBorrower(paramId(req.params.applicationId), customerId);
      if (!app) {
        res.status(404).json({ error: "Application not found" });
        return;
      }

      const body = exchangeBody.parse(req.body);
      const tokens = await exchangePublicToken(plaid, body.publicToken);
      const plaidItem = savePlaidItem({
        customerId,
        itemId: tokens.itemId,
        accessToken: tokens.accessToken,
        institutionId: body.institutionId ?? null,
        institutionName: body.institutionName ?? null,
      });

      const accounts = await listAccounts(plaid, tokens.accessToken);
      res.json({
        plaidItemId: plaidItem.id,
        itemId: tokens.itemId,
        accounts,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:applicationId/plaid/accounts", requireBorrowerAuth, async (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const app = getApplicationForBorrower(paramId(req.params.applicationId), customerId);
      if (!app) {
        res.status(404).json({ error: "Application not found" });
        return;
      }

      const item = getLatestPlaidItemForCustomer(customerId);
      if (!item) {
        res.status(404).json({ error: "Connect a bank first" });
        return;
      }

      const accounts = await listAccounts(plaid, item.access_token_plain);
      res.json({ accounts, itemId: item.item_id });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:applicationId/plaid/linked-accounts",
    requireBorrowerAuth,
    async (req, res, next) => {
      try {
        const customerId = getBorrowerAuth(req).sub;
        const app = getApplicationForBorrower(paramId(req.params.applicationId), customerId);
        if (!app) {
          res.status(404).json({ error: "Application not found" });
          return;
        }

        const { accountIds } = linkedAccountsBody.parse(req.body);
        const item = getLatestPlaidItemForCustomer(customerId);
        if (!item) {
          res.status(404).json({ error: "Connect a bank first" });
          return;
        }

        const applicationId = paramId(req.params.applicationId);
        const data = await getLinkedAccountData(
          plaid,
          item.access_token_plain,
          accountIds,
        );
        saveLinkedBankAccounts({
          customerId,
          plaidItemId: item.id,
          loanApplicationId: applicationId,
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
            applicationId,
          );
        } catch (syncErr) {
          const message =
            syncErr instanceof Error
              ? syncErr.message
              : "Transaction sync failed";
          transactionSync = { error: message };
        }

        const application = markApplicationBankLinked(
          applicationId,
          customerId,
        );

        res.json({
          application: toPublicApplication(application),
          accounts: data.accounts,
          transactionSync,
          stored: getCustomerProfile(customerId),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/:applicationId/plaid/sandbox-connect",
    requireBorrowerAuth,
    async (req, res, next) => {
      if (config.plaidEnv !== "sandbox") {
        res.status(403).json({ error: "Sandbox only" });
        return;
      }

      try {
        const customerId = getBorrowerAuth(req).sub;
        const app = getApplicationForBorrower(paramId(req.params.applicationId), customerId);
        if (!app) {
          res.status(404).json({ error: "Application not found" });
          return;
        }

        const publicToken = await createSandboxPublicToken(plaid);
        const tokens = await exchangePublicToken(plaid, publicToken);
        savePlaidItem({
          customerId,
          itemId: tokens.itemId,
          accessToken: tokens.accessToken,
          institutionId: SANDBOX_INSTITUTION_ID,
          institutionName: "Sandbox institution",
        });

        const accounts = await listAccounts(plaid, tokens.accessToken);
        res.json({ itemId: tokens.itemId, accounts });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/:applicationId/submit", requireBorrowerAuth, (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const application = submitApplication(paramId(req.params.applicationId), customerId);
      const practice = getPracticeBySlug(application.referral_slug);

      res.json({
        application: toPublicApplication(application),
        practice: practice ? toPublicPractice(practice) : null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:applicationId/cancel", requireBorrowerAuth, (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const application = cancelApplicationSubmission(
        paramId(req.params.applicationId),
        customerId,
      );
      res.json({ application: toPublicApplication(application) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function toPublicBorrowerSafe(row: ReturnType<typeof getBorrowerById>) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    dateOfBirth: row.date_of_birth,
    hasSsnLast4: Boolean(row.ssn_last4),
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    zip: row.zip,
  };
}
