/**
 * Loan servicing for admins: payment schedule, payments, rescheduling, cancel / write-off,
 * contact notes and the audit log.
 *
 * The installment table is the source of truth for what's owed and when. After any change
 * to payments or the schedule, recomputeLoan() re-applies every payment from scratch so the
 * stored state can never drift from the payment history.
 */
import { randomUUID } from "node:crypto";
import { HttpError } from "../errors.js";
import {
  addDays,
  allocatePayments,
  daysBetween,
  isOpen,
  payoffQuote,
  servicingStatus,
  todayInLoanTz,
  toCents,
  toDollars,
  type AllocatedInstallment,
  type InstallmentStatus,
  type PaymentInput,
} from "../lending/servicing.js";
import { computeRepaymentPlan, isOfferedTerm } from "../lending/terms.js";
import {
  getApplicationById,
  toPublicApplication,
  type LoanApplicationRow,
} from "./applications.js";
import { getDb, withTransaction } from "./connection.js";

// ---------- types ----------

type InstallmentRow = {
  id: string;
  loan_application_id: string;
  number: number;
  due_date: string;
  original_due_date: string;
  amount_due: number;
  principal: number;
  interest: number;
  amount_paid: number;
  status: InstallmentStatus;
  paid_at: string | null;
};

type PaymentRow = {
  id: string;
  loan_application_id: string;
  amount: number;
  received_on: string;
  method: string;
  reference: string | null;
  kind: "regular" | "payoff";
  recorded_by: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
};

type NoteRow = {
  id: string;
  loan_application_id: string;
  body: string;
  contact_method: string | null;
  author: string;
  created_at: string;
};

type AuditRow = {
  id: string;
  loan_application_id: string | null;
  action: string;
  reason: string | null;
  details_json: string;
  actor: string;
  created_at: string;
};

export const PAYMENT_METHODS = [
  "ach",
  "card",
  "check",
  "cash",
  "wire",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CONTACT_METHODS = [
  "phone",
  "email",
  "sms",
  "in_person",
  "other",
] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];

/** Loans list filters. "loans" = everything past the application stage. */
export const LOAN_FILTERS = [
  "all",
  "active",
  "overdue",
  "pending",
  "paid_off",
  "cancelled",
  "written_off",
] as const;
export type LoanFilter = (typeof LOAN_FILTERS)[number];

const LOAN_STATUSES = [
  "submitted",
  "approved",
  "active",
  "paid_off",
  "written_off",
  "cancelled",
  "declined",
];

/**
 * Millisecond-precision UTC timestamp for history rows, so several actions in the same
 * second still sort in the order they happened (now_text() only has seconds).
 */
