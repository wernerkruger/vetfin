import { getConfig } from "../config.js";
import { HttpError } from "../errors.js";
import {
  buildTilaDisclosure,
  type TilaDisclosure,
} from "../lending/disclosure.js";
import {
  computeRepaymentOptions,
  computeRepaymentPlan,
  isOfferedTerm,
  LOAN_PRICING,
} from "../lending/terms.js";
import {
  getApplicationById,
  getApplicationForBorrower,
  type LoanApplicationRow,
} from "./applications.js";
import { getBorrowerById, type BorrowerRow } from "./borrowers.js";
import { getDb, withTransaction } from "./connection.js";
import { getPracticeById } from "./practices.js";

/** Statuses from which the borrower may (re)choose a plan. */
const PLAN_SELECTABLE = ["bank_linked", "plan_selected"];

async function requireOwnApplication(
  applicationId: string,
  customerId: string,
): Promise<LoanApplicationRow> {
  const app = await getApplicationForBorrower(applicationId, customerId);
  if (!app) throw new HttpError(404, "Application not found");
  return app;
}

function requireLoanAmount(app: LoanApplicationRow): number {
  if (app.loan_amount == null || app.loan_amount <= 0) {
    throw new HttpError(400, "Enter your loan details first");
  }
  return app.loan_amount;
}

export async function getRepaymentOptions(
  applicationId: string,
  customerId: string,
) {
  const app = await requireOwnApplication(applicationId, customerId);
  const amount = requireLoanAmount(app);
  return {
    pricing: {
      interestRatePct: LOAN_PRICING.interestRatePct,
      originationFeePct: LOAN_PRICING.originationFeePct,
      firstPaymentDays: LOAN_PRICING.firstPaymentDays,
    },
    selectedTermMonths: app.plan_selected_at ? app.term_months : null,
    options: computeRepaymentOptions(amount),
  };
}

export async function selectRepaymentPlan(
  applicationId: string,
  customerId: string,
  termMonths: number,
): Promise<LoanApplicationRow> {
  const app = await requireOwnApplication(applicationId, customerId);
  if (!PLAN_SELECTABLE.includes(app.status)) {
    throw new HttpError(
      400,
      "Link a bank account before choosing a payment plan",
    );
  }
  if (!isOfferedTerm(termMonths)) {
    throw new HttpError(400, "Choose a 6, 9 or 12 month plan");
  }
  const plan = computeRepaymentPlan(requireLoanAmount(app), termMonths);

  await withTransaction(async () => {
    await getDb()
      .prepare(
        `UPDATE loan_applications SET
           term_months = ?, monthly_payment = ?, final_payment = ?,
           interest_rate = ?, apr = ?, origination_fee = ?,
           amount_financed = ?, finance_charge = ?, total_of_payments = ?,
           plan_selected_at = now_text(), status = 'plan_selected',
           updated_at = now_text()
         WHERE id = ?`,
      )
      .run(
        plan.termMonths,
        plan.monthlyPayment,
        plan.finalPayment,
        plan.interestRatePct,
        plan.apr,
        plan.originationFee,
        plan.amountFinanced,
        plan.financeCharge,
        plan.totalOfPayments,
        applicationId,
      );
    await getDb()
      .prepare(
        `UPDATE customers SET application_status = 'plan_selected', updated_at = now_text() WHERE id = ?`,
      )
      .run(customerId);
  });

  return (await getApplicationById(applicationId))!;
}

function borrowerName(b: BorrowerRow): string {
  return (
    [b.first_name, b.last_name].filter(Boolean).join(" ").trim() ||
    b.applicant_name ||
    ""
  );
}

