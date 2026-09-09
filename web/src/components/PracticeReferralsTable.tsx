import { useState } from "react";
import {
  vetApproveApplication,
  vetCancelApplication,
  type PracticeReferral,
} from "../lib/api";
import "../pages/PracticePortal.css";

function VetReviewActions({
  referral,
  onUpdated,
}: {
  referral: PracticeReferral;
  onUpdated: () => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!referral.applicationId || !referral.needsVetReview) {
    return <span className="portal-muted">—</span>;
  }

  async function handleApprove() {
    setError(null);
    setBusy(true);
    try {
      await vetApproveApplication(referral.applicationId!);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setError(null);
    setBusy(true);
    try {
      await vetCancelApplication(referral.applicationId!);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setBusy(false);
      setConfirmingCancel(false);
    }
  }

  if (confirmingCancel) {
    return (
      <div className="practice-review-actions">
        <p className="practice-review-hint">Reject this application?</p>
        {error ? <p className="portal-error">{error}</p> : null}
        <div className="practice-review-buttons">
          <button
            type="button"
            className="btn btn--secondary btn--small"
            disabled={busy}
            onClick={() => {
              setConfirmingCancel(false);
              setError(null);
            }}
          >
            Back
          </button>
          <button
            type="button"
            className="btn btn--danger btn--small"
            disabled={busy}
            onClick={() => void handleCancel()}
          >
            {busy ? "…" : "Confirm cancel"}
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
          onClick={() => setConfirmingCancel(true)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type PracticeReferralsTableProps = {
  referrals: PracticeReferral[];
  loading: boolean;
  emptyMessage: string;
  onUpdated: () => void;
  showReviewColumn?: boolean;
};

export default function PracticeReferralsTable({
  referrals,
  loading,
  emptyMessage,
  onUpdated,
  showReviewColumn = true,
}: PracticeReferralsTableProps) {
  if (loading) {
    return <p className="portal-status">Loading…</p>;
  }

  if (referrals.length === 0) {
    return <p className="portal-status">{emptyMessage}</p>;
  }

  return (
    <div className="portal-table-wrap">
      <table className="portal-table">
        <thead>
          <tr>
            <th>Applicant</th>
            <th>Email</th>
            <th>Amount</th>
            <th>Service</th>
            <th>Pet</th>
            <th>Status</th>
            <th>Updated</th>
            {showReviewColumn ? <th>Review</th> : null}
          </tr>
        </thead>
        <tbody>
          {referrals.map((r) => (
            <tr key={r.applicationId ?? r.customerId}>
              <td>{r.applicantName ?? "—"}</td>
              <td>{r.email ?? "—"}</td>
              <td>
                {r.loanAmount != null
                  ? `$${r.loanAmount.toLocaleString()}`
                  : "—"}
              </td>
              <td>{r.serviceType?.replace(/_/g, " ") ?? "—"}</td>
              <td>{r.animalName ?? r.animalType ?? "—"}</td>
              <td>
                <span
                  className={`portal-badge portal-badge--${r.applicationStatus}`}
                >
                  {r.statusLabel}
                </span>
              </td>
              <td>{new Date(r.updatedAt).toLocaleDateString()}</td>
              {showReviewColumn ? (
                <td>
                  <VetReviewActions referral={r} onUpdated={onUpdated} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
