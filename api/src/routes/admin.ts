import { Router } from "express";
import { z } from "zod";
import { signAdminToken } from "../auth/jwt.js";
import { getConfig } from "../config.js";
import { verifyPassword } from "../crypto/password.js";
import {
  adminResetUserPassword,
  adminUnlockUser,
  getAdminBorrowerDetail,
  listAdminUsers,
} from "../db/admin.js";
import { getAdminBiAnalytics } from "../db/bi.js";
import { getAcceptedTilaDisclosure } from "../db/repayment.js";
import { audit } from "../db/loanServicing.js";
import {
  listAdminProspectClinics,
  exportAdminProspectClinics,
  type ProspectClinicFilters,
} from "../db/prospectClinics.js";
import {
  adminApproveApplication,
  adminMarkOriginationFeePaid,
  adminDeclineApplication,
  adminMarkDisbursementSent,
  countAdminPendingDisbursements,
  countAdminPendingFundingApplications,
  listAdminDisbursements,
  listAdminPendingFundingApplications,
  toPublicApplication,
} from "../db/applications.js";
import { getPracticeById } from "../db/practices.js";
import { HttpError } from "../errors.js";
import { getAdminAuth, requireAdminAuth } from "../middleware/requireAdmin.js";

const loginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const resetParams = z.object({
  type: z.enum(["borrower", "practice"]),
  id: z.string().uuid(),
});

const idParam = z.object({
  id: z.string().uuid(),
});

const applicationIdParam = z.object({
  applicationId: z.string().uuid(),
});

function prospectClinicFiltersFromQuery(
  query: Record<string, unknown>,
): ProspectClinicFilters {
  const signedUpRaw =
    typeof query.signedUp === "string" ? query.signedUp : "all";
  const signedUp =
    signedUpRaw === "yes" || signedUpRaw === "no" ? signedUpRaw : "all";

  return {
    category: typeof query.category === "string" ? query.category : undefined,
    name: typeof query.name === "string" ? query.name : undefined,
    address: typeof query.address === "string" ? query.address : undefined,
    city: typeof query.city === "string" ? query.city : undefined,
    state: typeof query.state === "string" ? query.state : undefined,
    stateShort:
      typeof query.stateShort === "string" ? query.stateShort : undefined,
    phone: typeof query.phone === "string" ? query.phone : undefined,
    website: typeof query.website === "string" ? query.website : undefined,
    rating: typeof query.rating === "string" ? query.rating : undefined,
    sourceUrl:
      typeof query.sourceUrl === "string" ? query.sourceUrl : undefined,
    email: typeof query.email === "string" ? query.email : undefined,
    signedUp,
    page: query.page ? Number(query.page) : 1,
    limit: query.limit ? Number(query.limit) : 50,
  };
}