function preciseNow(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

// ---------- audit ----------

export async function audit(
  loanApplicationId: string | null,
  action: string,
  actor: string,
  opts: { reason?: string | null; details?: Record<string, unknown> } = {},
): Promise<void> {
  await getDb()
    .prepare(
      `INSERT INTO admin_audit_log (id, loan_application_id, action, reason, details_json, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      loanApplicationId,
      action,
      opts.reason ?? null,
      JSON.stringify(opts.details ?? {}),
      actor,
      preciseNow(),
    );
}

// ---------- helpers ----------

async function requireLoan(id: string): Promise<LoanApplicationRow> {
  const loan = await getApplicationById(id);
  if (!loan || !LOAN_STATUSES.includes(loan.status)) {
    throw new HttpError(404, "Loan not found");
  }
  return loan;
}

function requireReason(reason: string | undefined | null): string {
  const r = reason?.trim();
  if (!r) throw new HttpError(400, "Please give a reason");
  return r;
}

async function loadInstallments(loanId: string): Promise<InstallmentRow[]> {
  return (await getDb()
    .prepare(
      "SELECT * FROM loan_installments WHERE loan_application_id = ? ORDER BY number",
    )
    .all(loanId)) as InstallmentRow[];
}

async function loadPayments(loanId: string): Promise<PaymentRow[]> {
  return (await getDb()
    .prepare(
      `SELECT * FROM loan_payments WHERE loan_application_id = ?
       ORDER BY received_on DESC, created_at DESC`,
    )
    .all(loanId)) as PaymentRow[];
}

function toInstallmentInput(r: InstallmentRow) {
  return {
    id: r.id,
    number: r.number,
    dueDate: r.due_date,
    amountDueCents: toCents(r.amount_due),
    principalCents: toCents(r.principal),
    interestCents: toCents(r.interest),
    status: r.status,
  };
}

function toPaymentInput(r: PaymentRow): PaymentInput {
  return {
    id: r.id,
    amountCents: toCents(r.amount),
    receivedOn: r.received_on,
    kind: r.kind,
    createdAt: r.created_at,
  };
}

function allocate(installments: InstallmentRow[], payments: PaymentRow[]) {
  return allocatePayments(
    installments.map(toInstallmentInput),
    payments.filter((p) => !p.voided_at).map(toPaymentInput),
  );
}

function fundedOn(loan: LoanApplicationRow): string {
  return (loan.disbursed_at ?? loan.approved_at ?? loan.created_at).slice(
    0,
    10,
  );
}

/** Re-applies all payments and stores the result on the installments and the loan. */
export async function recomputeLoan(loanId: string): Promise<void> {
  const loan = await requireLoan(loanId);
  const installments = await loadInstallments(loanId);
  if (installments.length === 0) return;
  const allocation = allocate(installments, await loadPayments(loanId));
  if (allocation.unappliedCents > 0) {
    throw new HttpError(
      400,
      "That payment is more than the amount still owed on this loan",
    );
  }

  for (const inst of allocation.installments) {
    await getDb()
      .prepare(
        `UPDATE loan_installments
         SET amount_paid = ?, status = ?, paid_at = ?, updated_at = now_text()
         WHERE id = ?`,
      )
      .run(toDollars(inst.amountPaidCents), inst.status, inst.paidAt, inst.id);
  }

  const open = allocation.installments.filter(isOpen).length;
  let status = loan.status;
  if (loan.status === "active" && allocation.settled) status = "paid_off";
  if (loan.status === "paid_off" && !allocation.settled) status = "active";

  await getDb()
    .prepare(
      `UPDATE loan_applications
       SET amount_repaid = ?, term_months_remaining = ?, status = ?,
           paid_off_at = ?, updated_at = now_text()
       WHERE id = ?`,
    )
    .run(
      toDollars(allocation.totalPaidCents),
      open,
      status,
      status === "paid_off" ? allocation.settledOn : null,
      loanId,
    );
  if (status !== loan.status) {
    await getDb()
      .prepare(
        `UPDATE customers SET application_status = ?, updated_at = now_text() WHERE id = ?`,
      )
      .run(status, loan.customer_id);
  }
}

// ---------- schedule creation (called when a loan is funded) ----------

/**
 * Creates the installment schedule for a newly funded loan. Returns the first due date,
 * or null for loans without a chosen plan (funded before plans existed).
 */
export async function createScheduleForFundedLoan(
  loan: LoanApplicationRow,
  fundingDate: string,
): Promise<string | null> {
  if (
    loan.loan_amount == null ||
    loan.term_months == null ||
    !isOfferedTerm(loan.term_months)
  ) {
    return null;
  }
  const plan = computeRepaymentPlan(
    loan.loan_amount,
    loan.term_months,
    new Date(`${fundingDate}T12:00:00Z`),
  );
  for (const p of plan.schedule) {
    await getDb()
      .prepare(
        `INSERT INTO loan_installments (
           id, loan_application_id, number, due_date, original_due_date,
           amount_due, principal, interest
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (loan_application_id, number) DO NOTHING`,
      )
      .run(
        randomUUID(),
        loan.id,
        p.number,
        p.dueDate,
        p.dueDate,
        p.amount,
        p.principal,
        p.interest,
      );
  }
  return plan.firstPaymentDueDate;
}

// ---------- read models ----------

function summarize(
  loan: LoanApplicationRow,
  installments: AllocatedInstallment[],
  today: string,
) {
  if (installments.length === 0) {
    return { hasSchedule: false as const };
  }
  const st = servicingStatus(installments, today);
  const isServicing = loan.status === "active";
  const quote = isServicing
    ? payoffQuote(installments, fundedOn(loan), today)
    : null;
  return {
    hasSchedule: true as const,
    nextDue:
      isServicing && st.nextDue
        ? {
            dueDate: st.nextDue.dueDate,
            amount: toDollars(st.nextDue.amountCents),
          }
        : null,
    overdue:
      isServicing && st.overdue
        ? {
            amount: toDollars(st.overdue.amountCents),
            daysOverdue: st.overdue.daysOverdue,
            installments: st.overdue.installments,
          }
        : null,
    remainingScheduled: toDollars(st.remainingScheduledCents),
    payoff: quote
      ? {
          asOf: quote.asOf,
          principal: toDollars(quote.principalCents),
          interest: toDollars(quote.interestCents),
          total: toDollars(quote.totalCents),
        }
      : null,
    paymentsRemaining: st.openInstallments,
  };
}

export type ServicingSummary = ReturnType<typeof summarize>;

/** Servicing summaries for many loans at once (loans list, borrower dashboard). */
export async function getServicingSummaries(
  loans: LoanApplicationRow[],
): Promise<Map<string, ServicingSummary>> {
  const ids = loans.map((l) => l.id);
  const out = new Map<string, ServicingSummary>();
  if (ids.length === 0) return out;
  const placeholders = ids.map(() => "?").join(", ");
  const [instRows, payRows] = await Promise.all([
    getDb()
      .prepare(
        `SELECT * FROM loan_installments WHERE loan_application_id IN (${placeholders}) ORDER BY number`,
      )
      .all(...ids) as Promise<InstallmentRow[]>,
    getDb()
      .prepare(
        `SELECT * FROM loan_payments WHERE loan_application_id IN (${placeholders}) AND voided_at IS NULL`,
      )
      .all(...ids) as Promise<PaymentRow[]>,
  ]);
  const today = todayInLoanTz();
  for (const loan of loans) {
    const inst = instRows.filter((r) => r.loan_application_id === loan.id);
    const pays = payRows.filter((r) => r.loan_application_id === loan.id);
    out.set(loan.id, summarize(loan, allocate(inst, pays).installments, today));
  }
  return out;
}

type LoanListRow = LoanApplicationRow & {
  practice_name: string;
  borrower_email: string | null;
  applicant_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

function borrowerName(r: {
  applicant_name: string | null;
  first_name: string | null;
  last_name: string | null;
  borrower_email: string | null;
}): string {
  return (
    [r.first_name, r.last_name].filter(Boolean).join(" ").trim() ||
    r.applicant_name?.trim() ||
    r.borrower_email ||
    "Borrower"
  );
}

export async function listAdminLoans(filter: LoanFilter, search?: string) {
  const statusFilter: Record<LoanFilter, string[]> = {
    all: LOAN_STATUSES,
    active: ["active"],
    overdue: ["active"],
    pending: ["submitted", "approved"],
    paid_off: ["paid_off"],
    cancelled: ["cancelled", "declined"],
    written_off: ["written_off"],
  };
  const statuses = statusFilter[filter];
  const params: string[] = [...statuses];
  let searchSql = "";
  const q = search?.trim().toLowerCase();
  if (q) {
    searchSql = ` AND (
      LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE ?
      OR LOWER(COALESCE(c.applicant_name, '')) LIKE ?
      OR LOWER(COALESCE(c.email, '')) LIKE ?
      OR LOWER(vp.name) LIKE ?
      OR la.id LIKE ?
    )`;
    params.push(...Array<string>(5).fill(`%${q}%`));
  }

  const rows = (await getDb()
    .prepare(
      `SELECT la.*, vp.name AS practice_name, c.email AS borrower_email,
              c.applicant_name, c.first_name, c.last_name
       FROM loan_applications la
       INNER JOIN vet_practices vp ON vp.id = la.practice_id
       INNER JOIN customers c ON c.id = la.customer_id
       WHERE la.status IN (${statuses.map(() => "?").join(", ")})${searchSql}
       ORDER BY la.updated_at DESC
       LIMIT 500`,
    )
    .all(...params)) as LoanListRow[];

  const summaries = await getServicingSummaries(rows);
  let loans = rows.map((r) => ({
    ...toPublicApplication(r, { name: r.practice_name }),
    borrowerName: borrowerName(r),
    borrowerEmail: r.borrower_email,
    servicing: summaries.get(r.id)!,
  }));

  if (filter === "overdue") {
    loans = loans
      .filter((l) => l.servicing.hasSchedule && l.servicing.overdue)
      .sort(
        (a, b) =>
          (b.servicing.hasSchedule
            ? (b.servicing.overdue?.daysOverdue ?? 0)
            : 0) -
          (a.servicing.hasSchedule
            ? (a.servicing.overdue?.daysOverdue ?? 0)
            : 0),
      );
  }

  const all = filter === "all" ? loans : null;
  return {
    loans,
    counts: all
      ? {
          active: all.filter((l) => l.status === "active").length,
          overdue: all.filter(
            (l) => l.servicing.hasSchedule && l.servicing.overdue,
          ).length,
          pending: all.filter((l) =>
            ["submitted", "approved"].includes(l.status),
          ).length,
        }
      : null,
  };
}

export async function getAdminLoanDetail(loanId: string) {
  const loan = await requireLoan(loanId);
  const [installments, payments, notes, auditRows, extra] = await Promise.all([
    loadInstallments(loanId),
    loadPayments(loanId),
    getDb()
      .prepare(
        "SELECT * FROM loan_notes WHERE loan_application_id = ? ORDER BY created_at DESC",
      )
      .all(loanId) as Promise<NoteRow[]>,
    getDb()
      .prepare(
        "SELECT * FROM admin_audit_log WHERE loan_application_id = ? ORDER BY created_at DESC",
      )
      .all(loanId) as Promise<AuditRow[]>,
    getDb()
      .prepare(
        `SELECT vp.name AS practice_name, vp.city AS practice_city, vp.state AS practice_state,
                c.email AS borrower_email, c.applicant_name, c.first_name, c.last_name,
                c.phone AS borrower_phone
         FROM loan_applications la
         INNER JOIN vet_practices vp ON vp.id = la.practice_id
         INNER JOIN customers c ON c.id = la.customer_id
         WHERE la.id = ?`,
      )
      .get(loanId) as Promise<{
      practice_name: string;
      practice_city: string | null;
      practice_state: string | null;
      borrower_email: string | null;
      applicant_name: string | null;
      first_name: string | null;
      last_name: string | null;
      borrower_phone: string | null;
    }>,
  ]);

  const today = todayInLoanTz();
  const allocation = allocate(installments, payments);
  const summary = summarize(loan, allocation.installments, today);
  const byId = new Map(installments.map((i) => [i.id, i]));

  return {
    today,
    loan: toPublicApplication(loan, {
      name: extra!.practice_name,
      city: extra!.practice_city,
      state: extra!.practice_state,
    }),
    borrower: {
      id: loan.customer_id,
      name: borrowerName(extra!),
      email: extra!.borrower_email,
      phone: extra!.borrower_phone,
    },
    closure: {
      cancelledAt: loan.cancelled_at,
      cancelledBy: loan.cancelled_by,
      cancelReason: loan.cancel_reason,
      writtenOffAt: loan.written_off_at,
      writtenOffBy: loan.written_off_by,
      writeOffReason: loan.write_off_reason,
      writtenOffAmount: loan.written_off_amount,
      paidOffAt: loan.paid_off_at,
    },
    servicing: summary,
    schedule: allocation.installments.map((i) => ({
      id: i.id,
      number: i.number,
      dueDate: i.dueDate,
      originalDueDate: byId.get(i.id)!.original_due_date,
      amountDue: toDollars(i.amountDueCents),
      principal: toDollars(i.principalCents),
      interest: toDollars(i.interestCents),
      amountPaid: toDollars(i.amountPaidCents),
      status: i.status,
      paidAt: i.paidAt,
      isLate: isOpen(i) && i.dueDate < today && loan.status === "active",
    })),
    payments: payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      receivedOn: p.received_on,
      method: p.method,
      reference: p.reference,
      kind: p.kind,
      recordedBy: p.recorded_by,
      createdAt: p.created_at,
      voidedAt: p.voided_at,
      voidedBy: p.voided_by,
      voidReason: p.void_reason,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      contactMethod: n.contact_method,
      author: n.author,
      createdAt: n.created_at,
    })),
    audit: auditRows.map((a) => ({
      id: a.id,
      action: a.action,
      reason: a.reason,
      details: JSON.parse(a.details_json) as Record<string, unknown>,
      actor: a.actor,
      createdAt: a.created_at,
    })),
    actions: {
      canCancel: ["submitted", "approved"].includes(loan.status),
      canWriteOff: loan.status === "active",
      canReschedule:
        loan.status === "active" && summary.hasSchedule && !!summary.nextDue,
      canRecordPayment: loan.status === "active" && summary.hasSchedule,
    },
  };
}

// ---------- actions ----------

export async function cancelLoan(
  loanId: string,
  reasonIn: string,
  actor: string,
) {
  const reason = requireReason(reasonIn);
  return withTransaction(async () => {
    const loan = await requireLoan(loanId);
    if (!["submitted", "approved"].includes(loan.status)) {
      throw new HttpError(
        400,
        loan.status === "active"
          ? "This loan has been funded — write it off instead of cancelling"
          : "Only loans that haven't been funded can be cancelled",
      );
    }
    await getDb()
      .prepare(
        `UPDATE loan_applications
         SET status = 'cancelled', cancelled_at = now_text(), cancelled_by = ?, cancel_reason = ?,
             disbursement_status = NULL, updated_at = now_text()
         WHERE id = ?`,
      )
      .run(actor, reason, loanId);
    await getDb()
      .prepare(
        `UPDATE customers SET application_status = 'cancelled', updated_at = now_text() WHERE id = ?`,
      )
      .run(loan.customer_id);
    await audit(loanId, "loan.cancelled", actor, {
      reason,
      details: { previousStatus: loan.status },
    });
  });
}

export async function writeOffLoan(
  loanId: string,
  reasonIn: string,
  actor: string,
) {
  const reason = requireReason(reasonIn);
  return withTransaction(async () => {
    const loan = await requireLoan(loanId);
    if (loan.status !== "active") {
      throw new HttpError(
        400,
        "Only active (funded, unpaid) loans can be written off",
      );
    }
    const installments = await loadInstallments(loanId);
    const allocation = allocate(installments, await loadPayments(loanId));
    const quote = payoffQuote(
      allocation.installments,
      fundedOn(loan),
      todayInLoanTz(),
    );

    await getDb()
      .prepare(
        `UPDATE loan_installments SET status = 'written_off', updated_at = now_text()
         WHERE loan_application_id = ? AND status IN ('scheduled', 'partial')`,
      )
      .run(loanId);
    await getDb()
      .prepare(
        `UPDATE loan_applications
         SET status = 'written_off', written_off_at = now_text(), written_off_by = ?,
             write_off_reason = ?, written_off_amount = ?, updated_at = now_text()
         WHERE id = ?`,
      )
      .run(actor, reason, toDollars(quote.principalCents), loanId);
    await getDb()
      .prepare(
        `UPDATE customers SET application_status = 'written_off', updated_at = now_text() WHERE id = ?`,
      )
      .run(loan.customer_id);
    await audit(loanId, "loan.written_off", actor, {
      reason,
      details: { outstandingPrincipal: toDollars(quote.principalCents) },
    });
  });
}

/**
 * Moves the next unpaid payment to `newDueDate` and shifts every later unpaid payment by the
 * same number of days. Payment amounts don't change and no extra interest is charged.
 */
export async function rescheduleNextPayment(
  loanId: string,
  newDueDate: string,
  reasonIn: string,
  actor: string,
) {
  const reason = requireReason(reasonIn);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDueDate))
    throw new HttpError(400, "Invalid date");
  return withTransaction(async () => {
    const loan = await requireLoan(loanId);
    if (loan.status !== "active")
      throw new HttpError(400, "Only active loans can be rescheduled");
    const installments = await loadInstallments(loanId);
    const allocation = allocate(installments, await loadPayments(loanId));
    const open = allocation.installments.filter(isOpen);
    const next = open[0];
    if (!next) throw new HttpError(400, "This loan has no unpaid payments");

    const today = todayInLoanTz();
    if (newDueDate < today)
      throw new HttpError(400, "The new due date can't be in the past");
    const previous = allocation.installments
      .filter((i) => i.number < next.number)
      .at(-1);
    if (previous && newDueDate <= previous.dueDate) {
      throw new HttpError(
        400,
        `The new date must be after the previous payment (${previous.dueDate})`,
      );
    }
    const shiftDays = daysBetween(next.dueDate, newDueDate);
    if (shiftDays === 0)
      throw new HttpError(400, "That's already the due date");

    for (const inst of open) {
      await getDb()
        .prepare(
          `UPDATE loan_installments SET due_date = ?, updated_at = now_text() WHERE id = ?`,
        )
        .run(addDays(inst.dueDate, shiftDays), inst.id);
    }
    await audit(loanId, "loan.rescheduled", actor, {
      reason,
      details: {
        installment: next.number,
        from: next.dueDate,
        to: newDueDate,
        shiftDays,
        paymentsMoved: open.length,
      },
    });
  });
}

export async function recordPayment(
  loanId: string,
  input: {
    amount: number;
    receivedOn: string;
    method: PaymentMethod;
    reference?: string | null;
    payoff: boolean;
  },
  actor: string,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedOn))
    throw new HttpError(400, "Invalid date");
  const amountCents = toCents(input.amount);
  if (amountCents <= 0) throw new HttpError(400, "Amount must be more than $0");

  return withTransaction(async () => {
    const loan = await requireLoan(loanId);
    if (loan.status !== "active") {
      throw new HttpError(400, "Payments can only be recorded on active loans");
    }
    const installments = await loadInstallments(loanId);
    if (installments.length === 0) {
      throw new HttpError(400, "This loan has no payment schedule");
    }
    const funded = fundedOn(loan);
    if (input.receivedOn > todayInLoanTz())
      throw new HttpError(400, "The date can't be in the future");
    if (input.receivedOn < funded)
      throw new HttpError(400, "The date is before the loan was funded");

    const allocation = allocate(installments, await loadPayments(loanId));
    const quote = payoffQuote(
      allocation.installments,
      funded,
      input.receivedOn,
    );
    const fmt = (c: number) => `$${toDollars(c).toFixed(2)}`;

    if (input.payoff) {
      if (amountCents !== quote.totalCents) {
        throw new HttpError(
          400,
          `The payoff amount on ${input.receivedOn} is ${fmt(quote.totalCents)} (principal ${fmt(quote.principalCents)} + interest ${fmt(quote.interestCents)})`,
        );
      }
    } else if (amountCents >= quote.totalCents) {
      throw new HttpError(
        400,
        `That covers the whole balance — record it as a payoff instead (payoff on ${input.receivedOn} is ${fmt(quote.totalCents)})`,
      );
    }

    const id = randomUUID();
    await getDb()
      .prepare(
        `INSERT INTO loan_payments (id, loan_application_id, amount, received_on, method, reference, kind, recorded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        loanId,
        toDollars(amountCents),
        input.receivedOn,
        input.method,
        input.reference?.trim() || null,
        input.payoff ? "payoff" : "regular",
        actor,
        preciseNow(),
      );
    await recomputeLoan(loanId);
    await audit(
      loanId,
      input.payoff ? "payment.payoff_recorded" : "payment.recorded",
      actor,
      {
        details: {
          paymentId: id,
          amount: toDollars(amountCents),
          receivedOn: input.receivedOn,
          method: input.method,
          reference: input.reference?.trim() || null,
        },
      },
    );
  });
}

export async function voidPayment(
  loanId: string,
  paymentId: string,
  reasonIn: string,
  actor: string,
) {
  const reason = requireReason(reasonIn);
  return withTransaction(async () => {
    const loan = await requireLoan(loanId);
    if (!["active", "paid_off"].includes(loan.status)) {
      throw new HttpError(
        400,
        "Payments can only be voided on active or paid-off loans",
      );
    }
    const payment = (await getDb()
      .prepare(
        "SELECT * FROM loan_payments WHERE id = ? AND loan_application_id = ?",
      )
      .get(paymentId, loanId)) as PaymentRow | undefined;
    if (!payment) throw new HttpError(404, "Payment not found");
    if (payment.voided_at)
      throw new HttpError(400, "This payment is already voided");

    await getDb()
      .prepare(
        `UPDATE loan_payments SET voided_at = now_text(), voided_by = ?, void_reason = ? WHERE id = ?`,
      )
      .run(actor, reason, paymentId);
    await recomputeLoan(loanId);
    await audit(loanId, "payment.voided", actor, {
      reason,
      details: {
        paymentId,
        amount: payment.amount,
        receivedOn: payment.received_on,
      },
    });
  });
}

export async function addLoanNote(
  loanId: string,
  input: { body: string; contactMethod?: ContactMethod | null },
  actor: string,
) {
  const body = input.body.trim();
  if (!body) throw new HttpError(400, "Write a note first");
  await requireLoan(loanId);
  const id = randomUUID();
  await withTransaction(async () => {
    await getDb()
      .prepare(
        `INSERT INTO loan_notes (id, loan_application_id, body, contact_method, author, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, loanId, body, input.contactMethod ?? null, actor, preciseNow());
    await audit(loanId, "note.added", actor, {
      details: { noteId: id, contactMethod: input.contactMethod ?? null },
    });
  });
}
