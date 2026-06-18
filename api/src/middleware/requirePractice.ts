import type { Request, RequestHandler } from "express";
import { verifyPracticeToken, type PracticeTokenPayload } from "../auth/jwt.js";
import { getPracticeById } from "../db/practices.js";

const AUTH_KEY = "practiceAuth";

export function getPracticeAuth(req: Request): PracticeTokenPayload {
  const payload = (req as Request & Record<string, unknown>)[AUTH_KEY];
  if (!payload || typeof payload !== "object") {
    throw new Error("Missing practice auth");
  }
  return payload as PracticeTokenPayload;
}

export const requirePracticeAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = await verifyPracticeToken(token);
    const practice = getPracticeById(payload.sub);
    if (!practice) {
      res.status(401).json({ error: "Practice not found" });
      return;
    }
    if (
      practice.must_change_password === 1 &&
      !req.path.endsWith("/change-password")
    ) {
      res.status(403).json({
        error: "You must change your password before continuing.",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
      return;
    }
    (req as Request & Record<string, unknown>)[AUTH_KEY] = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
};
