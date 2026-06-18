import { Router } from "express";
import { z } from "zod";
import {
  changeBorrowerPassword,
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
import {
  dateOfBirthField,
  emailField,
  nameField,
  passwordField,
  phoneField,
  ssnLast4Field,
  stateField,
  zipField,
} from "../validation/fields.js";

const signupBody = z.object({
  referralSlug: z.string().trim().min(1),
  email: emailField,
  password: passwordField,
  firstName: nameField("First name"),
  lastName: nameField("Last name"),
});

const loginBody = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordField,
});

const profileBody = z.object({
  firstName: nameField("First name"),
  lastName: nameField("Last name"),
  phone: phoneField,
  dateOfBirth: dateOfBirthField,
  ssnLast4: ssnLast4Field,
  addressLine1: z.string().trim().min(1, "Street address is required").max(200),
  addressLine2: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  city: z.string().trim().min(1, "City is required").max(80),
  state: stateField,
  zip: zipField,
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
      const { borrower, token, mustChangePassword } = await loginBorrower(
        email,
        password,
      );

      res.json({
        token,
        borrower: toPublicBorrower(borrower),
        applications: listApplicationsForBorrower(borrower.id),
        redirectTo: mustChangePassword
          ? "/borrower/change-password"
          : "/borrower/dashboard",
        mustChangePassword,
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

  router.post("/me/change-password", requireBorrowerAuth, async (req, res, next) => {
    try {
      const customerId = getBorrowerAuth(req).sub;
      const body = changePasswordBody.parse(req.body);
      const borrower = await changeBorrowerPassword(
        customerId,
        body.currentPassword,
        body.newPassword,
      );
      res.json({ borrower: toPublicBorrower(borrower) });
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
