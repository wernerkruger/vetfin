import { randomUUID } from "node:crypto";
import { getConfig } from "../config.js";
import {
  IN_PROGRESS_STATUSES,
  needsVetReview,
  practiceStatusLabel,
} from "../constants/application.js";
import {
  assertAccountCanLogin,
  clearLoginAttempts,
  recordFailedLogin,
} from "../auth/loginSecurity.js";
import { INVALID_CREDENTIALS_MESSAGE } from "../constants/auth.js";
import { signPracticeToken } from "../auth/jwt.js";
import { hashPassword, verifyPassword } from "../crypto/password.js";
import { HttpError } from "../errors.js";
import { slugifyName, randomSlugSuffix } from "../utils/slug.js";
import { getDb } from "./connection.js";

export type VetPracticeRow = {
  id: string;
  name: string;
  slug: string;
  email: string;
  password_hash: string;
  failed_login_attempts: number;
  locked_at: string | null;
  must_change_password: number;
  contact_name: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeSignupInput = {
  name: string;
  email: string;
  password: string;
  contactName?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
};

function uniqueSlug(base: string): string {
  const database = getDb();
  let slug = base || `practice-${randomSlugSuffix()}`;
  let attempt = 0;

  while (attempt < 20) {
    const existing = database
      .prepare("SELECT id FROM vet_practices WHERE slug = ?")
      .get(slug);
    if (!existing) return slug;
    slug = `${base}-${randomSlugSuffix()}`;
    attempt += 1;
  }

  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function createVetPractice(
  input: PracticeSignupInput,
): Promise<VetPracticeRow> {
  const database = getDb();
  const baseSlug = slugifyName(input.name);
  const slug = uniqueSlug(baseSlug);
  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();

  try {
    database
      .prepare(
        `INSERT INTO vet_practices (
          id, name, slug, email, password_hash,
          contact_name, phone, address_line1, city, state, zip
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name.trim(),
        slug,
        input.email.trim().toLowerCase(),
        passwordHash,
        input.contactName?.trim() ?? null,
        input.phone?.trim() ?? null,
        input.addressLine1?.trim() ?? null,
        input.city?.trim() ?? null,
        input.state?.trim() ?? null,
        input.zip?.trim() ?? null,
      );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message.includes("UNIQUE constraint failed: vet_practices.email")) {
      const error = new Error("An account with this email already exists");
      (error as Error & { status: number }).status = 409;
      throw error;
    }
    throw err;
  }

  return database
    .prepare("SELECT * FROM vet_practices WHERE id = ?")
    .get(id) as VetPracticeRow;
}

export async function loginPractice(
  email: string,
  password: string,
): Promise<{ practice: VetPracticeRow; token: string; mustChangePassword: boolean }> {
  const practice = getPracticeByEmail(email);
  if (!practice) {
    throw new HttpError(401, INVALID_CREDENTIALS_MESSAGE);
  }

  assertAccountCanLogin(practice);

  const valid = await verifyPassword(password, practice.password_hash);
  if (!valid) {
    recordFailedLogin("vet_practices", practice.id, practice.failed_login_attempts);
  }

  clearLoginAttempts("vet_practices", practice.id);
  const refreshed = getPracticeById(practice.id)!;
  const token = await signPracticeToken({
    sub: refreshed.id,
    email: refreshed.email,
    slug: refreshed.slug,
  });
  return {
    practice: refreshed,
    token,
    mustChangePassword: refreshed.must_change_password === 1,
  };
}

export async function changePracticePassword(
  practiceId: string,
  currentPassword: string,
  newPassword: string,
): Promise<VetPracticeRow> {
  const practice = getPracticeById(practiceId);
  if (!practice) {
    throw new HttpError(404, "Practice not found");
  }

  const valid = await verifyPassword(currentPassword, practice.password_hash);
  if (!valid) {
    throw new HttpError(401, "Current password is incorrect");
  }

  const passwordHash = await hashPassword(newPassword);
  getDb()
    .prepare(
      `UPDATE vet_practices SET
        password_hash = ?, must_change_password = 0,
        failed_login_attempts = 0, locked_at = NULL,
        updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(passwordHash, practiceId);

  return getPracticeById(practiceId)!;
}

export function getPracticeById(id: string): VetPracticeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM vet_practices WHERE id = ?")
    .get(id) as VetPracticeRow | undefined;
}

export function getPracticeByEmail(email: string): VetPracticeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM vet_practices WHERE email = ?")
    .get(email.trim().toLowerCase()) as VetPracticeRow | undefined;
}

export function getPracticeBySlug(slug: string): VetPracticeRow | undefined {
  return getDb()
    .prepare("SELECT * FROM vet_practices WHERE slug = ?")
    .get(slug.trim().toLowerCase()) as VetPracticeRow | undefined;
}

export function toPublicPractice(row: VetPracticeRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    email: row.email,
    contactName: row.contact_name,
    phone: row.phone,
    addressLine1: row.address_line1,
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

export function getReferralUrl(slug: string): string {
  const base = getConfig().publicAppUrl.replace(/\/$/, "");
  return `${base}/apply/${slug}`;
}

function displayApplicantName(row: {
  applicant_name: string | null;
  first_name: string | null;
  last_name: string | null;
}): string | null {
  if (row.applicant_name?.trim()) return row.applicant_name.trim();
  const parts = [row.first_name, row.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function mapPracticeReferralRow(r: {
  application_id: string | null;
  customer_id: string;
  client_user_id: string;
  email: string | null;
  applicant_name: string | null;
  first_name: string | null;
  last_name: string | null;
  referral_slug: string | null;
  loan_status: string | null;
  vet_approved: number | null;
  customer_status: string | null;
  loan_amount: number | null;
  service_type: string | null;
  animal_type: string | null;
  animal_name: string | null;
  created_at: string;
  updated_at: string;
}) {
  const status = r.loan_status ?? r.customer_status ?? "started";
  const vetApproved =
    r.vet_approved === 1 ? 1 : r.vet_approved === 0 ? 0 : null;

  return {
    id: r.application_id ?? r.customer_id,
    customerId: r.customer_id,
    clientUserId: r.client_user_id,
    email: r.email,
    applicantName: displayApplicantName(r),
    applicationStatus: status,
    vetApproved,
    needsVetReview: needsVetReview(status, vetApproved),
    statusLabel: practiceStatusLabel(status, vetApproved),
    referralSlug: r.referral_slug,
    applicationId: r.application_id,
    loanAmount: r.loan_amount,
    serviceType: r.service_type,
    animalType: r.animal_type,
    animalName: r.animal_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getPracticeReferrals(practiceId: string) {
  const database = getDb();

  const applications = database
    .prepare(
      `SELECT
         la.id AS application_id,
         c.id AS customer_id,
         c.client_user_id,
         c.email,
         c.applicant_name,
         c.first_name,
         c.last_name,
         la.referral_slug,
         la.status AS loan_status,
         la.vet_approved,
         c.application_status AS customer_status,
         la.loan_amount,
         la.service_type,
         la.animal_type,
         la.animal_name,
         la.created_at,
         la.updated_at
       FROM loan_applications la
       INNER JOIN customers c ON c.id = la.customer_id
       WHERE la.practice_id = ?
       ORDER BY la.updated_at DESC`,
    )
    .all(practiceId) as Array<{
    application_id: string;
    customer_id: string;
    client_user_id: string;
    email: string | null;
    applicant_name: string | null;
    first_name: string | null;
    last_name: string | null;
    referral_slug: string;
    loan_status: string;
    vet_approved: number | null;
    customer_status: string;
    loan_amount: number | null;
    service_type: string | null;
    animal_type: string | null;
    animal_name: string | null;
    created_at: string;
    updated_at: string;
  }>;

  type ReferralRow = Parameters<typeof mapPracticeReferralRow>[0];

  const legacyOnly = database
    .prepare(
      `SELECT
         NULL AS application_id,
         c.id AS customer_id,
         c.client_user_id,
         c.email,
         c.applicant_name,
         c.first_name,
         c.last_name,
         c.referral_slug,
         NULL AS loan_status,
         NULL AS vet_approved,
         c.application_status AS customer_status,
         NULL AS loan_amount,
         NULL AS service_type,
         NULL AS animal_type,
         NULL AS animal_name,
         c.created_at,
         c.updated_at
       FROM customers c
       WHERE c.practice_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM loan_applications la
           WHERE la.customer_id = c.id AND la.practice_id = ?
         )
       ORDER BY c.created_at DESC`,
    )
    .all(practiceId, practiceId) as ReferralRow[];

  return [...applications, ...legacyOnly].map(mapPracticeReferralRow);
}

export function getPracticeStats(practiceId: string) {
  const inProgressList = IN_PROGRESS_STATUSES.map((s) => `'${s}'`).join(", ");
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'submitted' AND vet_approved IS NULL THEN 1 ELSE 0 END) AS submitted,
         SUM(CASE WHEN status = 'submitted' AND vet_approved = 1 THEN 1 ELSE 0 END) AS vet_approved,
         SUM(CASE WHEN status IN (${inProgressList}) THEN 1 ELSE 0 END) AS in_progress
       FROM loan_applications
       WHERE practice_id = ?`,
    )
    .get(practiceId) as {
    total: number;
    submitted: number;
    vet_approved: number;
    in_progress: number;
  };

  const legacy = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM customers c
       WHERE c.practice_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM loan_applications la
           WHERE la.customer_id = c.id AND la.practice_id = ?
         )`,
    )
    .get(practiceId, practiceId) as { n: number };

  const legacyCount = legacy.n ?? 0;

  return {
    totalApplications: (row.total ?? 0) + legacyCount,
    submitted: row.submitted ?? 0,
    vetApproved: row.vet_approved ?? 0,
    started: (row.in_progress ?? 0) + legacyCount,
  };
}

export function createApplicantFromReferral(input: {
  practiceId: string;
  referralSlug: string;
  applicantName: string;
  email: string;
  phone?: string;
}) {
  const database = getDb();
  const clientUserId = `apply-${randomUUID()}`;
  const id = randomUUID();

  database
    .prepare(
      `INSERT INTO customers (
        id, client_user_id, email, applicant_name,
        practice_id, referral_slug, application_status
      ) VALUES (?, ?, ?, ?, ?, ?, 'started')`,
    )
    .run(
      id,
      clientUserId,
      input.email.trim().toLowerCase(),
      input.applicantName.trim(),
      input.practiceId,
      input.referralSlug,
    );

  const row = database
    .prepare("SELECT * FROM customers WHERE id = ?")
    .get(id) as {
    id: string;
    client_user_id: string;
    email: string | null;
    applicant_name: string | null;
    practice_id: string | null;
    referral_slug: string | null;
    application_status: string;
    created_at: string;
  };

  return {
    id: row.id,
    clientUserId: row.client_user_id,
    email: row.email,
    applicantName: row.applicant_name,
    practiceId: row.practice_id,
    referralSlug: row.referral_slug,
    applicationStatus: row.application_status,
    createdAt: row.created_at,
  };
}
