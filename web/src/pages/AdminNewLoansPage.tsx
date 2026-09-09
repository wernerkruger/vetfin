import { useCallback, useEffect, useState } from "react";
import AdminApplicationsTable, {
  type AdminPendingApplication,
} from "../components/AdminApplicationsTable";
import DashboardShell from "../components/DashboardShell";
import { useAdminNavItems, notifyAdminPendingDisbursementsChanged, notifyAdminPendingFundingChanged } from "../components/useAdminNavItems";
import { useAdminAuth } from "../context/AdminAuthContext";
import { fetchAdminPendingFundingApplications } from "../lib/api";
import "./PracticePortal.css";

export default function AdminNewLoansPage() {
  const { username, logout } = useAdminAuth();
  const navItems = useAdminNavItems("new-loans");
  const [applications, setApplications] = useState<AdminPendingApplication[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAdminPendingFundingApplications();
      setApplications(data.applications);
      notifyAdminPendingFundingChanged();
      notifyAdminPendingDisbursementsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load new loans");
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <DashboardShell
      homeTo="/admin"
      navItems={navItems}
      userLabel={username}
      onLogout={logout}
      title="New loans"
      lead="Clinic-confirmed applications waiting for a VetFin funding decision."
    >
      <div className="portal-inner portal-inner--wide portal-inner--shell">
        <div
          className="portal-grid portal-grid--stats"
          style={{ marginBottom: "1.5rem" }}
        >
          <div className="portal-stat">
            <p className="portal-stat-value">{applications.length}</p>
            <p className="portal-stat-label">Unprocessed</p>
          </div>
        </div>

        <section className="portal-card">
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
            Awaiting funding decision
          </h2>
          {error ? <p className="portal-error">{error}</p> : null}
          {loading ? (
            <p className="portal-status">Loading…</p>
          ) : (
            <AdminApplicationsTable
              applications={applications}
              busyId={busyId}
              emptyMessage="No new loans need action right now."
              onUpdated={(id) => void handleApplicationUpdated(id)}
              showBorrower
            />
          )}
          <p className="portal-field-hint" style={{ marginTop: "1rem" }}>
            These applications were confirmed by the clinic. Approve or decline
            funding here — the same actions as on the borrower detail page.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}
