import type { Request, RequestHandler } from "express";
import {
  verifyBorrowerToken,
  type BorrowerTokenPayload,
} from "../auth/jwt.js";
import { getBorrowerById } from "../db/borrowers.js";

const AUTH_KEY = "borrowerAuth";

export function getBorrowerAuth(req: Request): BorrowerTokenPayload {
  const payload = (req as Request & Record<string, unknown>)[AUTH_KEY];
  if (!payload || typeof payload !== "object") {
    throw new Error("Missing borrower auth");
  }
  return payload as BorrowerTokenPayload;
}

export const requireBorrowerAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = await verifyBorrowerToken(token);
    const borrower = getBorrowerById(payload.sub);
    if (!borrower) {
      res.status(401).json({ error: "Account not found" });
      return;
    }
    (req as Request & Record<string, unknown>)[AUTH_KEY] = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
};
