import { randomUUID } from "node:crypto";
import { signBorrowerToken } from "../auth/jwt.js";
import {
  assertAccountCanLogin,
  clearLoginAttempts,
  recordFailedLogin,
} from "../auth/loginSecurity.js";
import { INVALID_CREDENTIALS_MESSAGE } from "../constants/auth.js";
import { hashPassword, verifyPassword } from "../crypto/password.js";
import { HttpError } from "../errors.js";
import { getDb } from "./connection.js";
import { protectSecret } from "./store.js";

export type BorrowerRow = {
  id: string;
  client_user_id: string;
  email: string | null;
  password_hash: string | null;
  failed_login_attempts: number;
  locked_at: string | null;
  must_change_password: number;
  applicant_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
  ssn_last4: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  practice_id: string | null;
  referral_slug: string | null;
  application_status: string;
  created_at: string;
  updated_at: string;
};

export function getBorrowerById(id: string): BorrowerRow | undefined {
  return getDb()
    .prepare("SELECT * FROM customers WHERE id = ?")
    .get(id) as BorrowerRow | undefined;
}

export function getBorrowerByEmail(email: string): BorrowerRow | undefined {
  return getDb()
    .prepare("SELECT * FROM customers WHERE email = ? COLLATE NOCASE")
    .get(email.trim().toLowerCase()) as BorrowerRow | undefined;
}

export function toPublicBorrower(row: BorrowerRow) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    applicantName: row.applicant_name,
    phone: row.phone,
    dateOfBirth: row.date_of_birth,
    hasSsnLast4: Boolean(row.ssn_last4),
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    zip: row.zip,
    mustChangePassword: row.must_change_password === 1,
    isLocked: row.locked_at !== null,
    failedLoginAttempts: row.failed_login_attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function registerBorrower(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  practiceId: string;
  referralSlug: string;
}): Promise<{ borrower: BorrowerRow; token: string }> {
  const existing = getBorrowerByEmail(input.email);
  if (existing?.password_hash) {
    const error = new Error("An account with this email already exists");
    (error as Error & { status: number }).status = 409;
    throw error;
  }

  const database = getDb();
  const passwordHash = await hashPassword(input.password);
  const email = input.email.trim().toLowerCase();
  const clientUserId = `borrower-${email}`;
  const applicantName = `${input.firstName.trim()} ${input.lastName.trim()}`;

  if (existing) {
    database
      .prepare(
        `UPDATE customers SET
          password_hash = ?, first_name = ?, last_name = ?, applicant_name = ?,
          practice_id = ?, referral_slug = ?, client_user_id = ?,
          updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(
        passwordHash,
        input.firstName.trim(),
        input.lastName.trim(),
        applicantName,
        input.practiceId,
        input.referralSlug,
        clientUserId,
        existing.id,
      );
    const borrower = getBorrowerById(existing.id)!;
    const token = await signBorrowerToken({
      sub: borrower.id,
      email: borrower.email ?? email,
    });
    return { borrower, token };
  }

  const id = randomUUID();
  database
    .prepare(
      `INSERT INTO customers (
        id, client_user_id, email, password_hash,
        first_name, last_name, applicant_name,
        practice_id, referral_slug, application_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    )
    .run(
      id,
      clientUserId,
      email,
      passwordHash,
      input.firstName.trim(),
      input.lastName.trim(),
      applicantName,
      input.practiceId,
      input.referralSlug,
    );

  const borrower = getBorrowerById(id)!;
  const token = await signBorrowerToken({
    sub: borrower.id,
    email,
  });
  return { borrower, token };
}

export async function loginBorrower(
  email: string,
  password: string,
): Promise<{ borrower: BorrowerRow; token: string; mustChangePassword: boolean }> {
  const borrower = getBorrowerByEmail(email);
  if (!borrower?.password_hash) {
    throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);
  }

  assertAccountCanLogin(borrower);

  const valid = await verifyPassword(password, borrower.password_hash);
  if (!valid) {
    recordFailedLogin("customers", borrower.id, borrower.failed_login_attempts);
  }

  clearLoginAttempts("customers", borrower.id);
  const refreshed = getBorrowerById(borrower.id)!;
  const token = await signBorrowerToken({
    sub: refreshed.id,
    email: refreshed.email ?? email,
  });
  return {
    borrower: refreshed,
    token,
    mustChangePassword: refreshed.must_change_password === 1,
  };
}

export async function changeBorrowerPassword(
  customerId: string,
  currentPassword: string,
  newPassword: string,
): Promise<BorrowerRow> {
  const borrower = getBorrowerById(customerId);
  if (!borrower?.password_hash) {
    throw new HttpError(404, "Account not found");
  }

  const valid = await verifyPassword(currentPassword, borrower.password_hash);
  if (!valid) {
    throw new HttpError(401, "Current password is incorrect");
  }

  const passwordHash = await hashPassword(newPassword);
  getDb()
    .prepare(
      `UPDATE customers SET
        password_hash = ?, must_change_password = 0,
        failed_login_attempts = 0, locked_at = NULL,
        updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(passwordHash, customerId);

  return getBorrowerById(customerId)!;
}

export function updateBorrowerProfile(
  customerId: string,
  input: {
    firstName: string;
    lastName: string;
    phone: string;
    dateOfBirth: string;
    ssnLast4: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    zip: string;
  },
): BorrowerRow {
  const applicantName = `${input.firstName.trim()} ${input.lastName.trim()}`;
  getDb()
    .prepare(
      `UPDATE customers SET
        first_name = ?, last_name = ?, applicant_name = ?,
        phone = ?, date_of_birth = ?, ssn_last4 = ?,
        address_line1 = ?, address_line2 = ?, city = ?, state = ?, zip = ?,
        updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      input.firstName.trim(),
      input.lastName.trim(),
      applicantName,
      input.phone.trim(),
      input.dateOfBirth,
      protectSecret(input.ssnLast4),
      input.addressLine1.trim(),
      input.addressLine2?.trim() ?? null,
      input.city.trim(),
      input.state.trim().toUpperCase(),
      input.zip.trim(),
      customerId,
    );

  return getBorrowerById(customerId)!;
}
