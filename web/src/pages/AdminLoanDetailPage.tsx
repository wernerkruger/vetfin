import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DashboardShell from "../components/DashboardShell";
import TruthInLendingDisclosure from "../components/TruthInLendingDisclosure";
import { useAdminNavItems } from "../components/useAdminNavItems";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  adminAddLoanNote,
  adminCancelLoan,
  adminRecordLoanPayment,
  adminRescheduleLoan,
  adminVoidLoanPayment,
  adminWriteOffLoan,
  fetchAdminLoan,
  type AdminLoanDetail,
  type ContactMethod,
  type PaymentMethod,
} from "../lib/api";
import {
  formatCalendarDate,
  formatShortDate,
  formatTimestamp,
  formatUsdCents,
} from "../lib/format";
import {
  AUDIT_ACTION_LABELS,
  CONTACT_METHOD_LABELS,
  INSTALLMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "../lib/loanLabels";
import "./PracticePortal.css";
import "./AdminLoans.css";

type Panel = "payment" | "reschedule" | "close" | null;

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function auditDetail(a: AdminLoanDetail["audit"][number]): string | null {
  const d = a.details;
  switch (a.action) {
    case "loan.rescheduled":
      return `Payment #${d.installment}: ${formatShortDate(String(d.from))} → ${formatShortDate(String(d.to))} (${Number(d.shiftDays) > 0 ? "+" : ""}${d.shiftDays} days, ${d.paymentsMoved} payments moved)`;
    case "payment.recorded":
    case "payment.payoff_recorded":
      return `${formatUsdCents(Number(d.amount))} received ${formatShortDate(String(d.receivedOn))} via ${PAYMENT_METHOD_LABELS[d.method as PaymentMethod] ?? d.method}${d.reference ? ` (ref ${d.reference})` : ""}`;
    case "payment.voided":
      return `${formatUsdCents(Number(d.amount))} from ${formatShortDate(String(d.receivedOn))}`;
    case "loan.written_off":
      return `Outstanding principal ${formatUsdCents(Number(d.outstandingPrincipal))}`;
    case "loan.funded":
      return d.firstPaymentDue
        ? `First payment due ${formatShortDate(String(d.firstPaymentDue))}`
        : null;
    case "note.added":
      return d.contactMethod
        ? CONTACT_METHOD_LABELS[d.contactMethod as ContactMethod]
        : "Internal note";
    default:
      return null;
  }
}

export default function AdminLoanDetailPage() {
  const { loanId } = useParams<{ loanId: string }>();
  const { username, logout } = useAdminAuth();
  const navItems = useAdminNavItems("loans");
  const [detail, setDetail] = useState<AdminLoanDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // form state
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("ach");
  const [payRef, setPayRef] = useState("");
  const [isPayoff, setIsPayoff] = useState(false);
  const [newDueDate, setNewDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [noteMethod, setNoteMethod] = useState<ContactMethod | "">("phone");
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const load = useCallback(async () => {
    if (!loanId) return;
    try {
      setDetail(await fetchAdminLoan(loanId));
    } catch (err) {
      setLoadError(errorText(err, "Could not load loan"));
    }
  }, [loanId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openPanel(next: Panel) {
    setActionError(null);
    setFlash(null);
    setReason("");
    if (next === "payment" && detail) {
      setPayDate(detail.today);
      const nd = detail.servicing.hasSchedule ? detail.servicing.nextDue : null;
      setPayAmount(nd ? nd.amount.toFixed(2) : "");
      setIsPayoff(false);
      setPayRef("");
    }
    if (
      next === "reschedule" &&
      detail?.servicing.hasSchedule &&
      detail.servicing.nextDue
    ) {
      setNewDueDate(detail.servicing.nextDue.dueDate);
    }
    setPanel(panel === next ? null : next);
  }

  async function run(fn: () => Promise<AdminLoanDetail>, success: string) {
    setBusy(true);
    setActionError(null);
    try {
      setDetail(await fn());
      setPanel(null);
      setFlash(success);
      return true;
    } catch (err) {
      setActionError(errorText(err, "Something went wrong"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <DashboardShell
        homeTo="/admin"
        navItems={navItems}
        userLabel={username}
        onLogout={logout}
        title="Loan"
      >
        <div className="portal-inner portal-inner--wide portal-inner--shell">
          <p className="portal-error">{loadError}</p>
          <Link to="/admin/loans">← All loans</Link>
        </div>
      </DashboardShell>
    );
  }

  if (!detail || !loanId) {
    return (
      <DashboardShell
        homeTo="/admin"
        navItems={navItems}
        userLabel={username}
        onLogout={logout}
        title="Loan"
      >
        <div className="portal-inner portal-inner--wide portal-inner--shell">
          <p className="portal-status">Loading…</p>
        </div>
      </DashboardShell>
    );
  }

  const { loan, servicing: s, actions, closure } = detail;
  const plan = loan.repaymentPlan;
  const payoff = s.hasSchedule ? s.payoff : null;

  return (
    <DashboardShell
      homeTo="/admin"
      navItems={navItems}
      userLabel={username}
      onLogout={logout}
      title={detail.borrower.name}
      lead={`${loan.practiceName ?? "Clinic"}${loan.practiceLocation ? ` · ${loan.practiceLocation}` : ""} · Loan ${loan.id.slice(0, 8)}`}
    >
      <div className="portal-inner portal-inner--wide portal-inner--shell loan-detail">
        <div className="loan-detail__top">
          <Link to="/admin/loans" className="portal-back">
            ← All loans
          </Link>
          <span
            className={`portal-badge loan-badge loan-badge--${loan.status}`}
          >
            {loan.statusLabel ?? loan.status}
          </span>
        </div>

        {flash ? (
          <p className="loan-flash" role="status">
            {flash}
          </p>
        ) : null}

        <div className="portal-grid portal-grid--stats loan-stats">
          <div className="portal-stat">
            <p className="portal-stat-value">
              {formatUsdCents(loan.loanAmount)}
            </p>
            <p className="portal-stat-label">
              Loan amount
              {plan ? ` · ${plan.termMonths} mo at ${plan.interestRate}%` : ""}
            </p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">
              {formatUsdCents(loan.amountRepaid ?? 0)}
            </p>
            <p className="portal-stat-label">Repaid</p>
          </div>
          {s.hasSchedule && s.nextDue ? (
            <div className="portal-stat">
              <p className="portal-stat-value">
                {formatShortDate(s.nextDue.dueDate)}
              </p>
              <p className="portal-stat-label">
                Next payment · {formatUsdCents(s.nextDue.amount)}
              </p>
            </div>
          ) : null}
          {s.hasSchedule && s.overdue ? (
            <div className="portal-stat loan-stat--alert">
              <p className="portal-stat-value">{s.overdue.daysOverdue} days</p>
              <p className="portal-stat-label">
                Overdue · {formatUsdCents(s.overdue.amount)} (
                {s.overdue.installments} payment
                {s.overdue.installments === 1 ? "" : "s"})
              </p>
            </div>
          ) : null}
          {payoff ? (
            <div className="portal-stat">
              <p className="portal-stat-value">
                {formatUsdCents(payoff.total)}
              </p>
              <p className="portal-stat-label">Payoff today</p>
            </div>
          ) : null}
        </div>

        <section className="portal-card loan-borrower">
          <div>
            <strong>Borrower:</strong>{" "}
            <Link to={`/admin/borrowers/${detail.borrower.id}`}>
              {detail.borrower.name}
            </Link>
            {detail.borrower.email ? (
              <>
                {" · "}
                <a href={`mailto:${detail.borrower.email}`}>
                  {detail.borrower.email}
                </a>
              </>
            ) : null}
            {detail.borrower.phone ? (
              <>
                {" · "}
                <a href={`tel:${detail.borrower.phone}`}>
                  {detail.borrower.phone}
                </a>
              </>
            ) : null}
          </div>
          {loan.animalName || loan.serviceType ? (
            <div className="portal-muted">
              {loan.animalName ?? loan.animalType} ·{" "}
              {loan.serviceType?.replace(/_/g, " ")}
              {loan.disbursedAt
                ? ` · funded ${formatShortDate(loan.disbursedAt)}`
                : ""}
            </div>
          ) : null}
          {closure.cancelledAt ? (
            <p className="loan-closure">
              Cancelled {formatTimestamp(closure.cancelledAt)} by{" "}
              {closure.cancelledBy}: “{closure.cancelReason}”
            </p>
          ) : null}
          {closure.writtenOffAt ? (
            <p className="loan-closure">
              Written off {formatTimestamp(closure.writtenOffAt)} by{" "}
              {closure.writtenOffBy} ({formatUsdCents(closure.writtenOffAmount)}{" "}
              principal outstanding): “{closure.writeOffReason}”
            </p>
          ) : null}
          {closure.paidOffAt ? (
            <p className="loan-closure loan-closure--good">
              Paid off {formatCalendarDate(closure.paidOffAt)}.
            </p>
          ) : null}
        </section>

        {actions.canRecordPayment ||
        actions.canReschedule ||
        actions.canCancel ||
        actions.canWriteOff ? (
          <section className="portal-card">
            <h2 className="loan-h2">Actions</h2>
            <div className="loan-actions">
              {actions.canRecordPayment ? (
                <button
                  type="button"
                  className={`btn btn--small ${panel === "payment" ? "btn--primary" : "btn--secondary"}`}
                  onClick={() => openPanel("payment")}
                >
                  Record payment
                </button>
              ) : null}
              {actions.canReschedule ? (
                <button
                  type="button"
                  className={`btn btn--small ${panel === "reschedule" ? "btn--primary" : "btn--secondary"}`}
                  onClick={() => openPanel("reschedule")}
                >
                  Change next due date
                </button>
              ) : null}
              {actions.canCancel ? (
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  onClick={() => openPanel("close")}
                >
                  Cancel loan
                </button>
              ) : null}
              {actions.canWriteOff ? (
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  onClick={() => openPanel("close")}
                >
                  Write off loan
                </button>
              ) : null}
            </div>

            {actionError ? (
              <p className="portal-error" style={{ marginTop: "1rem" }}>
                {actionError}
              </p>
            ) : null}

            {panel === "payment" ? (
              <form
                className="loan-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      adminRecordLoanPayment(loanId, {
                        amount: Number(payAmount),
                        receivedOn: payDate,
                        method: payMethod,
                        reference: payRef || undefined,
                        payoff: isPayoff,
                      }),
                    isPayoff
                      ? "Payoff recorded — the loan is now paid off."
                      : "Payment recorded.",
                  );
                }}
              >
                <div className="loan-form__row">
                  <label className="portal-label">
                    Amount (USD)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={payAmount}
                      readOnly={isPayoff}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </label>
                  <label className="portal-label">
                    Date received
                    <input
                      type="date"
                      required
                      max={detail.today}
                      value={payDate}
                      onChange={(e) => {
                        setPayDate(e.target.value);
                        if (isPayoff) setIsPayoff(false);
                      }}
                    />
                  </label>
                  <label className="portal-label">
                    Method
                    <select
                      value={payMethod}
                      onChange={(e) =>
                        setPayMethod(e.target.value as PaymentMethod)
                      }
                    >
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="portal-label">
                    Reference (optional)
                    <input
                      type="text"
                      value={payRef}
                      placeholder="e.g. transaction ID"
                      onChange={(e) => setPayRef(e.target.value)}
                    />
                  </label>
                </div>
                {payoff ? (
                  <label className="tila-check">
                    <input
                      type="checkbox"
                      checked={isPayoff}
                      onChange={(e) => {
                        setIsPayoff(e.target.checked);
                        if (e.target.checked) {
                          setPayDate(detail.today);
                          setPayAmount(payoff.total.toFixed(2));
                        }
                      }}
                    />
                    <span>
                      This pays the loan off in full today (
                      {formatUsdCents(payoff.total)} = principal{" "}
                      {formatUsdCents(payoff.principal)} + interest to date{" "}
                      {formatUsdCents(payoff.interest)}). Remaining scheduled
                      interest is not charged.
                    </span>
                  </label>
                ) : null}
                <div>
                  <button
                    type="submit"
                    className="btn btn--primary btn--small"
                    disabled={busy}
                  >
                    {busy
                      ? "Saving…"
                      : isPayoff
                        ? "Record payoff"
                        : "Record payment"}
                  </button>
                </div>
              </form>
            ) : null}

            {panel === "reschedule" && s.hasSchedule && s.nextDue ? (
              <form
                className="loan-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () => adminRescheduleLoan(loanId, newDueDate, reason),
                    "Due date changed.",
                  );
                }}
              >
                <p className="portal-muted" style={{ margin: 0 }}>
                  The next payment ({formatUsdCents(s.nextDue.amount)}) is due{" "}
                  {formatCalendarDate(s.nextDue.dueDate)}. Every later payment
                  moves by the same number of days. Amounts stay the same and no
                  extra interest is charged.
                </p>
                <div className="loan-form__row">
                  <label className="portal-label">
                    New due date
                    <input
                      type="date"
                      required
                      min={detail.today}
                      value={newDueDate}
                      onChange={(e) => setNewDueDate(e.target.value)}
                    />
                  </label>
                </div>
                <label className="portal-label">
                  Reason (kept in the loan history)
                  <textarea
                    required
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Customer lost job, agreed 2 weeks grace"
                  />
                </label>
                <div>
                  <button
                    type="submit"
                    className="btn btn--primary btn--small"
                    disabled={busy}
                  >
                    {busy ? "Saving…" : "Change due date"}
                  </button>
                </div>
              </form>
            ) : null}

            {panel === "close" ? (
              <form
                className="loan-form loan-form--danger"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      actions.canCancel
                        ? adminCancelLoan(loanId, reason)
                        : adminWriteOffLoan(loanId, reason),
                    actions.canCancel ? "Loan cancelled." : "Loan written off.",
                  );
                }}
              >
                <p style={{ margin: 0 }}>
                  {actions.canCancel
                    ? "Cancel this loan? It hasn't been funded, so no money has been sent. The borrower will see it as cancelled."
                    : `Write off this loan? It stops collection and closes the remaining ${s.hasSchedule ? s.paymentsRemaining : ""} payments. ${payoff ? `${formatUsdCents(payoff.principal)} of principal is still outstanding.` : ""}`}
                </p>
                <label className="portal-label">
                  Reason (required, kept in the loan history)
                  <textarea
                    required
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className="loan-actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    onClick={() => setPanel(null)}
                  >
                    Keep loan
                  </button>
                  <button
                    type="submit"
                    className="btn btn--danger btn--small"
                    disabled={busy}
                  >
                    {busy
                      ? "Saving…"
                      : actions.canCancel
                        ? "Yes, cancel loan"
                        : "Yes, write off"}
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}

        <section className="portal-card">
          <h2 className="loan-h2">Payment schedule</h2>
          {detail.schedule.length === 0 ? (
            <p className="portal-muted">
              {loan.status === "active" || loan.status === "paid_off"
                ? "No schedule on record — this loan was funded before payment schedules were tracked."
                : "The schedule is created when the loan is funded."}
              {plan
                ? ` Plan: ${plan.termMonths} payments of ${formatUsdCents(plan.monthlyPayment)}.`
                : ""}
            </p>
          ) : (
            <div className="portal-table-wrap">
              <table className="portal-table loan-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Due</th>
                    <th>Amount</th>
                    <th>Principal</th>
                    <th>Interest</th>
                    <th>Paid</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.schedule.map((i) => (
                    <tr key={i.id} className={i.isLate ? "loan-row--late" : ""}>
                      <td>{i.number}</td>
                      <td>
                        {formatShortDate(i.dueDate)}
                        {i.dueDate !== i.originalDueDate ? (
                          <div className="portal-muted loan-moved">
                            was {formatShortDate(i.originalDueDate)}
                          </div>
                        ) : null}
                      </td>
                      <td>{formatUsdCents(i.amountDue)}</td>
                      <td>{formatUsdCents(i.principal)}</td>
                      <td>{formatUsdCents(i.interest)}</td>
                      <td>
                        {i.amountPaid > 0 ? formatUsdCents(i.amountPaid) : "—"}
                      </td>
                      <td>
                        <span
                          className={`portal-badge loan-inst loan-inst--${i.isLate ? "late" : i.status}`}
                        >
                          {i.isLate
                            ? "Late"
                            : INSTALLMENT_STATUS_LABELS[i.status]}
                        </span>
                        {i.paidAt ? (
                          <div className="portal-muted">
                            {formatShortDate(i.paidAt)}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="portal-card">
          <h2 className="loan-h2">Payments received</h2>
          {detail.payments.length === 0 ? (
            <p className="portal-muted">No payments recorded yet.</p>
          ) : (
            <div className="portal-table-wrap">
              <table className="portal-table loan-table">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Recorded by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {detail.payments.map((p) => (
                    <tr
                      key={p.id}
                      className={p.voidedAt ? "loan-row--void" : ""}
                    >
                      <td>{formatShortDate(p.receivedOn)}</td>
                      <td>
                        {formatUsdCents(p.amount)}
                        {p.kind === "payoff" ? (
                          <span
                            className="portal-badge loan-inst loan-inst--paid"
                            style={{ marginLeft: 6 }}
                          >
                            Payoff
                          </span>
                        ) : null}
                      </td>
                      <td>
                        {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                        {p.reference ? (
                          <div className="portal-muted">Ref {p.reference}</div>
                        ) : null}
                      </td>
                      <td>
                        {p.recordedBy}
                        <div className="portal-muted">
                          {formatTimestamp(p.createdAt)}
                        </div>
                      </td>
                      <td>
                        {p.voidedAt ? (
                          <span className="portal-muted">
                            Voided by {p.voidedBy}: {p.voidReason}
                          </span>
                        ) : voidingId === p.id ? (
                          <form
                            className="loan-void"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(
                                () =>
                                  adminVoidLoanPayment(
                                    loanId,
                                    p.id,
                                    voidReason,
                                  ),
                                "Payment voided.",
                              ).then((ok) => ok && setVoidingId(null));
                            }}
                          >
                            <input
                              type="text"
                              required
                              autoFocus
                              placeholder="Reason, e.g. ACH returned"
                              value={voidReason}
                              onChange={(e) => setVoidReason(e.target.value)}
                            />
                            <button
                              type="submit"
                              className="btn btn--danger btn--small"
                              disabled={busy}
                            >
                              Void
                            </button>
                            <button
                              type="button"
                              className="btn btn--secondary btn--small"
                              onClick={() => setVoidingId(null)}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : ["active", "paid_off"].includes(loan.status) ? (
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => {
                              setVoidingId(p.id);
                              setVoidReason("");
                            }}
                          >
                            Void
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="loan-two-col">
          <section className="portal-card">
            <h2 className="loan-h2">Notes &amp; customer contact</h2>
            <form
              className="loan-form loan-form--flush"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () =>
                    adminAddLoanNote(loanId, {
                      body: noteBody,
                      contactMethod: noteMethod || null,
                    }),
                  "Note added.",
                ).then((ok) => ok && setNoteBody(""));
              }}
            >
              <label className="portal-label">
                Type
                <select
                  value={noteMethod}
                  onChange={(e) =>
                    setNoteMethod(e.target.value as ContactMethod | "")
                  }
                >
                  {Object.entries(CONTACT_METHOD_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      Contact: {v}
                    </option>
                  ))}
                  <option value="">Internal note (no contact)</option>
                </select>
              </label>
              <label className="portal-label">
                Note
                <textarea
                  required
                  rows={3}
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="What was discussed or agreed?"
                />
              </label>
              <div>
                <button
                  type="submit"
                  className="btn btn--primary btn--small"
                  disabled={busy || !noteBody.trim()}
                >
                  Add note
                </button>
              </div>
            </form>
            {detail.notes.length === 0 ? (
              <p className="portal-muted">No notes yet.</p>
            ) : (
              <ul className="loan-notes">
                {detail.notes.map((n) => (
                  <li key={n.id}>
                    <div className="loan-notes__meta">
                      <span className="portal-badge">
                        {n.contactMethod
                          ? CONTACT_METHOD_LABELS[n.contactMethod]
                          : "Internal"}
                      </span>
                      {n.author} · {formatTimestamp(n.createdAt)}
                    </div>
                    <p>{n.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="portal-card">
            <h2 className="loan-h2">History</h2>
            {detail.audit.length === 0 ? (
              <p className="portal-muted">No admin activity yet.</p>
            ) : (
              <ol className="loan-audit">
                {detail.audit.map((a) => {
                  const extra = auditDetail(a);
                  return (
                    <li key={a.id}>
                      <div>
                        <strong>
                          {AUDIT_ACTION_LABELS[a.action] ?? a.action}
                        </strong>
                        {extra ? (
                          <span className="portal-muted"> — {extra}</span>
                        ) : null}
                      </div>
                      {a.reason ? (
                        <div className="loan-audit__reason">“{a.reason}”</div>
                      ) : null}
                      <div className="portal-muted loan-audit__meta">
                        {a.actor} · {formatTimestamp(a.createdAt)}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {detail.disclosure ? (
          <section className="portal-card">
            <details>
              <summary className="loan-h2 loan-summary">
                Truth in Lending disclosure (as signed)
              </summary>
              <div style={{ marginTop: "1rem" }}>
                <TruthInLendingDisclosure disclosure={detail.disclosure} />
              </div>
            </details>
          </section>
        ) : null}
      </div>
    </DashboardShell>
  );
}
