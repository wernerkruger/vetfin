import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import DashboardShell from "../components/DashboardShell";
import { practiceNavItems } from "../components/PracticeNav";
import PracticeReferralsTable from "../components/PracticeReferralsTable";
import { usePracticeAuth } from "../context/PracticeAuthContext";
import {
  fetchPracticeReferrals,
  type PracticeReferral,
} from "../lib/api";
import {
  filterPracticeReferrals,
  PRACTICE_LOAN_COPY,
  type PracticeLoanFilter,
} from "../lib/practiceLoans";
import "./PracticePortal.css";

const VALID_FILTERS = new Set<PracticeLoanFilter>([
  "review",
  "open",
  "approved",
  "declined",
]);

function parseFilter(raw: string | undefined): PracticeLoanFilter | null {
  if (!raw || !VALID_FILTERS.has(raw as PracticeLoanFilter)) return null;
  return raw as PracticeLoanFilter;
}

export default function PracticeLoansPage() {
  const { filter: filterParam } = useParams<{ filter: string }>();
  const filter = parseFilter(filterParam);
  const { practice, logout } = usePracticeAuth();
  const [referrals, setReferrals] = useState<PracticeReferral[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReferrals = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    return fetchPracticeReferrals()
      .then((ref) => setReferrals(ref.referrals))
      .finally(() => {
        if (!opts?.silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!practice || !filter) return;
    void loadReferrals();
  }, [practice, filter, loadReferrals]);

  const filtered = useMemo(
    () => (filter ? filterPracticeReferrals(referrals, filter) : []),
    [referrals, filter],
  );

  if (!practice) return null;
  if (!filter) {
    return (
      <DashboardShell
        homeTo="/practice/dashboard"
        navItems={practiceNavItems("open")}
        userLabel={practice.name}
        orgName={practice.name}
        onLogout={logout}
        title="Loans"
        lead="Unknown loan section."
      >
        <div className="portal-inner portal-inner--wide portal-inner--shell">
          <p className="portal-status">This loan filter does not exist.</p>
        </div>
      </DashboardShell>
    );
  }

  const copy = PRACTICE_LOAN_COPY[filter];

  return (
    <DashboardShell
      homeTo="/practice/dashboard"
      navItems={practiceNavItems(filter)}
      userLabel={practice.name}
      orgName={practice.name}
      onLogout={logout}
      title={copy.title}
      lead={copy.lead}
    >
      <div className="portal-inner portal-inner--wide portal-inner--shell">
        <section className="portal-card">
          <PracticeReferralsTable
            referrals={filtered}
            loading={loading}
            emptyMessage={copy.empty}
            onUpdated={() => void loadReferrals({ silent: true })}
            showReviewColumn={filter === "review" || filter === "open"}
          />
        </section>
      </div>
    </DashboardShell>
  );
}