function borrowerAddress(b: BorrowerRow): string | null {
  const cityLine = [b.city, [b.state, b.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return (
    [b.address_line1, b.address_line2, cityLine].filter(Boolean).join(", ") ||
    null
  );
}

/** Builds the disclosure from the application's current loan amount and chosen term. */
async function buildCurrentDisclosure(
  app: LoanApplicationRow,
): Promise<TilaDisclosure> {
  if (
    app.status !== "plan_selected" ||
    app.term_months == null ||
    !isOfferedTerm(app.term_months)
  ) {
    throw new HttpError(400, "Choose a payment plan first");
  }
  const [borrower, practice] = await Promise.all([
    getBorrowerById(app.customer_id),
    getPracticeById(app.practice_id),
  ]);
  if (!borrower || !practice) throw new HttpError(404, "Application not found");

  const plan = computeRepaymentPlan(requireLoanAmount(app), app.term_months);
  return buildTilaDisclosure({
    plan,
    applicationId: app.id,
    creditor: getConfig().lender,
    borrower: {
      name: borrowerName(borrower),
      address: borrowerAddress(borrower),
    },
    clinic: {
      name: practice.name,
      location:
        [practice.city, practice.state].filter(Boolean).join(", ") || null,
    },
  });
}

/** The disclosure to review (before acceptance) or the accepted copy (after). */
export async function getTilaDisclosure(
  applicationId: string,
  customerId: string,
): Promise<TilaDisclosure> {
  const app = await requireOwnApplication(applicationId, customerId);
  if (app.tila_disclosure_json) {
    return JSON.parse(app.tila_disclosure_json) as TilaDisclosure;
  }
  return buildCurrentDisclosure(app);
}

/** Accepted copy for admin views (no ownership check — caller must be admin). */
export async function getAcceptedTilaDisclosure(
  applicationId: string,
): Promise<TilaDisclosure | null> {
  const app = await getApplicationById(applicationId);
  if (!app?.tila_disclosure_json) return null;
  return JSON.parse(app.tila_disclosure_json) as TilaDisclosure;
}

const normalizeName = (s: string) =>
  s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Borrower accepts the Truth in Lending disclosure (e-signature) and submits the
 * application in one step. The exact disclosure accepted is stored on the application.
 */
export async function acceptDisclosureAndSubmit(
  applicationId: string,
  customerId: string,
  input: {
    fingerprint: string;
    signatureName: string;
    esignConsent: boolean;
    acknowledged: boolean;
    ipAddress: string | null;
    userAgent: string | null;
  },
): Promise<LoanApplicationRow> {
  const app = await requireOwnApplication(applicationId, customerId);
  if (app.status !== "plan_selected") {
    throw new HttpError(400, "Choose a payment plan before submitting");
  }
  if (!input.esignConsent) {
    throw new HttpError(
      400,
      "Please agree to receive disclosures and sign electronically",
    );
  }
  if (!input.acknowledged) {
    throw new HttpError(
      400,
      "Please confirm you have read the Truth in Lending disclosure",
    );
  }

  const disclosure = await buildCurrentDisclosure(app);
  if (input.fingerprint !== disclosure.fingerprint) {
    throw new HttpError(
      409,
      "Your loan terms have changed since you opened this page. Please review the updated disclosure.",
    );
  }
  if (
    normalizeName(input.signatureName) !==
    normalizeName(disclosure.borrower.name)
  ) {
    throw new HttpError(
      400,
      `Type your full name exactly as shown: ${disclosure.borrower.name}`,
    );
  }

  const signatureName = input.signatureName.trim().replace(/\s+/g, " ");
  const acceptedAt = new Date().toISOString();
  const accepted: TilaDisclosure = {
    ...disclosure,
    acceptance: {
      acceptedAt,
      signatureName,
      esignConsentAt: acceptedAt,
    },
  };

  await withTransaction(async () => {
    const { changes } = await getDb()
      .prepare(
        `UPDATE loan_applications SET
           tila_accepted_at = now_text(),
           tila_esign_consent_at = now_text(),
           tila_signature_name = ?,
           tila_ip_address = ?,
           tila_user_agent = ?,
           tila_disclosure_json = ?,
           status = 'submitted',
           updated_at = now_text()
         WHERE id = ? AND status = 'plan_selected'`,
      )
      .run(
        signatureName,
        input.ipAddress,
        input.userAgent?.slice(0, 500) ?? null,
        JSON.stringify(accepted),
        applicationId,
      );
    if (changes === 0) {
      throw new HttpError(409, "This application was already submitted");
    }
    await getDb()
      .prepare(
        `UPDATE customers SET application_status = 'submitted', updated_at = now_text() WHERE id = ?`,
      )
      .run(customerId);
  });

  return (await getApplicationById(applicationId))!;
}
