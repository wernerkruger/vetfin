import { Router } from "express";
import { z } from "zod";
import { signAdminToken } from "../auth/jwt.js";
import { getConfig } from "../config.js";
import { verifyPassword } from "../crypto/password.js";
import { adminResetUserPassword, adminUnlockUser, getAdminBorrowerDetail, listAdminUsers } from "../db/admin.js";
import { getAdminBiAnalytics } from "../db/bi.js";
import { listAdminProspectClinics } from "../db/prospectClinics.js";
import {
  adminApproveApplication,
  adminDeclineApplication,
  adminMarkDisbursementSent,
  listAdminDisbursements,
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

  router.get("/disbursements", requireAdminAuth, (_req, res) => {
    res.json({ disbursements: listAdminDisbursements() });
  });

  router.get("/bi", requireAdminAuth, (_req, res) => {
    res.json(getAdminBiAnalytics());
  });

  router.get("/prospect-clinics", requireAdminAuth, (req, res, next) => {
    try {
      const signedUpRaw =
        typeof req.query.signedUp === "string" ? req.query.signedUp : "all";
      const signedUp =
        signedUpRaw === "yes" || signedUpRaw === "no" ? signedUpRaw : "all";

      res.json(
        listAdminProspectClinics({
          category:
            typeof req.query.category === "string"
              ? req.query.category
              : undefined,
          name: typeof req.query.name === "string" ? req.query.name : undefined,
          address:
            typeof req.query.address === "string" ? req.query.address : undefined,
          city: typeof req.query.city === "string" ? req.query.city : undefined,
          state: typeof req.query.state === "string" ? req.query.state : undefined,
          stateShort:
            typeof req.query.stateShort === "string"
              ? req.query.stateShort
              : undefined,
          phone: typeof req.query.phone === "string" ? req.query.phone : undefined,
          website:
            typeof req.query.website === "string" ? req.query.website : undefined,
          rating:
            typeof req.query.rating === "string" ? req.query.rating : undefined,
          sourceUrl:
            typeof req.query.sourceUrl === "string"
              ? req.query.sourceUrl
              : undefined,
          email: typeof req.query.email === "string" ? req.query.email : undefined,
          signedUp,
          page: req.query.page ? Number(req.query.page) : 1,
          limit: req.query.limit ? Number(req.query.limit) : 50,
        }),
      );
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
