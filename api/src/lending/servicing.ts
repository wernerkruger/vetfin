/**
 * Loan servicing math (pure functions, no database):
 *   - applying payments to the installment schedule
 *   - next payment / overdue status
 *   - early payoff quote
 *
 * Money is handled in whole cents. Dates are calendar dates (YYYY-MM-DD) in the
 * lender's time zone (LOAN_TIME_ZONE).
 */

/** Business time zone used for "today", due dates and days overdue. */
export const LOAN_TIME_ZONE = "America/New_York";

export type InstallmentStatus =
  "scheduled" | "partial" | "paid" | "closed_early" | "written_off";

export type InstallmentInput = {
  id: string;
  number: number;
  dueDate: string;
  amountDueCents: number;
  principalCents: number;
  interestCents: number;
  /** Only "written_off" is respected as input; everything else is recomputed. */
  status: InstallmentStatus;
};

export type PaymentInput = {
  id: string;
  amountCents: number;
  receivedOn: string;
  kind: "regular" | "payoff";
  createdAt: string;
};

export type AllocatedInstallment = InstallmentInput & {
  amountPaidCents: number;
  status: InstallmentStatus;
  paidAt: string | null;
};

export type Allocation = {
  installments: AllocatedInstallment[];
  totalPaidCents: number;
  /** Every installment is settled (paid or closed early). */
  settled: boolean;
  /** Date the loan was settled, if it was. */
  settledOn: string | null;
  /** Money that couldn't be applied (more than was owed). Should be 0. */
  unappliedCents: number;
};

const OPEN: InstallmentStatus[] = ["scheduled", "partial"];
export const isOpen = (i: { status: InstallmentStatus }) =>
  OPEN.includes(i.status);

export function todayInLoanTz(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LOAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return dayNumber(toIso) - dayNumber(fromIso);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * Applies payments, oldest first, to the installments in order.
 * - A regular payment fills the oldest open installment, then the next, and so on.
 * - A payoff payment settles every remaining open installment ("closed_early").
 * Written-off installments are skipped.
 */
export function allocatePayments(
  installmentsIn: InstallmentInput[],
  paymentsIn: PaymentInput[],
): Allocation {
  const installments: AllocatedInstallment[] = [...installmentsIn]
    .sort((a, b) => a.number - b.number)
    .map((i) => ({
      ...i,
      amountPaidCents: 0,
      status: i.status === "written_off" ? "written_off" : "scheduled",
      paidAt: null,
    }));
  const payments = [...paymentsIn].sort(
    (a, b) =>
      a.receivedOn.localeCompare(b.receivedOn) ||
      a.createdAt.localeCompare(b.createdAt),
  );

  let unapplied = 0;
  let totalPaid = 0;
  let settledOn: string | null = null;

  for (const p of payments) {
    totalPaid += p.amountCents;
    let left = p.amountCents;
    const open = installments.filter(isOpen);
    if (open.length === 0) {
      unapplied += left;
      continue;
    }
    for (const inst of open) {
      const owed = inst.amountDueCents - inst.amountPaidCents;
      const take = Math.min(owed, left);
      inst.amountPaidCents += take;
      left -= take;
      if (p.kind === "payoff") {
        inst.status = "closed_early";
        inst.paidAt = p.receivedOn;
      } else if (inst.amountPaidCents >= inst.amountDueCents) {
        inst.status = "paid";
        inst.paidAt = p.receivedOn;
      } else if (inst.amountPaidCents > 0) {
        inst.status = "partial";
      }
      if (left === 0 && p.kind !== "payoff") break;
    }
    unapplied += left;
    const allSettled = installments.every(
      (i) => i.status === "paid" || i.status === "closed_early",
    );
    if (allSettled) settledOn ??= p.receivedOn;
  }

  const settled =
    installments.length > 0 &&
    installments.every(
      (i) => i.status === "paid" || i.status === "closed_early",
    );

  return {
    installments,
    totalPaidCents: totalPaid,
    settled,
    settledOn: settled ? settledOn : null,
    unappliedCents: unapplied,
  };
}

export type ServicingStatus = {
  nextDue: {
    installmentId: string;
    number: number;
    dueDate: string;
    amountCents: number;
  } | null;
  overdue: {
    amountCents: number;
    daysOverdue: number;
    installments: number;
  } | null;
  /** Sum of what's still owed on open installments as scheduled (includes future interest). */
  remainingScheduledCents: number;
  openInstallments: number;
};

export function servicingStatus(
  installments: AllocatedInstallment[],
  today: string,
): ServicingStatus {
  const open = installments.filter(isOpen).sort((a, b) => a.number - b.number);
  const late = open.filter((i) => i.dueDate < today);
  const first = open[0];
  return {
    nextDue: first
      ? {
          installmentId: first.id,
          number: first.number,
          dueDate: first.dueDate,
          amountCents: first.amountDueCents - first.amountPaidCents,
        }
      : null,
    overdue:
      late.length > 0
        ? {
            amountCents: late.reduce(
              (s, i) => s + i.amountDueCents - i.amountPaidCents,
              0,
            ),
            daysOverdue: daysBetween(late[0]!.dueDate, today),
            installments: late.length,
          }
        : null,
    remainingScheduledCents: open.reduce(
      (s, i) => s + i.amountDueCents - i.amountPaidCents,
      0,
    ),
    openInstallments: open.length,
  };
}

export type PayoffQuote = {
  asOf: string;
  principalCents: number;
  interestCents: number;
  totalCents: number;
};

/**
 * Amount to pay the loan off in full on `asOf`: unpaid principal plus interest earned so
 * far. Interest for installments already due is owed in full; the current period's interest
 * is prorated by days; future interest is not charged (as promised in the TILA disclosure).
 */
export function payoffQuote(
  installments: AllocatedInstallment[],
  fundedOn: string,
  asOf: string,
): PayoffQuote {
  const sorted = [...installments].sort((a, b) => a.number - b.number);
  let principal = 0;
  let interest = 0;
  let prevDue = fundedOn;
  let currentPeriodHandled = false;

  for (const inst of sorted) {
    const periodStart = prevDue;
    prevDue = inst.dueDate;
    if (!isOpen(inst)) continue;

    const interestPaid = Math.min(inst.amountPaidCents, inst.interestCents);
    const principalPaid = Math.max(
      0,
      inst.amountPaidCents - inst.interestCents,
    );
    principal += inst.principalCents - principalPaid;

    if (inst.dueDate <= asOf) {
      interest += inst.interestCents - interestPaid; // already earned
    } else if (!currentPeriodHandled) {
      currentPeriodHandled = true;
      const periodDays = Math.max(1, daysBetween(periodStart, inst.dueDate));
      const elapsed = Math.min(
        periodDays,
        Math.max(0, daysBetween(periodStart, asOf)),
      );
      const earned = Math.round((inst.interestCents * elapsed) / periodDays);
      interest += Math.max(0, earned - interestPaid);
    }
  }

  return {
    asOf,
    principalCents: principal,
    interestCents: interest,
    totalCents: principal + interest,
  };
}

export const toCents = (dollars: number) => Math.round(dollars * 100);
export const toDollars = (cents: number) => cents / 100;
