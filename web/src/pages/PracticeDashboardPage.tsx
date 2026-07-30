import { useCallback, useEffect, useState } from "react";
import DashboardShell, { type ShellNavItem } from "../components/DashboardShell";
import { HomeIcon } from "../components/icons";
import { usePracticeAuth } from "../context/PracticeAuthContext";
import {
  fetchPracticeQrData,
  fetchPracticeReferrals,
  vetApproveApplication,
  vetCancelApplication,
  type PracticeReferral,
  type PracticeStats,
} from "../lib/api";
import "./PracticePortal.css";

const NAV_ITEMS: ShellNavItem[] = [
  { to: "/practice/dashboard", label: "Dashboard", icon: <HomeIcon /> },
];

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

export default function PracticeDashboardPage() {
  const { practice, referralUrl, logout } = usePracticeAuth();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<PracticeReferral[]>([]);
  const [stats, setStats] = useState<PracticeStats>({
    totalApplications: 0,
    submitted: 0,
    vetApproved: 0,
    fundingApproved: 0,
    declined: 0,
    started: 0,
  });
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadReferrals = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    return fetchPracticeReferrals()
      .then((ref) => {
        setReferrals(ref.referrals);
        setStats(ref.stats);
      })
      .finally(() => {
        if (!opts?.silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!practice) return;

    void Promise.all([fetchPracticeQrData(), loadReferrals()]).then(([qr]) => {
      setQrDataUrl(qr.qrDataUrl);
    });
  }, [practice, loadReferrals]);

  async function copyReferralUrl() {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!practice) return null;

  return (
    <DashboardShell
      homeTo="/practice/dashboard"
      navItems={NAV_ITEMS}
      userLabel={practice.name}
      onLogout={logout}
      title="Practice dashboard"
      lead="Share your referral link or QR code so pet owners apply for financing through your clinic. Confirm each submitted application is legitimate before it can be approved for funding."
    >
      <div className="portal-inner portal-inner--wide portal-inner--shell">
        <div className="portal-grid">
          <section className="portal-card portal-referral-box">
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
              Referral link
            </h2>
            <p style={{ color: "var(--color-ink-muted)", margin: "0 0 1rem" }}>
              Pet owners use this URL to start a loan application. Slug:{" "}
              <code>{practice.slug}</code>
            </p>
            <div className="portal-url-row">
              <input
                className="portal-url-input"
                readOnly
                value={referralUrl ?? ""}
                aria-label="Referral URL"
              />
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void copyReferralUrl()}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </section>

          <section className="portal-card portal-referral-box">
            <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
              QR code
            </h2>
            <p style={{ color: "var(--color-ink-muted)", margin: "0 0 1rem" }}>
              Print or display at checkout — scans open your apply page.
            </p>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${practice.name} referral link`}
                className="portal-qr"
                width={200}
                height={200}
              />
            ) : (
              <p className="portal-status">
                {loading ? "Generating QR code…" : "QR unavailable"}
              </p>
            )}
          </section>
        </div>

        <div
          className="portal-grid portal-grid--stats"
          style={{ marginTop: "1.5rem" }}
        >
          <div className="portal-stat">
            <p className="portal-stat-value">{stats.totalApplications}</p>
            <p className="portal-stat-label">Total applications</p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">{stats.started}</p>
            <p className="portal-stat-label">In progress</p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">{stats.submitted}</p>
            <p className="portal-stat-label">Awaiting your review</p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">{stats.vetApproved}</p>
            <p className="portal-stat-label">Pending funding</p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">{stats.fundingApproved}</p>
            <p className="portal-stat-label">Approved</p>
          </div>
          <div className="portal-stat">
            <p className="portal-stat-value">{stats.declined}</p>
            <p className="portal-stat-label">Declined</p>
          </div>
        </div>

        <section className="portal-card" style={{ marginTop: "1.5rem" }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
            Referred applications
          </h2>
          {loading ? (
            <p className="portal-status">Loading…</p>
          ) : referrals.length === 0 ? (
            <p className="portal-status">
              No applications yet. Share your link or QR code to get started.
            </p>
          ) : (
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
                    <th>Review</th>
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
                      <td>
                        <VetReviewActions
                          referral={r}
                          onUpdated={() => void loadReferrals({ silent: true })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
