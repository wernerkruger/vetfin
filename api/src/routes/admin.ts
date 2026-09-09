import { Router } from "express";
import { z } from "zod";
import { signAdminToken } from "../auth/jwt.js";
import { getConfig } from "../config.js";
import { verifyPassword } from "../crypto/password.js";
import { adminResetUserPassword, adminUnlockUser, getAdminBorrowerDetail, listAdminUsers } from "../db/admin.js";
import { getAdminBiAnalytics } from "../db/bi.js";
import { listAdminProspectClinics, exportAdminProspectClinics, type ProspectClinicFilters } from "../db/prospectClinics.js";
import {
  adminApproveApplication,
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
    category:
      typeof query.category === "string" ? query.category : undefined,
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

  router.get("/users", requireAdminAuth, (_req, res) => {
    const { practices, borrowers } = listAdminUsers();
    res.json({ practices, borrowers });
  });

  router.get("/borrowers/:id", requireAdminAuth, (req, res, next) => {
    try {
      const { id } = idParam.parse(req.params);
      res.json(getAdminBorrowerDetail(id));
    } catch (err) {
      next(err);
    }
  });

  router.get("/applications/pending-funding", requireAdminAuth, (_req, res) => {
    const applications = listAdminPendingFundingApplications();
    res.json({
      applications,
      count: applications.length,
    });
  });

  router.get("/applications/pending-funding/count", requireAdminAuth, (_req, res) => {
    res.json({ count: countAdminPendingFundingApplications() });
  });

  router.post(
    "/applications/:applicationId/approve",
    requireAdminAuth,
    (req, res, next) => {
      try {
        const { applicationId } = applicationIdParam.parse(req.params);
        const application = adminApproveApplication(applicationId);
        const practice = getPracticeById(application.practice_id);
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
    (req, res, next) => {
      try {
        const { applicationId } = applicationIdParam.parse(req.params);
        const application = adminDeclineApplication(applicationId);
        const practice = getPracticeById(application.practice_id);
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

  router.get("/disbursements/pending-count", requireAdminAuth, (_req, res) => {
    res.json({ count: countAdminPendingDisbursements() });
  });

  router.get("/disbursements", requireAdminAuth, (_req, res) => {
    res.json({ disbursements: listAdminDisbursements() });
  });

  router.get("/bi", requireAdminAuth, (_req, res) => {
    res.json(getAdminBiAnalytics());
  });

  router.get("/prospect-clinics", requireAdminAuth, (req, res, next) => {
    try {
      res.json(listAdminProspectClinics(prospectClinicFiltersFromQuery(req.query)));
    } catch (err) {
      next(err);
    }
  });

  router.get("/prospect-clinics/export", requireAdminAuth, (req, res, next) => {
    try {
      const { page: _page, limit: _limit, ...filters } =
        prospectClinicFiltersFromQuery(req.query);
      res.json(exportAdminProspectClinics(filters));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/disbursements/:applicationId/mark-sent",
    requireAdminAuth,
    (req, res, next) => {
      try {
        const { applicationId } = applicationIdParam.parse(req.params);
        const application = adminMarkDisbursementSent(applicationId);
        const practice = getPracticeById(application.practice_id);
        res.json({
          disbursement: listAdminDisbursements().find(
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
    (req, res, next) => {
      try {
        const params = resetParams.parse(req.params);
        adminUnlockUser(params.type, params.id);
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
