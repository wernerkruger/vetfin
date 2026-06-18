import { getDb } from "./connection.js";

type MonthlyCount = { month: string; count: number };
type MonthlyAmount = { month: string; amount: number; count: number };

export type RepaymentBucket = "paid_off" | "on_time" | "behind" | "pending_first";

export type AdminBiAnalytics = {
  generatedAt: string;
  practices: {
    total: number;
    monthlySignups: MonthlyCount[];
    monthOverMonthGrowthPct: number | null;
  };
  borrowers: {
    total: number;
    totalWithLogin: number;
    monthlySignups: MonthlyCount[];
    monthOverMonthGrowthPct: number | null;
  };
  disbursements: {
    totalAmount: number;
    totalCount: number;
    pendingAmount: number;
    pendingCount: number;
    monthly: MonthlyAmount[];
    monthOverMonthGrowthPct: number | null;
  };
  repayments: {
    totalActiveLoans: number;
    byCount: Record<RepaymentBucket, number>;
    byOutstandingPrincipal: Record<RepaymentBucket, number>;
    delinquentAmount: number;
    countSharePct: Record<RepaymentBucket, number>;
    principalSharePct: Record<RepaymentBucket, number>;
  };
};

type RepaymentLoanRow = {
  id: string;
  status: string;
  loan_amount: number | null;
  amount_repaid: number;
  monthly_payment: number | null;
  term_months: number | null;
  disbursement_status: string | null;
  disbursed_at: string | null;
  approved_at: string | null;
};

function monthOverMonthGrowth(monthly: { value: number }[]): number | null {
  if (monthly.length < 2) return null;
  const last = monthly[monthly.length - 1]!.value;
  const prev = monthly[monthly.length - 2]!.value;
  if (prev === 0) return last > 0 ? 100 : 0;
  return Math.round(((last - prev) / prev) * 1000) / 10;
}

function monthsElapsedSince(isoDate: string): number {
  const start = new Date(isoDate);
  const now = new Date();
  return Math.max(
    0,
    (now.getFullYear() - start.getFullYear()) * 12 +
      (now.getMonth() - start.getMonth()),
  );
}

function effectiveMonthlyPayment(row: RepaymentLoanRow): number | null {
  if (row.monthly_payment != null && row.monthly_payment > 0) {
    return row.monthly_payment;
  }
  if (
    row.loan_amount != null &&
    row.loan_amount > 0 &&
    row.term_months != null &&
    row.term_months > 0
  ) {
    return row.loan_amount / row.term_months;
  }
  return null;
}

function expectedRepaid(row: RepaymentLoanRow): number {
  const principal = row.loan_amount ?? 0;
  const monthly = effectiveMonthlyPayment(row);
  const start = row.disbursed_at ?? row.approved_at;
  if (!monthly || !principal || !start) return 0;

  const dueMonths = monthsElapsedSince(start);
  return Math.min(dueMonths * monthly, principal);
}

