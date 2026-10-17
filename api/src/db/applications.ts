import { randomUUID } from "node:crypto";
import {
  ANIMAL_TYPES,
  APPLICATION_STATUSES,
  borrowerStatusLabel,
  disbursementStatusLabel,
  IN_PROGRESS_STATUSES,
  loanTermsVisible,
  practiceStatusLabel,
  SERVICE_TYPES,
  type AnimalType,
  type ApplicationStatus,
  type DisbursementStatus,
  type ServiceType,
  type VetApprovedValue,
} from "../constants/application.js";
import { HttpError } from "../errors.js";
import { todayInLoanTz } from "../lending/servicing.js";
import {
  createScheduleForFundedLoan,
  getServicingSummaries,
} from "./loanServicing.js";
import { getDb, withTransaction } from "./connection.js";
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
  disbursement_status: string | null;
  disbursed_at: string | null;
  amount_financed: number | null;
  origination_fee: number | null;
  final_payment: number | null;
  finance_charge: number | null;
  total_of_payments: number | null;
  apr: number | null;
  plan_selected_at: string | null;
  first_payment_due_date: string | null;
  tila_accepted_at: string | null;
  tila_signature_name: string | null;
  tila_esign_consent_at: string | null;
  tila_ip_address: string | null;
  tila_user_agent: string | null;
  tila_disclosure_json: string | null;
  origination_fee_paid_at: string | null;
  origination_fee_marked_paid_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  written_off_at: string | null;
  written_off_by: string | null;
  write_off_reason: string | null;
  written_off_amount: number | null;
  paid_off_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeSummary = {
  name: string;
  city?: string | null;
  state?: string | null;
};

function practiceLocation(practice?: PracticeSummary): string | null {
  if (!practice) return null;
  return [practice.city, practice.state].filter(Boolean).join(", ") || null;
}

/** "due" until the up-front origination fee is recorded as paid; null if there's no fee. */
export function originationFeeStatus(
  row: LoanApplicationRow,
): "due" | "paid" | null {
  if (row.origination_fee == null || row.origination_fee <= 0) return null;
  return row.origination_fee_paid_at ? "paid" : "due";
}

function assertOriginationFeePaid(row: LoanApplicationRow, action: string) {
  if (originationFeeStatus(row) === "due") {
    throw new HttpError(
      400,
      `The $${row.origination_fee!.toFixed(2)} origination fee must be paid before this loan can be ${action}`,
    );
  }
}

/** The borrower's chosen repayment plan (null until they pick one). */
function toPublicRepaymentPlan(row: LoanApplicationRow) {
  if (!row.plan_selected_at || row.term_months == null) return null;
  return {
    termMonths: row.term_months,
    monthlyPayment: row.monthly_payment,
    finalPayment: row.final_payment,
    interestRate: row.interest_rate,
    apr: row.apr,
    originationFee: row.origination_fee,
    amountFinanced: row.amount_financed,
    financeCharge: row.finance_charge,
    totalOfPayments: row.total_of_payments,
    firstPaymentDueDate: row.first_payment_due_date,
    selectedAt: row.plan_selected_at,
    tilaAcceptedAt: row.tila_accepted_at,
    originationFeeStatus: originationFeeStatus(row),
    originationFeePaidAt: row.origination_fee_paid_at,
  };
}

