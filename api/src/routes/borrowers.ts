import { Router } from "express";
import { z } from "zod";
import {
  getBorrowerById,
  loginBorrower,
  registerBorrower,
  toPublicBorrower,
  updateBorrowerProfile,
} from "../db/borrowers.js";
import {
  getBorrowerDashboard,
  getOrCreateDraftApplication,
  listApplicationsForBorrower,
  toPublicApplication,
} from "../db/applications.js";
import { getPracticeBySlug } from "../db/practices.js";
import { getBorrowerAuth, requireBorrowerAuth } from "../middleware/requireBorrower.js";

const signupBody = z.object({
  referralSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const profileBody = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  phone: z.string().min(10).max(20),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ssnLast4: z.string().regex(/^\d{4}$/),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(80),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
});

export function borrowersRouter(): Router {
  const router = Router();

  router.post("/signup", async (req, res, next) => {
    try {
      const body = signupBody.parse(req.body);
      const practice = getPracticeBySlug(body.referralSlug);
      if (!practice) {
        res.status(404).json({ error: "Practice not found" });
        return;
      }

      const { borrower, token } = await registerBorrower({
        email: body.email,
        password: body.password,
        firstName: body.firstName,
        lastName: body.lastName,
        practiceId: practice.id,
        referralSlug: practice.slug,
      });

      const application = getOrCreateDraftApplication(
        borrower.id,
        practice.id,
        practice.slug,
      );

      res.status(201).json({
        token,
        borrower: toPublicBorrower(borrower),
        application: toPublicApplication(application),
        practice: { id: practice.id, name: practice.name, slug: practice.slug },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const { email, password } = loginBody.parse(req.body);
      const { borrower, token } = await loginBorrower(email, password);

      res.json({
        token,
        borrower: toPublicBorrower(borrower),
        applications: listApplicationsForBorrower(borrower.id),
        redirectTo: "/borrower/dashboard",
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me/dashboard", requireBorrowerAuth, (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const borrower = getBorrowerById(customerId);
      if (!borrower) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      res.json({
        borrower: toPublicBorrower(borrower),
        ...getBorrowerDashboard(customerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", requireBorrowerAuth, (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const borrower = getBorrowerById(customerId);
      if (!borrower) {
        res.status(404).json({ error: "Account not found" });
        return;
      }

      res.json({
        borrower: toPublicBorrower(borrower),
        applications: listApplicationsForBorrower(customerId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/me/profile", requireBorrowerAuth, (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const body = profileBody.parse(req.body);
      const borrower = updateBorrowerProfile(customerId, body);
      res.json({ borrower: toPublicBorrower(borrower) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
