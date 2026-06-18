import type { Request, RequestHandler } from "express";
import { verifyAdminToken, type AdminTokenPayload } from "../auth/jwt.js";

const AUTH_KEY = "adminAuth";

export function getAdminAuth(req: Request): AdminTokenPayload {
  const payload = (req as Request & Record<string, unknown>)[AUTH_KEY];
  if (!payload || typeof payload !== "object") {
    throw new Error("Missing admin auth");
  }
  return payload as AdminTokenPayload;
}

export const requireAdminAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const token = header.slice(7);
    const payload = await verifyAdminToken(token);
    (req as Request & Record<string, unknown>)[AUTH_KEY] = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
};
