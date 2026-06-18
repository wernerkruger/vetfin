import { SignJWT, jwtVerify } from "jose";
import { getConfig } from "../config.js";

export type PracticeTokenPayload = {
  sub: string;
  email: string;
  slug: string;
};

export type BorrowerTokenPayload = {
  sub: string;
  email: string;
  type: "borrower";
};

export type AdminTokenPayload = {
  sub: "admin";
  type: "admin";
  username: string;
};

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getConfig().jwtSecret);
}

export async function signPracticeToken(
  payload: PracticeTokenPayload,
): Promise<string> {
  return new SignJWT({
    email: payload.email,
    slug: payload.slug,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifyPracticeToken(
  token: string,
): Promise<PracticeTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  const sub = payload.sub;
  if (!sub || typeof sub !== "string") {
    throw new Error("Invalid token");
  }
  if (payload.type === "borrower") {
    throw new Error("Invalid token type");
  }
  if (payload.type === "admin") {
    throw new Error("Invalid token type");
  }

  return {
    sub,
    email: String(payload.email ?? ""),
    slug: String(payload.slug ?? ""),
  };
}

export async function signBorrowerToken(
  payload: Omit<BorrowerTokenPayload, "type">,
): Promise<string> {
  return new SignJWT({
    email: payload.email,
    type: "borrower",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifyBorrowerToken(
  token: string,
): Promise<BorrowerTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  const sub = payload.sub;
  if (!sub || typeof sub !== "string" || payload.type !== "borrower") {
    throw new Error("Invalid token");
  }
  return {
    sub,
    email: String(payload.email ?? ""),
    type: "borrower",
  };
}

export async function signAdminToken(username: string): Promise<string> {
  return new SignJWT({
    type: "admin",
    username,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey());
}

export async function verifyAdminToken(token: string): Promise<AdminTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  if (payload.sub !== "admin" || payload.type !== "admin") {
    throw new Error("Invalid token");
  }
  return {
    sub: "admin",
    type: "admin",
    username: String(payload.username ?? "admin"),
  };
}
