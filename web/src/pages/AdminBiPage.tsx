import { useEffect, useState } from "react";
import DashboardShell from "../components/DashboardShell";
import { useAdminNavItems } from "../components/useAdminNavItems";
import { useAdminAuth } from "../context/AdminAuthContext";
import { fetchAdminBi, type AdminBiAnalytics } from "../lib/api";
import "./PracticePortal.css";

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatGrowth(pct: number | null): string {
  if (pct == null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function MonthlyBarChart({
  rows,
  valueKey,
  formatValue,
}: {
  rows: Array<{ month: string; count?: number; amount?: number }>;
  valueKey: "count" | "amount";
  formatValue: (n: number) => string;
}) {
  if (rows.length === 0) {
    return <p className="portal-muted">No data yet.</p>;
  }

  const values = rows.map((r) => (valueKey === "count" ? r.count ?? 0 : r.amount ?? 0));
  const max = Math.max(...values, 1);
  const recent = rows.slice(-12);

  return (
    <div className="bi-bars">
      {recent.map((row) => {
        const value = valueKey === "count" ? row.count ?? 0 : row.amount ?? 0;
        return (
          <div key={row.month} className="bi-bar-row">
            <span className="bi-bar-label">{formatMonth(row.month)}</span>
            <div className="bi-bar-track">
              <div
                className="bi-bar-fill"
                style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
              />
            </div>
            <span className="bi-bar-value">{formatValue(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function RepaymentBucketTable({
  title,
  byCount,
  byAmount,
  shareCount,
  shareAmount,
}: {
  title: string;
  byCount: AdminBiAnalytics["repayments"]["byCount"];
  byAmount: AdminBiAnalytics["repayments"]["byOutstandingPrincipal"];
  shareCount: AdminBiAnalytics["repayments"]["countSharePct"];
  shareAmount: AdminBiAnalytics["repayments"]["principalSharePct"];
}) {
  const rows: Array<{
    key: keyof typeof byCount;
    label: string;
  }> = [
    { key: "on_time", label: "On time" },
    { key: "behind", label: "Behind" },
    { key: "pending_first", label: "Pending first payment" },
    { key: "paid_off", label: "Paid off" },
  ];

  return (
    <div className="bi-repayment-block">
      <h3 className="bi-subtitle">{title}</h3>
      <div className="portal-table-wrap">
        <table className="portal-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Loans</th>
              <th>% of loans</th>
              <th>Outstanding principal</th>
              <th>% of principal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{byCount[row.key]}</td>
                <td>{shareCount[row.key]}%</td>
                <td>{formatUsd(byAmount[row.key])}</td>
                <td>{shareAmount[row.key]}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminBiPage() {
  const { username, logout } = useAdminAuth();
  const navItems = useAdminNavItems("bi");
  const [data, setData] = useState<AdminBiAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAdminBi()
      .then(setData)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load analytics"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell
      homeTo="/admin"
      navItems={navItems}
      userLabel={username}
      onLogout={logout}
      title="Business intelligence"
      lead="Portfolio growth and repayment health across practices and borrowers."
    >
      <div className="portal-inner portal-inner--wide portal-inner--shell">
        {loading ? (
          <p className="portal-status">Loading analytics…</p>
        ) : error ? (
          <p className="portal-error">{error}</p>
        ) : data ? (
          <>
            <p className="portal-muted bi-generated">
              Updated {new Date(data.generatedAt).toLocaleString()}
            </p>

            <section className="portal-card bi-section">
              <h2 className="bi-section-title">Vet practices</h2>
              <div className="portal-grid portal-grid--stats bi-stats">
                <div className="portal-stat">
                  <p className="portal-stat-value">{data.practices.total}</p>
                  <p className="portal-stat-label">Total practices</p>
                </div>
                <div className="portal-stat">
                  <p className="portal-stat-value">
                    {formatGrowth(data.practices.monthOverMonthGrowthPct)}
                  </p>
                  <p className="portal-stat-label">MoM signup growth</p>
                </div>
              </div>
              <h3 className="bi-subtitle">Signups per month</h3>
              <MonthlyBarChart
                rows={data.practices.monthlySignups}
                valueKey="count"
                formatValue={(n) => String(n)}
              />
            </section>

            <section className="portal-card bi-section">
              <h2 className="bi-section-title">Borrowers</h2>
              <div className="portal-grid portal-grid--stats bi-stats">
                <div className="portal-stat">
                  <p className="portal-stat-value">{data.borrowers.total}</p>
                  <p className="portal-stat-label">Total borrowers / applicants</p>
                </div>
                <div className="portal-stat">
                  <p className="portal-stat-value">{data.borrowers.totalWithLogin}</p>
                  <p className="portal-stat-label">With login accounts</p>
                </div>
                <div className="portal-stat">
                  <p className="portal-stat-value">
                    {formatGrowth(data.borrowers.monthOverMonthGrowthPct)}
                  </p>
                  <p className="portal-stat-label">MoM signup growth</p>
                </div>
              </div>
              <h3 className="bi-subtitle">New borrowers per month</h3>
              <MonthlyBarChart
                rows={data.borrowers.monthlySignups}
                valueKey="count"
                formatValue={(n) => String(n)}
              />
            </section>

            <section className="portal-card bi-section">
              <h2 className="bi-section-title">Disbursements</h2>
              <div className="portal-grid portal-grid--stats bi-stats">
                <div className="portal-stat">
                  <p className="portal-stat-value">
                    {formatUsd(data.disbursements.totalAmount)}
                  </p>
                  <p className="portal-stat-label">Total disbursed</p>
                </div>
                <div className="portal-stat">
                  <p className="portal-stat-value">{data.disbursements.totalCount}</p>
                  <p className="portal-stat-label">Loans disbursed</p>
                </div>
                <div className="portal-stat">
                  <p className="portal-stat-value">
                    {formatUsd(data.disbursements.pendingAmount)}
                  </p>
                  <p className="portal-stat-label">Pending disbursement</p>
                </div>
                <div className="portal-stat">
                  <p className="portal-stat-value">
                    {formatGrowth(data.disbursements.monthOverMonthGrowthPct)}
                  </p>
                  <p className="portal-stat-label">MoM disbursement growth</p>
                </div>
              </div>
              <h3 className="bi-subtitle">Disbursed per month</h3>
              <MonthlyBarChart
                rows={data.disbursements.monthly}
                valueKey="amount"
                formatValue={formatUsd}
              />
            </section>

            <section className="portal-card bi-section">
              <h2 className="bi-section-title">Repayments</h2>
              <div className="portal-grid portal-grid--stats bi-stats">
                <div className="portal-stat">
                  <p className="portal-stat-value">{data.repayments.totalActiveLoans}</p>
                  <p className="portal-stat-label">Loans in repayment</p>
                </div>
                <div className="portal-stat">
                  <p className="portal-stat-value">
                    {data.repayments.countSharePct.on_time}%
                  </p>
                  <p className="portal-stat-label">On time (by count)</p>
                </div>
                <div className="portal-stat">
                  <p className="portal-stat-value">
                    {data.repayments.countSharePct.behind}%
                  </p>
                  <p className="portal-stat-label">Behind (by count)</p>
                </div>
                <div className="portal-stat">
                  <p className="portal-stat-value">
                    {formatUsd(data.repayments.delinquentAmount)}
                  </p>
                  <p className="portal-stat-label">Delinquent amount</p>
                </div>
              </div>

              <RepaymentBucketTable
                title="Repayment health"
                byCount={data.repayments.byCount}
                byAmount={data.repayments.byOutstandingPrincipal}
                shareCount={data.repayments.countSharePct}
                shareAmount={data.repayments.principalSharePct}
              />

              <p className="portal-field-hint" style={{ marginTop: "1rem" }}>
                On-time vs behind is based on expected payments since disbursement
                (using monthly payment or loan amount ÷ term). Paid-off loans are
                tracked separately.
              </p>
            </section>
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
