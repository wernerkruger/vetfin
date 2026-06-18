import type { Request } from "express";
import { getConfig } from "../config.js";

const LOCAL_DEV_URLS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

/** Public web app origin for referral links and QR codes. */
export function resolvePublicAppUrl(req?: Request): string {
  const configured = getConfig().publicAppUrl.replace(/\/$/, "");

  const useRequest =
    process.env.NODE_ENV === "production" &&
    LOCAL_DEV_URLS.has(configured) &&
    req;

  if (!useRequest) {
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
