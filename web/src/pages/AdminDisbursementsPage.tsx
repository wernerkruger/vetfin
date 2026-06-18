import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminNav from "../components/AdminNav";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  adminMarkDisbursementSent,
  fetchAdminDisbursements,
  type AdminDisbursement,
} from "../lib/api";
import "./PracticePortal.css";

function formatMoney(amount: number | null): string {
  if (amount == null) return "—";
  return `$${amount.toLocaleString()}`;
}

export default function AdminDisbursementsPage() {
  const { username, logout } = useAdminAuth();
  const [disbursements, setDisbursements] = useState<AdminDisbursement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAdminDisbursements();
      setDisbursements(data.disbursements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load disbursements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleMarkSent(item: AdminDisbursement) {
    if (
      !window.confirm(
        `Mark ${formatMoney(item.loanAmount)} as sent to ${item.borrowerName}?`,
      )
    ) {
      return;
    }

    setMarkingId(item.applicationId);
    setError(null);
    try {
      await adminMarkDisbursementSent(item.applicationId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update disbursement");
    } finally {
      setMarkingId(null);
    }
  }

  const pending = disbursements.filter((d) => d.disbursementStatus === "pending");
  const disbursed = disbursements.filter((d) => d.disbursementStatus === "disbursed");

  return (
    <div className="portal">
      <div className="portal-inner portal-inner--wide">
        <header className="portal-header portal-header--row">
          <div>
            <Link to="/" className="portal-back">
              ← VetFin
            </Link>
            <h1 className="portal-title">Disbursements</h1>
            <p className="portal-lead">
              Signed in as <strong>{username}</strong>. Fully approved loans
              awaiting or completed payout.
            </p>
          </div>
          <button type="button" className="btn btn--secondary" onClick={logout}>
            Log out
          </button>
        </header>

        <AdminNav active="disbursements" />

        <div className="portal-grid portal-grid--stats" style={{ margin: "1.5rem 0" }}>
          <div className="portal-stat">
            <p className="portal-stat-value">{pending.length}</p>
            <p className="portal-stat-label">Pending payout</p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">{disbursed.length}</p>
            <p className="portal-stat-label">Disbursed</p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">
              {formatMoney(
                pending.reduce((sum, d) => sum + (d.loanAmount ?? 0), 0),
              )}
            </p>
            <p className="portal-stat-label">Pending amount</p>
          </div>
        </div>

        <div className="portal-card">
          {error ? <p className="portal-error">{error}</p> : null}

          {loading ? (
            <p>Loading disbursements…</p>
          ) : disbursements.length === 0 ? (
            <p className="portal-status">
              No fully approved loans yet. Applications appear here after clinic
              confirmation and VetFin funding approval.
            </p>
          ) : (
            <div className="portal-table-wrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Borrower</th>
                    <th>Clinic</th>
                    <th>Amount</th>
                    <th>Approved</th>
                    <th>Status</th>
                    <th>Sent</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {disbursements.map((item) => (
                    <tr key={item.applicationId}>
                      <td>
                        <Link to={`/admin/borrowers/${item.customerId}`}>
                          {item.borrowerName}
                        </Link>
                        {item.borrowerEmail ? (
                          <div className="portal-muted">{item.borrowerEmail}</div>
                        ) : null}
                      </td>
                      <td>{item.practiceName}</td>
                      <td>{formatMoney(item.loanAmount)}</td>
                      <td>
                        {item.approvedAt
                          ? new Date(item.approvedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={`portal-badge portal-badge--disbursement-${item.disbursementStatus}`}
                        >
                          {item.disbursementStatusLabel}
                        </span>
                      </td>
                      <td>
                        {item.disbursedAt
                          ? new Date(item.disbursedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="portal-table-actions">
                        {item.disbursementStatus === "pending" ? (
                          <button
                            type="button"
                            className="btn btn--primary btn--small"
                            disabled={markingId === item.applicationId}
                            onClick={() => void handleMarkSent(item)}
                          >
                            {markingId === item.applicationId
                              ? "Saving…"
                              : "Mark as sent"}
                          </button>
                        ) : (
                          <span className="portal-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