function normalizeVetApproved(
  value: number | null | undefined,
): VetApprovedValue {
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
  practice?: PracticeSummary,
) {
  const status = assertStatus(row.status);
  const showTerms = loanTermsVisible(status);
  const vetApproved = normalizeVetApproved(row.vet_approved);

  return {
    id: row.id,
    customerId: row.customer_id,
    practiceId: row.practice_id,
    practiceName: practice?.name ?? null,
    practiceLocation: practiceLocation(practice),
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
    disbursementStatus: row.disbursement_status as DisbursementStatus | null,
    disbursementStatusLabel: disbursementStatusLabel(row.disbursement_status),
    disbursedAt: row.disbursed_at,
    repaymentPlan: toPublicRepaymentPlan(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getApplicationById(
  id: string,
): Promise<LoanApplicationRow | undefined> {
  return (await getDb()
    .prepare("SELECT * FROM loan_applications WHERE id = ?")
    .get(id)) as LoanApplicationRow | undefined;
}

export async function getApplicationForBorrower(
  applicationId: string,
  customerId: string,
): Promise<LoanApplicationRow | undefined> {
  const row = await getApplicationById(applicationId);
  if (!row || row.customer_id !== customerId) return undefined;
  return row;
}

export async function getOrCreateDraftApplication(
  customerId: string,
  practiceId: string,
  referralSlug: string,
): Promise<LoanApplicationRow> {
  const database = getDb();
  const placeholders = IN_PROGRESS_STATUSES.map(() => "?").join(", ");
  const existing = (await database
    .prepare(
      `SELECT * FROM loan_applications
       WHERE customer_id = ? AND practice_id = ? AND status IN (${placeholders})
       ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(customerId, practiceId, ...IN_PROGRESS_STATUSES)) as
    LoanApplicationRow | undefined;

  if (existing) return existing;

  const id = randomUUID();
  await database
    .prepare(
      `INSERT INTO loan_applications (
        id, customer_id, practice_id, referral_slug, status
      ) VALUES (?, ?, ?, ?, 'draft')`,
    )
    .run(id, customerId, practiceId, referralSlug);

  return (await getApplicationById(id))!;
}

/** Columns reset whenever the loan amount changes, so the borrower must re-pick a plan. */
const CLEAR_REPAYMENT_PLAN_SQL = `
        term_months = NULL, monthly_payment = NULL, final_payment = NULL,
        interest_rate = NULL, apr = NULL, origination_fee = NULL,
        amount_financed = NULL, finance_charge = NULL, total_of_payments = NULL,
        plan_selected_at = NULL`;

export async function updateApplicationProfile(
  applicationId: string,
  customerId: string,
): Promise<LoanApplicationRow> {
  const app = await getApplicationForBorrower(applicationId, customerId);
  if (!app) {
    const error = new Error("Application not found");
    (error as Error & { status: number }).status = 404;
    throw error;
  }

  const borrower = await getBorrowerById(customerId);
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

  await getDb()
    .prepare(
      `UPDATE loan_applications SET status = 'profile_complete', updated_at = now_text() WHERE id = ?`,
    )
    .run(applicationId);

  await getDb()
    .prepare(
      `UPDATE customers SET application_status = 'profile_complete', updated_at = now_text() WHERE id = ?`,
    )
    .run(customerId);

  return (await getApplicationById(applicationId))!;
}

export async function updateApplicationLoanDetails(
  applicationId: string,
  customerId: string,
  input: {
    loanAmount: number;
    serviceType: ServiceType;
    animalType: AnimalType;
    animalName?: string;
  },
): Promise<LoanApplicationRow> {
  const app = await getApplicationForBorrower(applicationId, customerId);
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

  await getDb()
    .prepare(
      `UPDATE loan_applications SET
        loan_amount = ?, service_type = ?, animal_type = ?, animal_name = ?,
        status = 'loan_details',
        ${CLEAR_REPAYMENT_PLAN_SQL},
        updated_at = now_text()
       WHERE id = ?`,
    )
    .run(
      Math.round(input.loanAmount),
      input.serviceType,
      input.animalType,
      input.animalName?.trim() ?? null,
      applicationId,
    );

  await getDb()
    .prepare(
      `UPDATE customers SET application_status = 'loan_details', updated_at = now_text() WHERE id = ?`,
    )
    .run(customerId);

  return (await getApplicationById(applicationId))!;
}

export async function markApplicationBankLinked(
  applicationId: string,
  customerId: string,
): Promise<LoanApplicationRow> {
  const app = await getApplicationForBorrower(applicationId, customerId);
  if (!app) {
    const error = new Error("Application not found");
    (error as Error & { status: number }).status = 404;
    throw error;
  }

  await getDb()
    .prepare(
      `UPDATE loan_applications SET status = 'bank_linked', updated_at = now_text() WHERE id = ?`,
    )
    .run(applicationId);

  await getDb()
    .prepare(
      `UPDATE customers SET application_status = 'bank_linked', updated_at = now_text() WHERE id = ?`,
    )
    .run(customerId);

  return (await getApplicationById(applicationId))!;
}

export async function cancelApplicationSubmission(
  applicationId: string,
  customerId: string,
): Promise<LoanApplicationRow> {
  const app = await getApplicationForBorrower(applicationId, customerId);
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

  await getDb()
    .prepare(
      `UPDATE loan_applications SET status = 'cancelled', updated_at = now_text() WHERE id = ?`,
    )
    .run(applicationId);

  await getDb()
    .prepare(
      `UPDATE customers SET application_status = 'cancelled', updated_at = now_text() WHERE id = ?`,
    )
    .run(customerId);

  return (await getApplicationById(applicationId))!;
}

export async function getApplicationForPractice(
  applicationId: string,
  practiceId: string,
): Promise<LoanApplicationRow | undefined> {
  const row = await getApplicationById(applicationId);
  if (!row || row.practice_id !== practiceId) return undefined;
  return row;
}

export async function setVetApproval(
  applicationId: string,
  practiceId: string,
  approved: boolean,
): Promise<LoanApplicationRow> {
  const app = await getApplicationForPractice(applicationId, practiceId);
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
    await database
      .prepare(
        `UPDATE loan_applications
         SET vet_approved = 1, vet_reviewed_at = now_text(), updated_at = now_text()
         WHERE id = ?`,
      )
      .run(applicationId);
  } else {
    await database
      .prepare(
        `UPDATE loan_applications
         SET vet_approved = 0, vet_reviewed_at = now_text(),
             status = 'cancelled', updated_at = now_text()
         WHERE id = ?`,
      )
      .run(applicationId);

    await database
      .prepare(
        `UPDATE customers SET application_status = 'cancelled', updated_at = now_text() WHERE id = ?`,
      )
      .run(app.customer_id);
  }

  return (await getApplicationById(applicationId))!;
}

export async function adminApproveApplication(
  applicationId: string,
): Promise<LoanApplicationRow> {
  const app = await getApplicationById(applicationId);
  if (!app) {
    throw new HttpError(404, "Application not found");
  }
  if (app.status !== "submitted") {
    throw new HttpError(400, "Only submitted applications can be approved");
  }
  if (normalizeVetApproved(app.vet_approved) !== 1) {
    throw new HttpError(
      400,
      "The clinic must confirm this application before it can be approved for funding",
    );
  }
  assertOriginationFeePaid(app, "approved");

  const database = getDb();
  await database
    .prepare(
      `UPDATE loan_applications
       SET status = 'approved',
           approved_at = now_text(),
           disbursement_status = 'pending',
           updated_at = now_text()
       WHERE id = ?`,
    )
    .run(applicationId);

  await database
    .prepare(
      `UPDATE customers SET application_status = 'approved', updated_at = now_text() WHERE id = ?`,
    )
    .run(app.customer_id);

  return (await getApplicationById(applicationId))!;
}

export async function adminDeclineApplication(
  applicationId: string,
): Promise<LoanApplicationRow> {
  const app = await getApplicationById(applicationId);
  if (!app) {
    throw new HttpError(404, "Application not found");
  }
  if (app.status !== "submitted") {
    throw new HttpError(400, "Only submitted applications can be declined");
  }
  if (normalizeVetApproved(app.vet_approved) !== 1) {
    throw new HttpError(
      400,
      "The clinic must confirm this application before it can be declined for funding",
    );
  }

  const database = getDb();
  await database
    .prepare(
      `UPDATE loan_applications
       SET status = 'declined', updated_at = now_text()
       WHERE id = ?`,
    )
    .run(applicationId);

  await database
    .prepare(
      `UPDATE customers SET application_status = 'declined', updated_at = now_text() WHERE id = ?`,
    )
    .run(app.customer_id);

  return (await getApplicationById(applicationId))!;
}

export async function listApplicationsForAdmin(customerId: string) {
  const rows = (await getDb()
    .prepare(
      `SELECT la.*, vp.name AS practice_name
       FROM loan_applications la
       INNER JOIN vet_practices vp ON vp.id = la.practice_id
       WHERE la.customer_id = ?
       ORDER BY la.updated_at DESC`,
    )
    .all(customerId)) as Array<LoanApplicationRow & { practice_name: string }>;

  return rows.map(mapAdminApplicationRow);
}

/** Clinic-confirmed applications awaiting VetFin funding approve/decline. */
export async function listAdminPendingFundingApplications() {
  const rows = (await getDb()
    .prepare(
      `SELECT
         la.*,
         vp.name AS practice_name,
         c.email AS borrower_email,
         c.applicant_name,
         c.first_name,
         c.last_name
       FROM loan_applications la
       INNER JOIN vet_practices vp ON vp.id = la.practice_id
       INNER JOIN customers c ON c.id = la.customer_id
       WHERE la.status = 'submitted'
         AND la.vet_approved = 1
       ORDER BY la.updated_at DESC`,
    )
    .all()) as Array<
    LoanApplicationRow & {
      practice_name: string;
      borrower_email: string | null;
      applicant_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }
  >;

  return rows.map((row) => {
    const borrowerName =
      row.applicant_name?.trim() ||
      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
      row.borrower_email ||
      "Borrower";

    return {
      ...mapAdminApplicationRow(row),
      borrowerName,
      borrowerEmail: row.borrower_email,
    };
  });
}

export async function countAdminPendingFundingApplications(): Promise<number> {
  const row = (await getDb()
    .prepare(
      `SELECT COUNT(*) AS n
       FROM loan_applications
       WHERE status = 'submitted'
         AND vet_approved = 1`,
    )
    .get()) as { n: number };
  return row.n ?? 0;
}

export async function countAdminPendingDisbursements(): Promise<number> {
  const row = (await getDb()
    .prepare(
      `SELECT COUNT(*) AS n
       FROM loan_applications
       WHERE status = 'approved'
         AND disbursement_status = 'pending'`,
    )
    .get()) as { n: number };
  return row.n ?? 0;
}

function mapAdminApplicationRow(
  row: LoanApplicationRow & { practice_name: string },
) {
  const vetApproved = normalizeVetApproved(row.vet_approved);
  const publicApp = toPublicApplication(row, { name: row.practice_name });
  return {
    ...publicApp,
    practiceStatusLabel: practiceStatusLabel(row.status, vetApproved),
    canApproveFunding:
      row.status === "submitted" &&
      vetApproved === 1 &&
      originationFeeStatus(row) !== "due",
    canMarkOriginationFeePaid:
      originationFeeStatus(row) === "due" &&
      ["submitted", "approved"].includes(row.status),
    canDeclineFunding: row.status === "submitted" && vetApproved === 1,
  };
}

export type AdminDisbursementRow = {
  applicationId: string;
  customerId: string;
  borrowerName: string;
  borrowerEmail: string | null;
  practiceName: string;
  loanAmount: number | null;
  serviceType: string | null;
  animalName: string | null;
  animalType: string | null;
  approvedAt: string | null;
  disbursementStatus: DisbursementStatus;
  disbursementStatusLabel: string;
  disbursedAt: string | null;
  updatedAt: string;
};

export async function listAdminDisbursements(): Promise<
  AdminDisbursementRow[]
> {
  const rows = (await getDb()
    .prepare(
      `SELECT
         la.id AS application_id,
         la.customer_id,
         la.loan_amount,
         la.service_type,
         la.animal_name,
         la.animal_type,
         la.approved_at,
         la.disbursement_status,
         la.disbursed_at,
         la.updated_at,
         vp.name AS practice_name,
         c.email AS borrower_email,
         c.applicant_name,
         c.first_name,
         c.last_name
       FROM loan_applications la
       INNER JOIN vet_practices vp ON vp.id = la.practice_id
       INNER JOIN customers c ON c.id = la.customer_id
       WHERE la.status = 'approved'
         AND la.disbursement_status IS NOT NULL
       ORDER BY
         CASE la.disbursement_status WHEN 'pending' THEN 0 ELSE 1 END,
         la.approved_at DESC`,
    )
    .all()) as Array<{
    application_id: string;
    customer_id: string;
    loan_amount: number | null;
    service_type: string | null;
    animal_name: string | null;
    animal_type: string | null;
    approved_at: string | null;
    disbursement_status: string;
    disbursed_at: string | null;
    updated_at: string;
    practice_name: string;
    borrower_email: string | null;
    applicant_name: string | null;
    first_name: string | null;
    last_name: string | null;
  }>;

  return rows.map((row) => {
    const borrowerName =
      row.applicant_name?.trim() ||
      [row.first_name, row.last_name].filter(Boolean).join(" ") ||
      row.borrower_email ||
      "Borrower";

    const status = row.disbursement_status as DisbursementStatus;

    return {
      applicationId: row.application_id,
      customerId: row.customer_id,
      borrowerName,
      borrowerEmail: row.borrower_email,
      practiceName: row.practice_name,
      loanAmount: row.loan_amount,
      serviceType: row.service_type,
      animalName: row.animal_name,
      animalType: row.animal_type,
      approvedAt: row.approved_at,
      disbursementStatus: status,
      disbursementStatusLabel: disbursementStatusLabel(status) ?? status,
      disbursedAt: row.disbursed_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * Record that the borrower paid the up-front origination fee. Manual for now (no payment
 * provider yet); a card/ACH integration can call the same function when a payment settles.
 */
export async function adminMarkOriginationFeePaid(
  applicationId: string,
  markedBy: string,
): Promise<LoanApplicationRow> {
  const app = await getApplicationById(applicationId);
  if (!app) {
    throw new HttpError(404, "Application not found");
  }
  if (originationFeeStatus(app) !== "due") {
    throw new HttpError(
      400,
      "There is no unpaid origination fee on this application",
    );
  }
  if (!["submitted", "approved"].includes(app.status)) {
    throw new HttpError(
      400,
      "The fee can only be recorded on a submitted application",
    );
  }
  await getDb()
    .prepare(
      `UPDATE loan_applications
       SET origination_fee_paid_at = now_text(),
           origination_fee_marked_paid_by = ?,
           updated_at = now_text()
       WHERE id = ?`,
    )
    .run(markedBy, applicationId);
  return (await getApplicationById(applicationId))!;
}

/** Mark funds as sent. Callable manually now; future automation can use the same path. */
export async function adminMarkDisbursementSent(
  applicationId: string,
): Promise<LoanApplicationRow> {
  const app = await getApplicationById(applicationId);
  if (!app) {
    throw new HttpError(404, "Application not found");
  }
  if (app.status !== "approved") {
    throw new HttpError(400, "Only fully approved loans can be disbursed");
  }
  if (app.disbursement_status !== "pending") {
    throw new HttpError(400, "This disbursement is not pending");
  }
  assertOriginationFeePaid(app, "funded");

  await withTransaction(async () => {
    const fundingDate = todayInLoanTz();
    const firstDue = await createScheduleForFundedLoan(app, fundingDate);
    await getDb()
      .prepare(
        `UPDATE loan_applications
         SET disbursement_status = 'disbursed',
             disbursed_at = now_text(),
             status = 'active',
             first_payment_due_date = ?,
             term_months_remaining = term_months,
             updated_at = now_text()
         WHERE id = ?`,
      )
      .run(firstDue, applicationId);
  });

  return (await getApplicationById(applicationId))!;
}

export async function listLoansForBorrower(customerId: string) {
  const rows = (await getDb()
    .prepare(
      `SELECT la.*, vp.name AS practice_name, vp.city AS practice_city,
              vp.state AS practice_state
       FROM loan_applications la
       INNER JOIN vet_practices vp ON vp.id = la.practice_id
       WHERE la.customer_id = ?
       ORDER BY la.updated_at DESC`,
    )
    .all(customerId)) as Array<
    LoanApplicationRow & {
      practice_name: string;
      practice_city: string | null;
      practice_state: string | null;
    }
  >;

  const servicing = await getServicingSummaries(rows);
  return rows.map((row) => {
    const summary = servicing.get(row.id);
    return {
      ...toPublicApplication(row, {
        name: row.practice_name,
        city: row.practice_city,
        state: row.practice_state,
      }),
      // What the borrower needs: next payment and anything overdue.
      nextPayment: summary?.hasSchedule ? summary.nextDue : null,
      overdue: summary?.hasSchedule ? summary.overdue : null,
    };
  });
}

export async function listApplicationsForBorrower(customerId: string) {
  return await listLoansForBorrower(customerId);
}

export async function getBorrowerDashboard(customerId: string) {
  const loans = await listLoansForBorrower(customerId);
  const inProgress = loans.filter((l) =>
    (IN_PROGRESS_STATUSES as readonly string[]).includes(l.status),
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
