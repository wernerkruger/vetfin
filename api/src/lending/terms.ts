/**
 * Loan pricing and repayment math.
 *
 * Pricing (see LOAN_PRICING):
 *   - The loan amount (what's paid to the clinic) accrues simple interest at 19% per
 *     year, charged monthly on the outstanding balance.
 *   - A 2% origination fee is charged separately and must be paid by the borrower
 *     before the loan is funded. It is not added to the loan.
 *
 * Truth in Lending (Reg Z) terms:
 *   The fee is a prepaid finance charge, so:
 *   Amount financed  = loan amount − origination fee
 *   Finance charge   = interest + origination fee
 *   Total of payments = sum of the monthly payments (= amount financed + finance charge)
 *   APR              = actuarial rate per Reg Z Appendix J (monthly unit period). Because
 *                      the fee counts, the APR is higher than the 19% interest rate.
 *
 * All money math is done in whole cents to avoid floating-point drift.
 */

export const LOAN_PRICING = {
  /** Annual interest rate on the loan amount, percent. */
  interestRatePct: 19,
  /** Origination fee as a percent of the loan amount. Paid up front, before funding. */
  originationFeePct: 2,
  /** Repayment terms offered to borrowers, in months. */
  termOptions: [6, 9, 12] as const,
  /** First payment is due this many days after the loan is funded; monthly after that. */
  firstPaymentDays: 30,
} as const;

export type TermMonths = (typeof LOAN_PRICING.termOptions)[number];

export function isOfferedTerm(value: number): value is TermMonths {
  return (LOAN_PRICING.termOptions as readonly number[]).includes(value);
}

export type ScheduledPayment = {
  number: number;
  /** Estimated due date (YYYY-MM-DD). Final dates are set when the loan is funded. */
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  balanceAfter: number;
};

export type RepaymentPlan = {
  termMonths: TermMonths;
  /** Loan amount = what's paid to the clinic = starting balance that accrues interest. */
  loanAmount: number;
  /** Origination fee, paid by the borrower before funding (prepaid finance charge). */
  originationFee: number;
  /** TILA amount financed = loan amount − prepaid origination fee. */
  amountFinanced: number;
  interestRatePct: number;
  originationFeePct: number;
  /** Regular monthly payment (all payments except possibly the last). */
  monthlyPayment: number;
  /** Last payment — differs from monthlyPayment by a few cents because of rounding. */
  finalPayment: number;
  totalInterest: number;
  financeCharge: number;
  totalOfPayments: number;
  /** Annual percentage rate, percent, rounded to 2 decimals. */
  apr: number;
  firstPaymentDueDate: string;
  schedule: ScheduledPayment[];
};

const toCents = (dollars: number) => Math.round(dollars * 100);
const toDollars = (cents: number) => cents / 100;

/** YYYY-MM-DD for a UTC date. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUtc(date: Date, days: number): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Adds months keeping the day of month, clamped to the end of shorter months. */
function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}

/** Monthly payment dates: first one `firstPaymentDays` after funding, then monthly. */
export function paymentDueDates(
  fundingDate: Date,
  termMonths: number,
): string[] {
  const first = addDaysUtc(fundingDate, LOAN_PRICING.firstPaymentDays);
  return Array.from({ length: termMonths }, (_, i) =>
    isoDate(addMonthsUtc(first, i)),
  );
}

/**
 * Reg Z Appendix J actuarial APR for payments one unit period (month) apart,
 * the first one unit period after funding. Returns percent, 2 decimals.
 */
export function computeApr(
  amountFinancedCents: number,
  paymentsCents: number[],
): number {
  const pv = (monthlyRate: number) =>
    paymentsCents.reduce(
      (sum, p, k) => sum + p / (1 + monthlyRate) ** (k + 1),
      0,
    );

  // PV falls as the rate rises; bisect for PV(rate) = amount financed.
  let lo = 0;
  let hi = 1; // 1200% APR — far above anything we price
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > amountFinancedCents) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 12 * 100 * 100) / 100;
}

export function computeRepaymentPlan(
  loanAmount: number,
  termMonths: TermMonths,
  fundingDate: Date = new Date(),
): RepaymentPlan {
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) {
    throw new Error("Loan amount must be positive");
  }
  if (!isOfferedTerm(termMonths)) {
    throw new Error(`Unsupported term: ${termMonths} months`);
  }

  const loanCents = toCents(loanAmount);
  const feeCents = Math.round(
    (loanCents * LOAN_PRICING.originationFeePct) / 100,
  );
  const amountFinancedCents = loanCents - feeCents;
  const r = LOAN_PRICING.interestRatePct / 100 / 12;

  const paymentCents = Math.round(
    (loanCents * r) / (1 - (1 + r) ** -termMonths),
  );
  const dueDates = paymentDueDates(fundingDate, termMonths);

  const schedule: ScheduledPayment[] = [];
  let balance = loanCents;
  let totalInterest = 0;
  for (let k = 1; k <= termMonths; k++) {
    const interest = Math.round(balance * r);
    const isLast = k === termMonths;
    // The last payment clears the balance, so it can differ by a few cents.
    const amount = isLast ? balance + interest : paymentCents;
    const principal = amount - interest;
    balance -= principal;
    totalInterest += interest;
    schedule.push({
      number: k,
      dueDate: dueDates[k - 1]!,
      amount: toDollars(amount),
      principal: toDollars(principal),
      interest: toDollars(interest),
      balanceAfter: toDollars(balance),
    });
  }

  const paymentsCents = schedule.map((p) => toCents(p.amount));
  const totalOfPaymentsCents = paymentsCents.reduce((a, b) => a + b, 0);

  return {
    termMonths,
    loanAmount: toDollars(loanCents),
    originationFee: toDollars(feeCents),
    amountFinanced: toDollars(amountFinancedCents),
    interestRatePct: LOAN_PRICING.interestRatePct,
    originationFeePct: LOAN_PRICING.originationFeePct,
    monthlyPayment: toDollars(paymentCents),
    finalPayment: toDollars(paymentsCents[paymentsCents.length - 1]!),
    totalInterest: toDollars(totalInterest),
    financeCharge: toDollars(totalInterest + feeCents),
    totalOfPayments: toDollars(totalOfPaymentsCents),
    apr: computeApr(amountFinancedCents, paymentsCents),
    firstPaymentDueDate: dueDates[0]!,
    schedule,
  };
}

export function computeRepaymentOptions(
  loanAmount: number,
  fundingDate: Date = new Date(),
): RepaymentPlan[] {
  return LOAN_PRICING.termOptions.map((term) =>
    computeRepaymentPlan(loanAmount, term, fundingDate),
  );
}
