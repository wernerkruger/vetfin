import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminNav from "../components/AdminNav";
import {
  adminApproveApplication,
  adminDeclineApplication,
  fetchAdminBorrower,
  type AdminApplication,
  type BorrowerProfile,
} from "../lib/api";
import "./PracticePortal.css";

function formatMoney(amount: number | null): string {
  if (amount == null) return "—";
  return `$${amount.toLocaleString()}`;
}

function ApplicationActions({
  application,
  busyId,
  onUpdated,
}: {
  application: AdminApplication;
  busyId: string | null;
  onUpdated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const busy = busyId === application.id;

  if (!application.canApproveFunding && !application.canDeclineFunding) {
    return <span className="portal-muted">—</span>;
  }

  async function handleApprove() {
    setError(null);
    try {
      await adminApproveApplication(application.id);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve");
    }
  }

  async function handleDecline() {
    setError(null);
    try {
      await adminDeclineApplication(application.id);
      setConfirmDecline(false);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decline");
    }
  }

  if (confirmDecline) {
    return (
      <div className="practice-review-actions">
        <p className="practice-review-hint">Decline funding for this application?</p>
        {error ? <p className="portal-error">{error}</p> : null}
        <div className="practice-review-buttons">
          <button
            type="button"
            className="btn btn--secondary btn--small"
            disabled={busy}
            onClick={() => {
              setConfirmDecline(false);
              setError(null);
            }}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn--danger btn--small"
            disabled={busy}
            onClick={() => void handleDecline()}
          >
            {busy ? "…" : "Confirm decline"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-review-actions">
      {error ? <p className="portal-error">{error}</p> : null}
      <div className="practice-review-buttons">
        <button
          type="button"
          className="btn btn--primary btn--small"
          disabled={busy}
          onClick={() => void handleApprove()}
        >
          {busy ? "…" : "Approve"}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          disabled={busy}
          onClick={() => setConfirmDecline(true)}
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function borrowerName(borrower: BorrowerProfile): string {
  return (
    borrower.applicantName?.trim() ||
    [borrower.firstName, borrower.lastName].filter(Boolean).join(" ") ||
    borrower.email ||
    "Borrower"
  );
}

export default function AdminBorrowerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [borrower, setBorrower] = useState<BorrowerProfile | null>(null);
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const data = await fetchAdminBorrower(id);
      setBorrower(data.borrower);
      setApplications(data.applications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load borrower");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleApplicationUpdated(applicationId: string) {
    setBusyId(applicationId);
    try {
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="portal portal--centered">
        <p className="portal-status">Loading…</p>
      </div>
    );
  }

  if (!borrower || error) {
    return (
      <div className="portal">
        <div className="portal-inner">
          <div className="portal-card">
            <h1 className="portal-title">Borrower not found</h1>
            <p className="portal-lead">{error ?? "This borrower could not be loaded."}</p>
            <Link to="/admin" className="btn btn--secondary">
              Back to admin
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal">
      <div className="portal-inner portal-inner--wide">
        <header className="portal-header">
          <Link to="/admin" className="portal-back">
            ← Admin
          </Link>
          <h1 className="portal-title">{borrowerName(borrower)}</h1>
          <p className="portal-lead">
            {borrower.email ?? "No email"} · Borrower account and loan applications
          </p>
        </header>

        <AdminNav active="users" />

        <div className="portal-grid portal-grid--stats" style={{ marginBottom: "1.5rem" }}>
          <div className="portal-stat">
            <p className="portal-stat-value">{applications.length}</p>
            <p className="portal-stat-label">Applications</p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">
              {applications.filter((a) => a.status === "approved").length}
            </p>
            <p className="portal-stat-label">Approved</p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">
              {applications.filter((a) => a.canApproveFunding).length}
            </p>
            <p className="portal-stat-label">Pending funding</p>
          </div>
        </div>

        <section className="portal-card">
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
            Loan applications
          </h2>
          {applications.length === 0 ? (
            <p className="portal-status">No loan applications yet.</p>
          ) : (
            <div className="portal-table-wrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Clinic</th>
                    <th>Amount</th>
                    <th>Service</th>
                    <th>Pet</th>
                    <th>Status</th>
                    <th>Clinic review</th>
                    <th>Disbursement</th>
                    <th>Updated</th>
                    <th>Funding</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id}>
                      <td>{app.practiceName ?? app.referralSlug}</td>
                      <td>{formatMoney(app.loanAmount)}</td>
                      <td>{app.serviceType?.replace(/_/g, " ") ?? "—"}</td>
                      <td>{app.animalName ?? app.animalType ?? "—"}</td>
                      <td>
                        <span className={`portal-badge portal-badge--${app.status}`}>
                          {app.statusLabel}
                        </span>
                      </td>
                      <td>{app.practiceStatusLabel}</td>
                      <td>
                        {app.disbursementStatusLabel ? (
                          <span
                            className={`portal-badge portal-badge--disbursement-${app.disbursementStatus}`}
                          >
                            {app.disbursementStatusLabel}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{new Date(app.updatedAt).toLocaleDateString()}</td>
                      <td>
                        <ApplicationActions
                          application={app}
                          busyId={busyId}
                          onUpdated={() => void handleApplicationUpdated(app.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="portal-field-hint" style={{ marginTop: "1rem" }}>
            Funding decisions require clinic confirmation first. Approved or declined
            applications appear on the vet practice dashboard with the same status.
          </p>
        </section>
      </div>
    </div>
  );
}
