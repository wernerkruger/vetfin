import { randomUUID } from "node:crypto";
import {
  ANIMAL_TYPES,
  APPLICATION_STATUSES,
  borrowerStatusLabel,
  IN_PROGRESS_STATUSES,
  loanTermsVisible,
  SERVICE_TYPES,
  type AnimalType,
  type ApplicationStatus,
  type ServiceType,
  type VetApprovedValue,
} from "../constants/application.js";
import { getDb } from "./connection.js";
import { getBorrowerById } from "./borrowers.js";

export type LoanApplicationRow = {
  id: string;
  customer_id: string;
  practice_id: string;
  referral_slug: string;
  status: string;
  loan_amount: number | null;
  service_type: string | null;
  animal_type: string | null;
  animal_name: string | null;
  amount_repaid: number;
  monthly_payment: number | null;
  term_months: number | null;
  term_months_remaining: number | null;
  interest_rate: number | null;
  approved_at: string | null;
  vet_approved: number | null;
  vet_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeVetApproved(value: number | null | undefined): VetApprovedValue {
  if (value === 1) return 1;
  if (value === 0) return 0;
  return null;
}

function assertStatus(value: string): ApplicationStatus {
  if (!(APPLICATION_STATUSES as readonly string[]).includes(value)) {
    throw new Error(`Invalid status: ${value}`);
  }
  return value as ApplicationStatus;
}

export function toPublicApplication(
  row: LoanApplicationRow,
  practice?: { name: string },
) {
  const status = assertStatus(row.status);
  const showTerms = loanTermsVisible(status);
  const vetApproved = normalizeVetApproved(row.vet_approved);

  return {
    id: row.id,
    customerId: row.customer_id,
    practiceId: row.practice_id,
    practiceName: practice?.name ?? null,
    referralSlug: row.referral_slug,
    status,
    vetApproved,
    vetReviewedAt: row.vet_reviewed_at,
    statusLabel: borrowerStatusLabel(status, vetApproved),
    loanAmount: row.loan_amount,
    serviceType: row.service_type as ServiceType | null,
    animalType: row.animal_type as AnimalType | null,
    animalName: row.animal_name,
    amountRepaid: showTerms ? (row.amount_repaid ?? 0) : null,
    monthlyPayment: showTerms ? row.monthly_payment : null,
    termMonths: showTerms ? row.term_months : null,
    termMonthsRemaining: showTerms ? row.term_months_remaining : null,
    interestRate: showTerms ? row.interest_rate : null,
    approvedAt: showTerms ? row.approved_at : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getApplicationById(id: string): LoanApplicationRow | undefined {
  return getDb()
    .prepare("SELECT * FROM loan_applications WHERE id = ?")
    .get(id) as LoanApplicationRow | undefined;
}

export function getApplicationForBorrower(
  applicationId: string,
  customerId: string,
): LoanApplicationRow | undefined {
  const row = getApplicationById(applicationId);
  if (!row || row.customer_id !== customerId) return undefined;
  return row;
}

export function getOrCreateDraftApplication(
  customerId: string,
  practiceId: string,
  referralSlug: string,
): LoanApplicationRow {
  const database = getDb();
  const placeholders = IN_PROGRESS_STATUSES.map(() => "?").join(", ");
  const existing = database
    .prepare(
      `SELECT * FROM loan_applications
       WHERE customer_id = ? AND practice_id = ? AND status IN (${placeholders})
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(customerId, practiceId, ...IN_PROGRESS_STATUSES) as
    | LoanApplicationRow
    | undefined;

  if (existing) return existing;

  const id = randomUUID();
  database
    .prepare(
      `INSERT INTO loan_applications (
        id, customer_id, practice_id, referral_slug, status
      ) VALUES (?, ?, ?, ?, 'draft')`,
    )
    .run(id, customerId, practiceId, referralSlug);

  return getApplicationById(id)!;
}

export function updateApplicationProfile(
  applicationId: string,
  customerId: string,
): LoanApplicationRow {
  const app = getApplicationForBorrower(applicationId, customerId);
  if (!app) {
    const error = new Error("Application not found");
    (error as Error & { status: number }).status = 404;
    throw error;
  }

  const borrower = getBorrowerById(customerId);
  if (
    !borrower?.first_name ||
    !borrower.last_name ||
    !borrower.phone ||
    !borrower.date_of_birth ||
    !borrower.ssn_last4 ||
    !borrower.address_line1 ||
    !borrower.city ||
    !borrower.state ||
    !borrower.zip
  ) {
    const error = new Error("Complete your profile before continuing");
    (error as Error & { status: number }).status = 400;
    throw error;
  }

  getDb()
    .prepare(
      `UPDATE loan_applications SET status = 'profile_complete', updated_at = datetime('now') WHERE id = ?`,
    )
    .run(applicationId);

  getDb()
    .prepare(
      `UPDATE customers SET application_status = 'profile_complete', updated_at = datetime('now') WHERE id = ?`,
    )
    .run(customerId);

  return getApplicationById(applicationId)!;
}

export function updateApplicationLoanDetails(
  applicationId: string,
  customerId: string,
  input: {
    loanAmount: number;
    serviceType: ServiceType;
    animalType: AnimalType;
    animalName?: string;
  },
): LoanApplicationRow {
  const app = getApplicationForBorrower(applicationId, customerId);
  if (!app) {
    const error = new Error("Application not found");
    (error as Error & { status: number }).status = 404;
    throw error;
  }

  if (!(SERVICE_TYPES as readonly string[]).includes(input.serviceType)) {
    throw new Error("Invalid service type");
  }
  if (!(ANIMAL_TYPES as readonly string[]).includes(input.animalType)) {
    throw new Error("Invalid animal type");
  }

  getDb()
    .prepare(
      `UPDATE loan_applications SET
        loan_amount = ?, service_type = ?, animal_type = ?, animal_name = ?,
        status = 'loan_details', updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      Math.round(input.loanAmount),
      input.serviceType,
      input.animalType,
      input.animalName?.trim() ?? null,
      applicationId,
    );

  getDb()
    .prepare(
      `UPDATE customers SET application_status = 'loan_details', updated_at = datetime('now') WHERE id = ?`,
    )
    .run(customerId);

  return getApplicationById(applicationId)!;
}

export function markApplicationBankLinked(
  applicationId: string,
  customerId: string,
): LoanApplicationRow {
  const app = getApplicationForBorrower(applicationId, customerId);
  if (!app) {
    const error = new Error("Application not found");
    (error as Error & { status: number }).status = 404;
    throw error;
  }

  getDb()
    .prepare(
      `UPDATE loan_applications SET status = 'bank_linked', updated_at = datetime('now') WHERE id = ?`,
    )
    .run(applicationId);

  getDb()
    .prepare(
      `UPDATE customers SET application_status = 'bank_linked', updated_at = datetime('now') WHERE id = ?`,
    )
    .run(customerId);

  return getApplicationById(applicationId)!;
}

export function submitApplication(
  applicationId: string,
  customerId: string,
): LoanApplicationRow {
  const app = getApplicationForBorrower(applicationId, customerId);
  if (!app) {
    const error = new Error("Application not found");
    (error as Error & { status: number }).status = 404;
    throw error;
  }

  if (app.status !== "bank_linked") {
    const error = new Error("Link a bank account before submitting");
    (error as Error & { status: number }).status = 400;
    throw error;
  }

  getDb()
    .prepare(
      `UPDATE loan_applications SET status = 'submitted', updated_at = datetime('now') WHERE id = ?`,
    )
    .run(applicationId);

  getDb()
    .prepare(
      `UPDATE customers SET application_status = 'submitted', updated_at = datetime('now') WHERE id = ?`,
    )
    .run(customerId);

  return getApplicationById(applicationId)!;
}

export function cancelApplicationSubmission(
  applicationId: string,
  customerId: string,
): LoanApplicationRow {
  const app = getApplicationForBorrower(applicationId, customerId);
  if (!app) {
    const error = new Error("Application not found");
    (error as Error & { status: number }).status = 404;
    throw error;
  }

  if (app.status !== "submitted") {
    const error = new Error("Only pending applications can be cancelled");
    (error as Error & { status: number }).status = 400;
    throw error;
  }

  getDb()
    .prepare(
      `UPDATE loan_applications SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    )
    .run(applicationId);

  getDb()
    .prepare(
      `UPDATE customers SET application_status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    )
    .run(customerId);

  return getApplicationById(applicationId)!;
}

export function getApplicationForPractice(
  applicationId: string,
  practiceId: string,
): LoanApplicationRow | undefined {
  const row = getApplicationById(applicationId);
  if (!row || row.practice_id !== practiceId) return undefined;
  return row;
}

export function setVetApproval(
  applicationId: string,
  practiceId: string,
  approved: boolean,
): LoanApplicationRow {
  const app = getApplicationForPractice(applicationId, practiceId);
  if (!app) {
    const error = new Error("Application not found");
    (error as Error & { status: number }).status = 404;
    throw error;
  }

  if (app.status !== "submitted") {
    const error = new Error("Only submitted applications can be reviewed");
    (error as Error & { status: number }).status = 400;
    throw error;
  }

  if (app.vet_approved !== null) {
    const error = new Error("This application has already been reviewed");
    (error as Error & { status: number }).status = 400;
    throw error;
  }

  const database = getDb();

  if (approved) {
    database
      .prepare(
        `UPDATE loan_applications
         SET vet_approved = 1, vet_reviewed_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(applicationId);
  } else {
    database
      .prepare(
        `UPDATE loan_applications
         SET vet_approved = 0, vet_reviewed_at = datetime('now'),
             status = 'cancelled', updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(applicationId);

    database
      .prepare(
        `UPDATE customers SET application_status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
      )
      .run(app.customer_id);
  }

  return getApplicationById(applicationId)!;
}

export function listLoansForBorrower(customerId: string) {
  const rows = getDb()
    .prepare(
      `SELECT la.*, vp.name AS practice_name
       FROM loan_applications la
       INNER JOIN vet_practices vp ON vp.id = la.practice_id
       WHERE la.customer_id = ?
       ORDER BY la.updated_at DESC`,
    )
    .all(customerId) as Array<LoanApplicationRow & { practice_name: string }>;

  return rows.map((row) =>
    toPublicApplication(row, { name: row.practice_name }),
  );
}

export function listApplicationsForBorrower(customerId: string) {
  return listLoansForBorrower(customerId);
}

export function getBorrowerDashboard(customerId: string) {
  const loans = listLoansForBorrower(customerId);
  const inProgress = loans.filter((l) =>
    ["draft", "profile_complete", "loan_details", "bank_linked"].includes(
      l.status,
    ),
  );
  const submitted = loans.filter((l) => l.status === "submitted");
  const activeLoans = loans.filter((l) =>
    ["approved", "active", "paid_off"].includes(l.status),
  );
  const declined = loans.filter((l) => l.status === "declined");

  const practiceSlugs = [...new Set(loans.map((l) => l.referralSlug))].map(
    (referralSlug) => {
      const loan = loans.find((l) => l.referralSlug === referralSlug)!;
      return {
        slug: referralSlug,
        practiceName: loan.practiceName ?? referralSlug,
      };
    },
  );

  return {
    loans,
    inProgress,
    submitted,
    activeLoans,
    declined,
    practiceSlugs,
  };
}
