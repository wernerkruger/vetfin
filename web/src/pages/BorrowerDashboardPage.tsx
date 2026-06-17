import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useBorrowerAuth } from "../context/BorrowerAuthContext";
import {
  cancelLoanApplication,
  fetchBorrowerDashboard,
  type BorrowerDashboard,
  type LoanApplication,
} from "../lib/api";
import "./PracticePortal.css";

function formatUsd(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatRate(rate: number | null | undefined): string {
  if (rate == null) return "—";
  return `${rate}%`;
}

function isInProgress(status: string): boolean {
  return ["draft", "profile_complete", "loan_details", "bank_linked"].includes(
    status,
  );
}

function LoanCard({
  loan,
  onCancelled,
}: {
  loan: LoanApplication;
  onCancelled: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancel() {
    setCancelError(null);
    setCancelling(true);
    try {
      await cancelLoanApplication(loan.id);
      onCancelled();
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : "Could not cancel application",
      );
    } finally {
      setCancelling(false);
      setConfirming(false);
    }
  }

  const showTerms =
    loan.amountRepaid != null ||
    loan.monthlyPayment != null ||
    loan.termMonthsRemaining != null ||
    loan.interestRate != null;

  return (
    <article className="portal-card borrower-loan-card">
      <div className="borrower-loan-card__header">
        <div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)" }}>
            {loan.practiceName ?? loan.referralSlug}
          </h3>
          {loan.animalName ? (
            <p style={{ margin: "0.25rem 0 0", color: "var(--color-ink-muted)" }}>
              {loan.animalName}
              {loan.loanAmount != null
                ? ` · ${formatUsd(loan.loanAmount)} requested`
                : null}
            </p>
          ) : loan.loanAmount != null ? (
            <p style={{ margin: "0.25rem 0 0", color: "var(--color-ink-muted)" }}>
              {formatUsd(loan.loanAmount)} requested
            </p>
          ) : null}
        </div>
        <span className={`borrower-status borrower-status--${loan.status}`}>
          {loan.statusLabel ?? loan.status}
        </span>
      </div>

      {showTerms ? (
        <dl className="borrower-loan-details">
          <div>
            <dt>Repaid</dt>
            <dd>{formatUsd(loan.amountRepaid)}</dd>
          </div>
          <div>
            <dt>Monthly payment</dt>
            <dd>{formatUsd(loan.monthlyPayment)}</dd>
          </div>
          <div>
            <dt>Term remaining</dt>
            <dd>
              {loan.termMonthsRemaining != null
                ? `${loan.termMonthsRemaining} mo`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Interest rate</dt>
            <dd>{formatRate(loan.interestRate)}</dd>
          </div>
        </dl>
      ) : loan.status === "submitted" ? (
        <>
          <p style={{ margin: "1rem 0 0", color: "var(--color-ink-muted)" }}>
            {loan.vetApproved === 1
              ? "Your clinic has confirmed this application. Loan terms will appear here once final approval is complete."
              : loan.vetApproved === 0
                ? "Your clinic did not confirm this application."
                : "Your clinic needs to confirm this application before it can be approved for funding."}
          </p>
          {loan.vetApproved == null ? (
            confirming ? (
              <div className="borrower-cancel-confirm" style={{ marginTop: "1rem" }}>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.9375rem" }}>
                Cancel this submission? You can submit a new application later if
                you change your mind.
              </p>
              {cancelError ? (
                <p className="portal-error" style={{ marginBottom: "0.5rem" }}>
                  {cancelError}
                </p>
              ) : null}
              <div className="borrower-cancel-actions">
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={cancelling}
                  onClick={() => {
                    setConfirming(false);
                    setCancelError(null);
                  }}
                >
                  Keep application
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={cancelling}
                  onClick={() => void handleCancel()}
                >
                  {cancelling ? "Cancelling…" : "Yes, cancel submission"}
                </button>
              </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--secondary"
                style={{ marginTop: "1rem" }}
                onClick={() => setConfirming(true)}
              >
                Cancel submission
              </button>
            )
          ) : null}
        </>
      ) : loan.status === "cancelled" ? (
        <p style={{ margin: "1rem 0 0", color: "var(--color-ink-muted)" }}>
          You cancelled this submission before it was reviewed.
        </p>
      ) : loan.status === "declined" ? (
        <p style={{ margin: "1rem 0 0", color: "var(--color-ink-muted)" }}>
          This application was not approved.
        </p>
      ) : null}

      {isInProgress(loan.status) ? (
        <Link
          to={`/apply/${loan.referralSlug}`}
          className="btn btn--secondary"
          style={{ marginTop: "1rem", display: "inline-block" }}
        >
          Continue application
        </Link>
      ) : loan.status === "cancelled" ? (
        <Link
          to={`/apply/${loan.referralSlug}`}
          className="btn btn--secondary"
          style={{ marginTop: "1rem", display: "inline-block" }}
        >
          Apply again
        </Link>
      ) : null}
    </article>
  );
}

export default function BorrowerDashboardPage() {
  const { borrower, logout } = useBorrowerAuth();
  const [dashboard, setDashboard] = useState<BorrowerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    return fetchBorrowerDashboard()
      .then(setDashboard)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load dashboard"),
      )
      .finally(() => {
        if (!opts?.silent) setLoading(false);
      });
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  if (!borrower) return null;

  const displayName =
    borrower.firstName && borrower.lastName
      ? `${borrower.firstName} ${borrower.lastName}`
      : borrower.email;

  const loans = dashboard?.loans ?? [];

  return (
    <div className="portal">
      <div className="portal-inner portal-inner--wide">
        <div className="portal-topbar">
          <Link to="/" className="portal-topbar-brand">
            VetFin
          </Link>
          <div>
            <span style={{ marginRight: "1rem", color: "var(--color-ink-muted)" }}>
              {displayName}
            </span>
            <button type="button" className="btn btn--secondary" onClick={logout}>
              Log out
            </button>
          </div>
        </div>

        <header className="portal-header">
          <h1 className="portal-title">My loans</h1>
          <p className="portal-lead">
            View your applications and active loans, or apply for new financing
            through a participating vet clinic.
          </p>
        </header>

        <section className="portal-card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0, fontFamily: "var(--font-display)" }}>
            Apply for a new loan
          </h2>
          <p style={{ color: "var(--color-ink-muted)", margin: "0 0 1rem" }}>
            Use the referral link from your vet clinic, or enter your clinic&apos;s
            code if you have it.
          </p>
          <Link to="/borrower/apply" className="btn btn--primary">
            Start new application
          </Link>
        </section>

        {loading ? (
          <p style={{ color: "var(--color-ink-muted)" }}>Loading your loans…</p>
        ) : error ? (
          <p className="portal-error">{error}</p>
        ) : loans.length === 0 ? (
          <div className="portal-card">
            <p style={{ margin: 0, color: "var(--color-ink-muted)" }}>
              You don&apos;t have any loan applications yet. When your vet shares
              their VetFin link, you can apply from there or use the button above.
            </p>
          </div>
        ) : (
          <div className="borrower-loans-list">
            {loans.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                onCancelled={() => void loadDashboard({ silent: true })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
