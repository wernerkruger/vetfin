/**
 * Truth in Lending Act (Regulation Z, 12 CFR 1026.17–.18) closed-end credit disclosure.
 *
 * The borrower sees exactly what this builds, and the version they accept is stored
 * as JSON on the loan application (tila_disclosure_json) as the record of what was disclosed.
 *
 * NOTE: This is a starting template. Have counsel / your bank partner review the
 * wording, late-charge and prepayment terms before using it with real borrowers.
 */
import { createHash } from "node:crypto";
import { LOAN_PRICING, type RepaymentPlan } from "./terms.js";

export const TILA_DISCLOSURE_VERSION = "tila-closed-end-v2";

export type PaymentScheduleLine = {
  count: number;
  amount: number;
  /** Human-readable "when due" text. */
  when: string;
};

export type TilaDisclosure = {
  version: string;
  /** Changes whenever any disclosed term changes; the borrower must accept this exact value. */
  fingerprint: string;
  generatedAt: string;
  isEstimate: boolean;
  assumedFundingDate: string;
  creditor: { name: string; address: string | null };
  borrower: { name: string; address: string | null };
  applicationId: string;
  clinic: { name: string; location: string | null };
  // The "federal box"
  apr: number;
  financeCharge: number;
  amountFinanced: number;
  totalOfPayments: number;
  paymentSchedule: PaymentScheduleLine[];
  // Supporting detail
  termMonths: number;
  interestRatePct: number;
  /** Amount paid to the clinic; this is the balance that accrues interest. */
  loanAmount: number;
  /** Paid by the borrower before funding — a prepaid finance charge. */
  originationFee: number;
  originationFeePct: number;
  monthlyPayment: number;
  finalPayment: number;
  firstPaymentDueDate: string;
  schedule: RepaymentPlan["schedule"];
  itemization: {
    paidToClinicOnYourBehalf: number;
    paidToYouDirectly: number;
    /** Origination fee, paid by you before funding. Subtracted to get the amount financed. */
    prepaidFinanceCharge: number;
  };
  lateCharge: string;
  prepayment: string;
  security: string;
  additionalTerms: string;
  acceptance?: {
    acceptedAt: string;
    signatureName: string;
    esignConsentAt: string;
  };
};

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildPaymentSchedule(plan: RepaymentPlan): PaymentScheduleLine[] {
  const regular = plan.schedule.slice(0, -1);
  const last = plan.schedule[plan.schedule.length - 1]!;
  const firstDue = `${LOAN_PRICING.firstPaymentDays} days after your loan is funded (estimated ${formatDate(plan.firstPaymentDueDate)})`;

  if (last.amount === plan.monthlyPayment) {
    return [
      {
        count: plan.termMonths,
        amount: plan.monthlyPayment,
        when: `Monthly, starting ${firstDue}`,
      },
    ];
  }
  return [
    {
      count: regular.length,
      amount: plan.monthlyPayment,
      when: `Monthly, starting ${firstDue}`,
    },
    {
      count: 1,
      amount: last.amount,
      when: `Final payment, one month after the previous payment (estimated ${formatDate(last.dueDate)})`,
    },
  ];
}

/** Stable hash of every disclosed term (not the estimated dates, which move day to day). */
function fingerprintOf(
  d: Omit<TilaDisclosure, "fingerprint" | "acceptance">,
): string {
  const terms = {
    version: d.version,
    creditor: d.creditor,
    borrower: d.borrower,
    applicationId: d.applicationId,
    clinic: d.clinic.name,
    apr: d.apr,
    financeCharge: d.financeCharge,
    amountFinanced: d.amountFinanced,
    totalOfPayments: d.totalOfPayments,
    termMonths: d.termMonths,
    monthlyPayment: d.monthlyPayment,
    finalPayment: d.finalPayment,
    loanAmount: d.loanAmount,
    originationFee: d.originationFee,
    interestRatePct: d.interestRatePct,
    lateCharge: d.lateCharge,
    prepayment: d.prepayment,
    security: d.security,
  };
  return createHash("sha256")
    .update(JSON.stringify(terms))
    .digest("hex")
    .slice(0, 32);
}

export function buildTilaDisclosure(input: {
  plan: RepaymentPlan;
  applicationId: string;
  creditor: { name: string; address: string | null };
  borrower: { name: string; address: string | null };
  clinic: { name: string; location: string | null };
  assumedFundingDate?: Date;
}): TilaDisclosure {
  const { plan } = input;
  const fundingDate = input.assumedFundingDate ?? new Date();

  const base: Omit<TilaDisclosure, "fingerprint" | "acceptance"> = {
    version: TILA_DISCLOSURE_VERSION,
    generatedAt: new Date().toISOString(),
    isEstimate: true,
    assumedFundingDate: fundingDate.toISOString().slice(0, 10),
    creditor: input.creditor,
    borrower: input.borrower,
    applicationId: input.applicationId,
    clinic: input.clinic,
    apr: plan.apr,
    financeCharge: plan.financeCharge,
    amountFinanced: plan.amountFinanced,
    totalOfPayments: plan.totalOfPayments,
    paymentSchedule: buildPaymentSchedule(plan),
    termMonths: plan.termMonths,
    interestRatePct: plan.interestRatePct,
    loanAmount: plan.loanAmount,
    originationFee: plan.originationFee,
    originationFeePct: plan.originationFeePct,
    monthlyPayment: plan.monthlyPayment,
    finalPayment: plan.finalPayment,
    firstPaymentDueDate: plan.firstPaymentDueDate,
    schedule: plan.schedule,
    itemization: {
      paidToClinicOnYourBehalf: plan.loanAmount,
      paidToYouDirectly: 0,
      prepaidFinanceCharge: plan.originationFee,
    },
    lateCharge:
      "None. You will not be charged a late fee if a payment is late.",
    prepayment: `If you pay off early, you will not have to pay a penalty, and you will not be charged interest for the time after you pay off. You will not be entitled to a refund of the ${formatUsd(plan.originationFee)} origination fee, which is part of the finance charge.`,
    security: "None. This loan is unsecured.",
    additionalTerms:
      "See your loan agreement for any additional information about nonpayment, default, any required repayment in full before the scheduled date, and prepayment refunds and penalties.",
  };

  return { ...base, fingerprint: fingerprintOf(base) };
}