export function adminRouter(): Router {
  const router = Router();

  router.post("/login", async (req, res, next) => {
    try {
      const config = getConfig();
      if (!config.adminPasswordHash) {
        throw new HttpError(503, "Admin access is not configured");
      }

      const { username, password } = loginBody.parse(req.body);
      if (username !== config.adminUsername) {
        throw new HttpError(401, "Invalid username or password");
      }

      const valid = await verifyPassword(password, config.adminPasswordHash);
      if (!valid) {
        throw new HttpError(401, "Invalid username or password");
      }

      const token = await signAdminToken(username);
      res.json({ token, username });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", requireAdminAuth, (req, res) => {
    const auth = getAdminAuth(req);
    res.json({ username: auth.username });
  });

  router.get("/users", requireAdminAuth, async (_req, res) => {
    const { practices, borrowers } = await listAdminUsers();
    res.json({ practices, borrowers });
  });

  router.get("/borrowers/:id", requireAdminAuth, async (req, res, next) => {
    try {
      const { id } = idParam.parse(req.params);
      res.json(await getAdminBorrowerDetail(id));
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/applications/pending-funding",
    requireAdminAuth,
    async (_req, res) => {
      const applications = await listAdminPendingFundingApplications();
      res.json({
        applications,
        count: applications.length,
      });
    },
  );

  router.get(
    "/applications/pending-funding/count",
    requireAdminAuth,
    async (_req, res) => {
      res.json({ count: await countAdminPendingFundingApplications() });
    },
  );

  router.get(
    "/applications/:applicationId/disclosure",
    requireAdminAuth,
    async (req, res, next) => {
      try {
        const { applicationId } = applicationIdParam.parse(req.params);
        const disclosure = await getAcceptedTilaDisclosure(applicationId);
        if (!disclosure) {
          res
            .status(404)
            .json({ error: "No accepted disclosure for this application" });
          return;
        }
        res.json({ disclosure });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/applications/:applicationId/origination-fee/paid",
    requireAdminAuth,
    async (req, res, next) => {
      try {
        const { applicationId } = applicationIdParam.parse(req.params);
        const application = await adminMarkOriginationFeePaid(
          applicationId,
          getAdminAuth(req).username,
        );
        await audit(
          applicationId,
          "fee.marked_paid",
          getAdminAuth(req).username,
          {
            details: { amount: application.origination_fee },
          },
        );
        const practice = await getPracticeById(application.practice_id);
        res.json({
          application: toPublicApplication(
            application,
            practice ? { name: practice.name } : undefined,
          ),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/applications/:applicationId/approve",
    requireAdminAuth,
    async (req, res, next) => {
      try {
        const { applicationId } = applicationIdParam.parse(req.params);
        const application = await adminApproveApplication(applicationId);
        await audit(applicationId, "loan.approved", getAdminAuth(req).username);
        const practice = await getPracticeById(application.practice_id);
        res.json({
          application: toPublicApplication(
            application,
            practice ? { name: practice.name } : undefined,
          ),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/applications/:applicationId/decline",
    requireAdminAuth,
    async (req, res, next) => {
      try {
        const { applicationId } = applicationIdParam.parse(req.params);
        const application = await adminDeclineApplication(applicationId);
        await audit(applicationId, "loan.declined", getAdminAuth(req).username);
        const practice = await getPracticeById(application.practice_id);
        res.json({
          application: toPublicApplication(
            application,
            practice ? { name: practice.name } : undefined,
          ),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get(
    "/disbursements/pending-count",
    requireAdminAuth,
    async (_req, res) => {
      res.json({ count: await countAdminPendingDisbursements() });
    },
  );

  router.get("/disbursements", requireAdminAuth, async (_req, res) => {
    res.json({ disbursements: await listAdminDisbursements() });
  });

  router.get("/bi", requireAdminAuth, async (_req, res) => {
    res.json(await getAdminBiAnalytics());
  });

  router.get("/prospect-clinics", requireAdminAuth, async (req, res, next) => {
    try {
      res.json(
        await listAdminProspectClinics(
          prospectClinicFiltersFromQuery(req.query),
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  router.get(
    "/prospect-clinics/export",
    requireAdminAuth,
    async (req, res, next) => {
      try {
        const {
          page: _page,
          limit: _limit,
          ...filters
        } = prospectClinicFiltersFromQuery(req.query);
        res.json(await exportAdminProspectClinics(filters));
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/disbursements/:applicationId/mark-sent",
    requireAdminAuth,
    async (req, res, next) => {
      try {
        const { applicationId } = applicationIdParam.parse(req.params);
        const application = await adminMarkDisbursementSent(applicationId);
        await audit(applicationId, "loan.funded", getAdminAuth(req).username, {
          details: {
            amount: application.loan_amount,
            firstPaymentDue: application.first_payment_due_date,
          },
        });
        const practice = await getPracticeById(application.practice_id);
        res.json({
          disbursement: (await listAdminDisbursements()).find(
            (d) => d.applicationId === applicationId,
          ),
          application: toPublicApplication(
            application,
            practice ? { name: practice.name } : undefined,
          ),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/users/:type/:id/unlock",
    requireAdminAuth,
    async (req, res, next) => {
      try {
        const params = resetParams.parse(req.params);
        await adminUnlockUser(params.type, params.id);
        res.json({ message: "Account unlocked." });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/users/:type/:id/reset-password",
    requireAdminAuth,
    async (req, res, next) => {
      try {
        const params = resetParams.parse(req.params);
        const result = await adminResetUserPassword(params.type, params.id);
        res.json({
          message:
            "Temporary password created. Share it with the user securely; they must change it on next login.",
          temporaryPassword: result.temporaryPassword,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
