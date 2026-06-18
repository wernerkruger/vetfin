import { randomBytes } from "node:crypto";
import {
  INVALID_CREDENTIALS_MESSAGE,
  LOCKED_ACCOUNT_MESSAGE,
  MAX_FAILED_LOGIN_ATTEMPTS,
} from "../constants/auth.js";
import { getDb } from "../db/connection.js";
import { HttpError } from "../errors.js";

export type AuthAccountRow = {
  id: string;
  password_hash: string | null;
  failed_login_attempts: number;
  locked_at: string | null;
  must_change_password: number;
};

export function isAccountLocked(row: AuthAccountRow): boolean {
  return row.locked_at !== null;
}

export function assertAccountCanLogin(row: AuthAccountRow): void {
  if (isAccountLocked(row)) {
    throw new HttpError(403, LOCKED_ACCOUNT_MESSAGE);
  }
}

export function recordFailedLogin(
  table: "customers" | "vet_practices",
  id: string,
  currentAttempts: number,
): void {
  const nextAttempts = currentAttempts + 1;
  const database = getDb();

  if (nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    database
      .prepare(
        `UPDATE ${table}
         SET failed_login_attempts = ?, locked_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(nextAttempts, id);
    throw new HttpError(403, LOCKED_ACCOUNT_MESSAGE);
  }

  database
    .prepare(
      `UPDATE ${table}
       SET failed_login_attempts = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(nextAttempts, id);
  throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);
}

export function clearLoginAttempts(
  table: "customers" | "vet_practices",
  id: string,
): void {
  getDb()
    .prepare(
      `UPDATE ${table}
       SET failed_login_attempts = 0, locked_at = NULL, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(id);
}

export function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}
