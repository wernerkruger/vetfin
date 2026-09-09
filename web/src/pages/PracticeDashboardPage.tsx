import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardShell from "../components/DashboardShell";
import { practiceNavItems } from "../components/PracticeNav";
import { usePracticeAuth } from "../context/PracticeAuthContext";
import {
  fetchPracticeQrData,
  fetchPracticeReferrals,
  type PracticeStats,
} from "../lib/api";
import "./PracticePortal.css";

export default function PracticeDashboardPage() {
  const { practice, referralUrl, logout } = usePracticeAuth();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
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

  const loadStats = useCallback(() => {
    setLoading(true);
    return fetchPracticeReferrals()
      .then((ref) => setStats(ref.stats))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!practice) return;

    void Promise.all([fetchPracticeQrData(), loadStats()]).then(([qr]) => {
      setQrDataUrl(qr.qrDataUrl);
    });
  }, [practice, loadStats]);

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
      navItems={practiceNavItems("dashboard")}
      userLabel={practice.name}
      orgName={practice.name}
      onLogout={logout}
      title="Practice dashboard"
      lead="Share your referral link or QR code so pet owners apply for financing through your clinic. Use the sidebar to review open and approved loans."
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
          <Link to="/practice/loans/open" className="portal-stat portal-stat--link">
            <p className="portal-stat-value">{stats.totalApplications}</p>
            <p className="portal-stat-label">Total applications</p>
          </Link>
          <Link to="/practice/loans/open" className="portal-stat portal-stat--link">
            <p className="portal-stat-value">{stats.started}</p>
            <p className="portal-stat-label">In progress</p>
          </Link>
          <Link
            to="/practice/loans/review"
            className="portal-stat portal-stat--link"
          >
            <p className="portal-stat-value">{stats.submitted}</p>
            <p className="portal-stat-label">Awaiting your review</p>
          </Link>
          <Link to="/practice/loans/open" className="portal-stat portal-stat--link">
            <p className="portal-stat-value">{stats.vetApproved}</p>
            <p className="portal-stat-label">Pending funding</p>
          </Link>
          <Link
            to="/practice/loans/approved"
            className="portal-stat portal-stat--link"
          >
            <p className="portal-stat-value">{stats.fundingApproved}</p>
            <p className="portal-stat-label">Approved</p>
          </Link>
          <Link
            to="/practice/loans/declined"
            className="portal-stat portal-stat--link"
          >
            <p className="portal-stat-value">{stats.declined}</p>
            <p className="portal-stat-label">Declined</p>
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
