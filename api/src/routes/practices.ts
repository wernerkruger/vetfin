import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { signPracticeToken } from "../auth/jwt.js";
import { verifyPassword } from "../crypto/password.js";
import { setVetApproval, toPublicApplication } from "../db/applications.js";
import {
  createVetPractice,
  getPracticeByEmail,
  getPracticeById,
  getPracticeReferrals,
  getPracticeStats,
  getReferralUrl,
  toPublicPractice,
} from "../db/practices.js";
import {
  getPracticeAuth,
  requirePracticeAuth,
} from "../middleware/requirePractice.js";

const signupBody = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  contactName: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(2).optional(),
  zip: z.string().max(12).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function practicesRouter(): Router {
  const router = Router();

  router.post("/signup", async (req, res, next) => {
    try {
      const body = signupBody.parse(req.body);
      const practice = await createVetPractice(body);
      const token = await signPracticeToken({
        sub: practice.id,
        email: practice.email,
        slug: practice.slug,
      });

      res.status(201).json({
        practice: toPublicPractice(practice),
        token,
        referralUrl: getReferralUrl(practice.slug),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const { email, password } = loginBody.parse(req.body);
      const practice = getPracticeByEmail(email);
      if (!practice) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const valid = await verifyPassword(password, practice.password_hash);
      if (!valid) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const token = await signPracticeToken({
        sub: practice.id,
        email: practice.email,
        slug: practice.slug,
      });

      res.json({
        practice: toPublicPractice(practice),
        token,
        referralUrl: getReferralUrl(practice.slug),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", requirePracticeAuth, (req, res, next) => {
    try {
      const practiceId = getPracticeAuth(req).sub;
      const practice = getPracticeById(practiceId);
      if (!practice) {
        res.status(404).json({ error: "Practice not found" });
        return;
      }

      res.json({
        practice: toPublicPractice(practice),
        referralUrl: getReferralUrl(practice.slug),
        stats: getPracticeStats(practice.id),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me/referrals", requirePracticeAuth, (req, res, next) => {
    try {
      const practiceId = getPracticeAuth(req).sub;
      res.json({
        referrals: getPracticeReferrals(practiceId),
        stats: getPracticeStats(practiceId),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/me/qr", requirePracticeAuth, async (req, res, next) => {
    try {
      const practiceId = getPracticeAuth(req).sub;
      const practice = getPracticeById(practiceId);
      if (!practice) {
        res.status(404).json({ error: "Practice not found" });
        return;
      }

      const url = getReferralUrl(practice.slug);
      const png = await QRCode.toBuffer(url, {
        type: "png",
        width: 320,
        margin: 2,
        color: { dark: "#1a2e28", light: "#faf7f2" },
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(png);
    } catch (err) {
      next(err);
    }
  });

  function applicationIdParam(value: string | string[]): string {
    return Array.isArray(value) ? value[0] : value;
  }

  router.post(
    "/me/applications/:applicationId/vet-approve",
    requirePracticeAuth,
    (req, res, next) => {
      try {
        const practiceId = getPracticeAuth(req).sub;
        const application = setVetApproval(
          applicationIdParam(req.params.applicationId),
          practiceId,
          true,
        );
        res.json({ application: toPublicApplication(application) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/me/applications/:applicationId/vet-cancel",
    requirePracticeAuth,
    (req, res, next) => {
      try {
        const practiceId = getPracticeAuth(req).sub;
        const application = setVetApproval(
          applicationIdParam(req.params.applicationId),
          practiceId,
          false,
        );
        res.json({ application: toPublicApplication(application) });
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/me/qr-data", requirePracticeAuth, async (req, res, next) => {
    try {
      const practiceId = getPracticeAuth(req).sub;
      const practice = getPracticeById(practiceId);
      if (!practice) {
        res.status(404).json({ error: "Practice not found" });
        return;
      }

      const url = getReferralUrl(practice.slug);
      const dataUrl = await QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: { dark: "#1a2e28", light: "#faf7f2" },
      });

      res.json({ url, qrDataUrl: dataUrl });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
