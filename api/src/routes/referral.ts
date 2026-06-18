import { Router } from "express";
import { z } from "zod";
import {
  createApplicantFromReferral,
  getPracticeBySlug,
  toPublicPractice,
} from "../db/practices.js";
import { buildReferralUrl } from "../utils/publicAppUrl.js";

const applyBody = z.object({
  applicantName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
});

export function referralRouter(): Router {
  const router = Router();

  router.get("/:slug", (req, res, next) => {
    try {
      const practice = getPracticeBySlug(req.params.slug);
      if (!practice) {
        res.status(404).json({ error: "Practice not found" });
        return;
      }

      res.json({
        practice: {
          id: practice.id,
          name: practice.name,
          slug: practice.slug,
          city: practice.city,
          state: practice.state,
        },
        referralUrl: buildReferralUrl(practice.slug, req),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:slug/apply", (req, res, next) => {
    try {
      const practice = getPracticeBySlug(req.params.slug);
      if (!practice) {
        res.status(404).json({ error: "Practice not found" });
        return;
      }

      const body = applyBody.parse(req.body);
      const applicant = createApplicantFromReferral({
        practiceId: practice.id,
        referralSlug: practice.slug,
        applicantName: body.applicantName,
        email: body.email,
        phone: body.phone,
      });

      res.status(201).json({
        practice: toPublicPractice(practice),
        application: applicant,
        message:
          "Application started. Your practice will be notified when you complete financing.",
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
