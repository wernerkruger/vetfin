import { hashPassword } from "../crypto/password.js";
import { generateTemporaryPassword } from "../auth/loginSecurity.js";
import { listApplicationsForAdmin } from "./applications.js";
import { getBorrowerById, toPublicBorrower } from "./borrowers.js";
import { HttpError } from "../errors.js";
import { getDb } from "./connection.js";

export type AdminUserSummary = {
  id: string;
  type: "borrower" | "practice";
  email: string;
  displayName: string;
  hasLogin: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  createdAt: string;
};

export function listAdminUsers(): {
  practices: AdminUserSummary[];
  borrowers: AdminUserSummary[];
} {
  const database = getDb();

  const borrowers = database
    .prepare(
      `SELECT id, email, applicant_name, first_name, last_name, password_hash,
              locked_at, must_change_password, failed_login_attempts, created_at
       FROM customers
       WHERE email IS NOT NULL
       ORDER BY email COLLATE NOCASE`,
    )
    .all() as Array<{
    id: string;
    email: string;
    applicant_name: string | null;
    first_name: string | null;
    last_name: string | null;
    password_hash: string | null;
    locked_at: string | null;
    must_change_password: number;
    failed_login_attempts: number;
    created_at: string;
  }>;

  const practices = database
    .prepare(
      `SELECT id, email, name, locked_at, must_change_password,
              failed_login_attempts, created_at
       FROM vet_practices
       ORDER BY email COLLATE NOCASE`,
    )
    .all() as Array<{
    id: string;
    email: string;
    name: string;
    locked_at: string | null;
    must_change_password: number;
    failed_login_attempts: number;
    created_at: string;
  }>;

  const borrowerUsers = borrowers.map((row) => ({
    id: row.id,
    type: "borrower" as const,
    email: row.email,
    displayName:
      row.applicant_name?.trim() ||
      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
      row.email,
    hasLogin: row.password_hash !== null,
    isLocked: row.locked_at !== null,
    mustChangePassword: row.must_change_password === 1,
    failedLoginAttempts: row.failed_login_attempts,
    createdAt: row.created_at,
  }));

  const practiceUsers = practices.map((row) => ({
    id: row.id,
    type: "practice" as const,
    email: row.email,
    displayName: row.name,
    hasLogin: true,
    isLocked: row.locked_at !== null,
    mustChangePassword: row.must_change_password === 1,
    failedLoginAttempts: row.failed_login_attempts,
    createdAt: row.created_at,
  }));

  return { practices: practiceUsers, borrowers: borrowerUsers };
}

export function getAdminBorrowerDetail(customerId: string) {
  const borrower = getBorrowerById(customerId);
  if (!borrower) {
    throw new HttpError(404, "Borrower not found");
  }

  return {
    borrower: toPublicBorrower(borrower),
    applications: listApplicationsForAdmin(customerId),
  };
}

export async function adminResetUserPassword(
  type: "borrower" | "practice",
  id: string,
): Promise<{ temporaryPassword: string }> {
  const table = type === "borrower" ? "customers" : "vet_practices";
  const database = getDb();
  const row = database
    .prepare(`SELECT id FROM ${table} WHERE id = ?`)
    .get(id) as { id: string } | undefined;

  if (!row) {
    throw new HttpError(404, "User not found");
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  database
    .prepare(
      `UPDATE ${table} SET
        password_hash = ?, must_change_password = 1,
        failed_login_attempts = 0, locked_at = NULL,
        updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(passwordHash, id);

  return { temporaryPassword };
}

export function adminUnlockUser(
  type: "borrower" | "practice",
  id: string,
): void {
  const table = type === "borrower" ? "customers" : "vet_practices";
  const database = getDb();
  const result = database
    .prepare(
      `UPDATE ${table} SET
        failed_login_attempts = 0, locked_at = NULL,
        updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(id);

  if (result.changes === 0) {
    throw new HttpError(404, "User not found");
  }
}
