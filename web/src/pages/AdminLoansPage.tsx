import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import DashboardShell from "../components/DashboardShell";
import { useAdminNavItems } from "../components/useAdminNavItems";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  fetchAdminLoans,
  type AdminLoanFilter,
  type AdminLoanListItem,
} from "../lib/api";
import { formatShortDate, formatUsdCents } from "../lib/format";
import "./PracticePortal.css";
import "./AdminLoans.css";

const FILTERS: { id: AdminLoanFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "overdue", label: "Overdue" },
  { id: "pending", label: "Not yet funded" },
  { id: "paid_off", label: "Paid off" },
  { id: "written_off", label: "Written off" },
  { id: "cancelled", label: "Cancelled / declined" },
];

function NextDueCell({ loan }: { loan: AdminLoanListItem }) {
  const s = loan.servicing;
  if (!s.hasSchedule || !s.nextDue)
    return <span className="portal-muted">—</span>;
  return (
    <>
      {formatShortDate(s.nextDue.dueDate)}
      <div className="portal-muted">{formatUsdCents(s.nextDue.amount)}</div>
    </>
  );
}

function OverdueCell({ loan }: { loan: AdminLoanListItem }) {
  const s = loan.servicing;
  if (!s.hasSchedule || !s.overdue)
    return <span className="portal-muted">—</span>;
  return (
    <span className="loan-overdue">
      {s.overdue.daysOverdue} days
      <span className="loan-overdue__amount">
        {formatUsdCents(s.overdue.amount)}
      </span>
    </span>
  );
}

export default function AdminLoansPage() {
  const { username, logout } = useAdminAuth();
  const navItems = useAdminNavItems("loans");
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filter") as AdminLoanFilter | null) ?? "all";
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [loans, setLoans] = useState<AdminLoanListItem[]>([]);
  const [counts, setCounts] = useState<{
    active: number;
    overdue: number;
    pending: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const q = params.get("q") ?? "";

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAdminLoans(filter, q)
      .then((data) => {
        setLoans(data.loans);
        if (data.counts) setCounts(data.counts);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load loans"),
      )
      .finally(() => setLoading(false));
  }, [filter, q]);

  // Counts come from the unfiltered list; load them once if we start on a filter.
  useEffect(() => {
    if (counts || filter === "all") return;
    void fetchAdminLoans("all").then((d) => setCounts(d.counts));
  }, [counts, filter]);

  function setFilter(next: AdminLoanFilter) {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("filter");
    else p.set("filter", next);
    setParams(p);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams(params);
    if (search.trim()) p.set("q", search.trim());
    else p.delete("q");
    setParams(p);
  }

  return (
    <DashboardShell
      homeTo="/admin"
      navItems={navItems}
      userLabel={username}
      onLogout={logout}
      title="Loans"
      lead="Every submitted loan. Open one to record payments, change due dates, add notes, or cancel / write off."
    >
      <div className="portal-inner portal-inner--wide portal-inner--shell">
        <div
          className="portal-grid portal-grid--stats"
          style={{ margin: "0 0 1.5rem" }}
        >
          <button
            type="button"
            className="portal-stat loan-stat-button"
            onClick={() => setFilter("active")}
          >
            <p className="portal-stat-value">{counts?.active ?? "—"}</p>
            <p className="portal-stat-label">Active loans</p>
          </button>
          <button
            type="button"
            className={`portal-stat loan-stat-button ${counts?.overdue ? "loan-stat--alert" : ""}`}
            onClick={() => setFilter("overdue")}
          >
            <p className="portal-stat-value">{counts?.overdue ?? "—"}</p>
            <p className="portal-stat-label">Overdue</p>
          </button>
          <button
            type="button"
            className="portal-stat loan-stat-button"
            onClick={() => setFilter("pending")}
          >
            <p className="portal-stat-value">{counts?.pending ?? "—"}</p>
            <p className="portal-stat-label">Not yet funded</p>
          </button>
        </div>

        <div className="portal-card">
          <div className="loan-toolbar">
            <div
              className="loan-filters"
              role="tablist"
              aria-label="Filter loans"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  className={`loan-filter ${filter === f.id ? "loan-filter--active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <form className="loan-search" onSubmit={submitSearch}>
              <input
                type="search"
                placeholder="Search borrower, email, clinic…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search loans"
              />
              <button type="submit" className="btn btn--secondary btn--small">
                Search
              </button>
            </form>
          </div>

          {error ? <p className="portal-error">{error}</p> : null}

          {loading ? (
            <p className="portal-status">Loading loans…</p>
          ) : loans.length === 0 ? (
            <p className="portal-status">No loans match.</p>
          ) : (
            <div className="portal-table-wrap">
              <table className="portal-table loan-table">
                <thead>
                  <tr>
                    <th>Borrower</th>
                    <th>Clinic</th>
                    <th>Amount &amp; plan</th>
                    <th>Status</th>
                    <th>Next due</th>
                    <th>Overdue</th>
                    <th>Repaid</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr
                      key={loan.id}
                      className={
                        loan.servicing.hasSchedule && loan.servicing.overdue
                          ? "loan-row--late"
                          : ""
                      }
                    >
                      <td>
                        <Link
                          to={`/admin/loans/${loan.id}`}
                          className="loan-link"
                        >
                          {loan.borrowerName}
                        </Link>
                        {loan.borrowerEmail ? (
                          <div className="portal-muted">
                            {loan.borrowerEmail}
                          </div>
                        ) : null}
                      </td>
                      <td>{loan.practiceName ?? "—"}</td>
                      <td>
                        {formatUsdCents(loan.loanAmount)}
                        {loan.repaymentPlan ? (
                          <div className="portal-muted">
                            {loan.repaymentPlan.termMonths} mo ·{" "}
                            {formatUsdCents(loan.repaymentPlan.monthlyPayment)}
                            /mo
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span
                          className={`portal-badge loan-badge loan-badge--${loan.status}`}
                        >
                          {loan.statusLabel ?? loan.status}
                        </span>
                      </td>
                      <td>
                        <NextDueCell loan={loan} />
                      </td>
                      <td>
                        <OverdueCell loan={loan} />
                      </td>
                      <td>
                        {loan.amountRepaid != null
                          ? formatUsdCents(loan.amountRepaid)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
