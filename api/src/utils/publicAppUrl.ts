import type { Request } from "express";
import { getConfig } from "../config.js";
import { isLocalOrigin } from "../env/appEnv.js";

/**
 * Public web app origin for referral links and QR codes.
 * Prefer configured PUBLIC_APP_URL (already guarded by APP_ENV in config).
 * In production only, if a stale localhost value slipped through, fall back to
 * the request Host (useful behind a reverse proxy).
 */
export function resolvePublicAppUrl(req?: Request): string {
  const configured = getConfig().publicAppUrl.replace(/\/$/, "");

  if (getConfig().appEnv !== "production" || !isLocalOrigin(configured) || !req) {
    return configured;
  }

  const forwardedProto = req
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const proto = forwardedProto || req.protocol || "http";
  const host =
    req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");

  if (
    host &&
    !host.includes("localhost") &&
    !host.startsWith("127.0.0.1")
  ) {
    return `${proto}://${host}`;
  }

  return configured;
}

export function buildReferralUrl(slug: string, req?: Request): string {
  return `${resolvePublicAppUrl(req)}/apply/${slug}`;
}