function categorizeRepayment(row: RepaymentLoanRow): RepaymentBucket | null {
  if (row.status === "paid_off") return "paid_off";
  if (row.disbursement_status !== "disbursed") return null;

  const repaid = row.amount_repaid ?? 0;
  const expected = expectedRepaid(row);

  if (expected <= 0 && repaid <= 0) return "pending_first";
  if (repaid + 1 >= expected) return "on_time";
  return "behind";
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function getAdminBiAnalytics(): AdminBiAnalytics {
  const database = getDb();

  const practiceMonthly = database
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
       FROM vet_practices
       GROUP BY month
       ORDER BY month`,
    )
    .all() as MonthlyCount[];

  const practiceTotal = database
    .prepare("SELECT COUNT(*) AS n FROM vet_practices")
    .get() as { n: number };

  const borrowerMonthly = database
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count
       FROM customers
       WHERE email IS NOT NULL
       GROUP BY month
       ORDER BY month`,
    )
    .all() as MonthlyCount[];

  const borrowerTotals = database
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END) AS with_login
       FROM customers
       WHERE email IS NOT NULL`,
    )
    .get() as { total: number; with_login: number };

  const disbursementMonthly = database
    .prepare(
      `SELECT
         strftime('%Y-%m', disbursed_at) AS month,
         COUNT(*) AS count,
         COALESCE(SUM(loan_amount), 0) AS amount
       FROM loan_applications
       WHERE disbursement_status = 'disbursed' AND disbursed_at IS NOT NULL
       GROUP BY month
       ORDER BY month`,
    )
    .all() as MonthlyAmount[];

  const disbursementTotals = database
    .prepare(
      `SELECT
         COUNT(*) AS disbursed_count,
         COALESCE(SUM(loan_amount), 0) AS disbursed_amount,
         SUM(CASE WHEN disbursement_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
         COALESCE(SUM(CASE WHEN disbursement_status = 'pending' THEN loan_amount ELSE 0 END), 0) AS pending_amount
       FROM loan_applications
       WHERE status = 'approved' AND disbursement_status IS NOT NULL`,
    )
    .get() as {
    disbursed_count: number;
    disbursed_amount: number;
    pending_count: number;
    pending_amount: number;
  };

  const repaymentLoans = database
    .prepare(
      `SELECT id, status, loan_amount, amount_repaid, monthly_payment, term_months,
              disbursement_status, disbursed_at, approved_at
       FROM loan_applications
       WHERE status = 'paid_off'
          OR disbursement_status = 'disbursed'`,
    )
    .all() as RepaymentLoanRow[];

  const byCount: Record<RepaymentBucket, number> = {
    paid_off: 0,
    on_time: 0,
    behind: 0,
    pending_first: 0,
  };
  const byOutstanding: Record<RepaymentBucket, number> = {
    paid_off: 0,
    on_time: 0,
    behind: 0,
    pending_first: 0,
  };
  let delinquentAmount = 0;

  for (const loan of repaymentLoans) {
    const bucket = categorizeRepayment(loan);
    if (!bucket) continue;

    byCount[bucket] += 1;
    const principal = loan.loan_amount ?? 0;
    const repaid = loan.amount_repaid ?? 0;
    const outstanding = Math.max(0, principal - repaid);
    byOutstanding[bucket] += outstanding;

    if (bucket === "behind") {
      delinquentAmount += Math.max(0, expectedRepaid(loan) - repaid);
    }
  }

  const totalActiveLoans =
    byCount.paid_off +
    byCount.on_time +
    byCount.behind +
    byCount.pending_first;
  const totalOutstanding =
    byOutstanding.paid_off +
    byOutstanding.on_time +
    byOutstanding.behind +
    byOutstanding.pending_first;

  return {
    generatedAt: new Date().toISOString(),
    practices: {
      total: practiceTotal.n ?? 0,
      monthlySignups: practiceMonthly,
      monthOverMonthGrowthPct: monthOverMonthGrowth(
        practiceMonthly.map((m) => ({ value: m.count })),
      ),
    },
    borrowers: {
      total: borrowerTotals.total ?? 0,
      totalWithLogin: borrowerTotals.with_login ?? 0,
      monthlySignups: borrowerMonthly,
      monthOverMonthGrowthPct: monthOverMonthGrowth(
        borrowerMonthly.map((m) => ({ value: m.count })),
      ),
    },
    disbursements: {
      totalAmount: disbursementTotals.disbursed_amount ?? 0,
      totalCount: disbursementTotals.disbursed_count ?? 0,
      pendingAmount: disbursementTotals.pending_amount ?? 0,
      pendingCount: disbursementTotals.pending_count ?? 0,
      monthly: disbursementMonthly,
      monthOverMonthGrowthPct: monthOverMonthGrowth(
        disbursementMonthly.map((m) => ({ value: m.amount })),
      ),
    },
    repayments: {
      totalActiveLoans,
      byCount,
      byOutstandingPrincipal: byOutstanding,
      delinquentAmount,
      countSharePct: {
        paid_off: pct(byCount.paid_off, totalActiveLoans),
        on_time: pct(byCount.on_time, totalActiveLoans),
        behind: pct(byCount.behind, totalActiveLoans),
        pending_first: pct(byCount.pending_first, totalActiveLoans),
      },
      principalSharePct: {
        paid_off: pct(byOutstanding.paid_off, totalOutstanding),
        on_time: pct(byOutstanding.on_time, totalOutstanding),
        behind: pct(byOutstanding.behind, totalOutstanding),
        pending_first: pct(byOutstanding.pending_first, totalOutstanding),
      },
    },
  };
}
