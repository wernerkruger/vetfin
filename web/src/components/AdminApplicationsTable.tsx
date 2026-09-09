import { useState } from "react";
import { Link } from "react-router-dom";
import {
  adminApproveApplication,
  adminDeclineApplication,
  type AdminApplication,
} from "../lib/api";
import "../pages/PracticePortal.css";

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

export type AdminPendingApplication = AdminApplication & {
  borrowerName?: string;
  borrowerEmail?: string | null;
};

type AdminApplicationsTableProps = {
  applications: AdminPendingApplication[];
  busyId: string | null;
  emptyMessage: string;
  onUpdated: (applicationId: string) => void;
  /** When true, show borrower name linking to their admin detail page. */
  showBorrower?: boolean;
};

export default function AdminApplicationsTable({
  applications,
  busyId,
  emptyMessage,
  onUpdated,
  showBorrower = false,
}: AdminApplicationsTableProps) {
  if (applications.length === 0) {
    return <p className="portal-status">{emptyMessage}</p>;
  }

  return (
    <div className="portal-table-wrap">
      <table className="portal-table">
        <thead>
          <tr>
            {showBorrower ? <th>Borrower</th> : null}
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
              {showBorrower ? (
                <td>
                  <Link to={`/admin/borrowers/${app.customerId}`}>
                    {app.borrowerName ?? "Borrower"}
                  </Link>
                </td>
              ) : null}
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
                  onUpdated={() => onUpdated(app.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
