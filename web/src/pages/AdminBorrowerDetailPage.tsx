import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminApplicationsTable from "../components/AdminApplicationsTable";
import DashboardShell from "../components/DashboardShell";
import { useAdminNavItems, notifyAdminPendingDisbursementsChanged, notifyAdminPendingFundingChanged } from "../components/useAdminNavItems";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  fetchAdminBorrower,
  type AdminApplication,
  type BorrowerProfile,
} from "../lib/api";
import "./PracticePortal.css";

function borrowerName(borrower: BorrowerProfile): string {
  return (
    borrower.applicantName?.trim() ||
    [borrower.firstName, borrower.lastName].filter(Boolean).join(" ") ||
    borrower.email ||
    "Borrower"
  );
}

export default function AdminBorrowerDetailPage() {
  const { username, logout } = useAdminAuth();
  const navItems = useAdminNavItems("users");
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
      notifyAdminPendingFundingChanged();
      notifyAdminPendingDisbursementsChanged();
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
    <DashboardShell
      homeTo="/admin"
      navItems={navItems}
      userLabel={username}
      onLogout={logout}
      title={borrowerName(borrower)}
      lead={`${borrower.email ?? "No email"} · Borrower account and loan applications`}
      backTo={{ to: "/admin", label: "Admin" }}
    >
      <div className="portal-inner portal-inner--wide portal-inner--shell">
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
          <AdminApplicationsTable
            applications={applications}
            busyId={busyId}
            emptyMessage="No loan applications yet."
            onUpdated={(id) => void handleApplicationUpdated(id)}
          />
          <p className="portal-field-hint" style={{ marginTop: "1rem" }}>
            Funding decisions require clinic confirmation first. Approved or declined
            applications appear on the vet practice dashboard with the same status.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}
