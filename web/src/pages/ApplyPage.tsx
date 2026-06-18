import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  usePlaidLink,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
import {
  ANIMAL_TYPE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  US_STATES,
} from "../lib/applicationOptions";
import {
  borrowerLogin,
  borrowerSignup,
  completeApplicationProfile,
  createApplicationLinkToken,
  exchangeApplicationPlaid,
  fetchCurrentApplication,
  fetchReferralPractice,
  linkApplicationBankAccounts,
  sandboxConnectApplication,
  submitApplication,
  updateApplicationLoan,
  updateBorrowerProfile,
  type BorrowerProfile,
  type LoanApplication,
  type PlaidAccountOption,
} from "../lib/api";
import { useBorrowerAuth } from "../context/BorrowerAuthContext";
import {
  clearBorrowerToken,
  getBorrowerToken,
  setBorrowerToken,
} from "../lib/borrowerAuth";
import "./PracticePortal.css";
import "./ApplyPage.css";

type Step = "account" | "profile" | "loan" | "bank" | "review" | "done";

function isDepository(account: PlaidAccountOption) {
  return account.type === "depository";
}

function stepFromStatus(status: string): Step {
  switch (status) {
    case "submitted":
      return "done";
    case "bank_linked":
      return "review";
    case "loan_details":
      return "bank";
    case "profile_complete":
      return "loan";
    default:
      return "profile";
  }
}

export default function ApplyPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { refresh: refreshBorrowerAuth } = useBorrowerAuth();
  const [practiceName, setPracticeName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("account");
  const [accountMode, setAccountMode] = useState<"signup" | "login">("signup");
  const [application, setApplication] = useState<LoanApplication | null>(null);
  const [borrower, setBorrower] = useState<BorrowerProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [plaidAccounts, setPlaidAccounts] = useState<PlaidAccountOption[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(
    new Set(),
  );
  const [plaidReady, setPlaidReady] = useState(false);

  const resumeSession = useCallback(async (referralSlug: string) => {
    if (!getBorrowerToken()) return;
    try {
      const data = await fetchCurrentApplication(referralSlug);
      setApplication(data.application);
      setBorrower(data.profile);
      setStep(stepFromStatus(data.application.status));
    } catch {
      clearBorrowerToken();
    }
  }, []);

  useEffect(() => {
    if (!slug) return;
    fetchReferralPractice(slug)
      .then((data) => {
        setPracticeName(data.practice.name);
        return resumeSession(slug);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Practice not found"),
      );
  }, [slug, resumeSession]);

  const onPlaidSuccess = useCallback(
    async (publicToken: string, meta: PlaidLinkOnSuccessMetadata) => {
      if (!application) return;
      setError(null);
      try {
        const inst = meta.institution;
        const result = await exchangeApplicationPlaid(
          application.id,
          publicToken,
          inst ? { id: inst.institution_id, name: inst.name } : undefined,
        );
        setPlaidAccounts(result.accounts);
        const depository = result.accounts.filter(isDepository);
        setSelectedAccountIds(new Set(depository.map((a) => a.accountId)));
        setPlaidReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bank connection failed");
      }
    },
    [application],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: (err) => {
      if (err) {
        setError(err.display_message ?? err.error_message ?? "Link cancelled");
      }
    },
  });

  useEffect(() => {
    if (linkToken && ready && step === "bank" && !plaidReady) {
      open();
    }
  }, [linkToken, ready, open, step, plaidReady]);

  async function handleAccountSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slug) return;
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);

    try {
      if (accountMode === "signup") {
        const result = await borrowerSignup({
          referralSlug: slug,
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          firstName: String(form.get("firstName") ?? ""),
          lastName: String(form.get("lastName") ?? ""),
        });
        setBorrowerToken(result.token);
        setBorrower(result.borrower);
        setApplication(result.application);
        await refreshBorrowerAuth();
      } else {
        const result = await borrowerLogin(
          String(form.get("email") ?? ""),
          String(form.get("password") ?? ""),
        );
        setBorrowerToken(result.token);
        setBorrower(result.borrower);
        if (result.mustChangePassword) {
          navigate(result.redirectTo ?? "/borrower/change-password", {
            replace: true,
          });
          return;
        }
        await refreshBorrowerAuth();
        const data = await fetchCurrentApplication(slug);
        setApplication(data.application);
      }
      setStep("profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!application) return;
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);

    try {
      const { borrower: updated } = await updateBorrowerProfile({
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        dateOfBirth: String(form.get("dateOfBirth") ?? ""),
        ssnLast4: String(form.get("ssnLast4") ?? ""),
        addressLine1: String(form.get("addressLine1") ?? ""),
        addressLine2: String(form.get("addressLine2") ?? "") || undefined,
        city: String(form.get("city") ?? ""),
        state: String(form.get("state") ?? ""),
        zip: String(form.get("zip") ?? ""),
      });
      setBorrower(updated);
      const { application: app } = await completeApplicationProfile(application.id);
      setApplication(app);
      setStep("loan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLoanSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!application) return;
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);

    try {
      const { application: app } = await updateApplicationLoan(application.id, {
        loanAmount: Math.round(Number(form.get("loanAmount"))),
        serviceType: String(form.get("serviceType")),
        animalType: String(form.get("animalType")),
        animalName: String(form.get("animalName") ?? "") || undefined,
      });
      setApplication(app);
      setStep("bank");
      setPlaidReady(false);
      setLinkToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save loan details");
    } finally {
      setSubmitting(false);
    }
  }

  async function startPlaidLink() {
    if (!application) return;
    setError(null);
    try {
      const { linkToken: token } = await createApplicationLinkToken(application.id);
      setLinkToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start bank link");
    }
  }

  async function runSandboxBank() {
    if (!application) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await sandboxConnectApplication(application.id);
      setPlaidAccounts(result.accounts);
      const depository = result.accounts.filter(isDepository);
      setSelectedAccountIds(new Set(depository.map((a) => a.accountId)));
      setPlaidReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sandbox connect failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveBankAccounts() {
    if (!application || selectedAccountIds.size === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const { application: app } = await linkApplicationBankAccounts(
        application.id,
        [...selectedAccountIds],
      );
      setApplication(app);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link accounts");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFinalSubmit() {
    if (!application) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await submitApplication(application.id);
      setApplication(result.application);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="portal portal--centered">
        <div className="portal-inner">
          <div className="portal-card">
            <h1 className="portal-title">Link not found</h1>
            <p className="portal-lead">{loadError}</p>
            <Link to="/" className="btn btn--secondary">Go to VetFin</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!practiceName) {
    return (
      <div className="portal portal--centered">
        <p className="portal-status">Loading…</p>
      </div>
    );
  }

  const steps: { id: Step; label: string }[] = [
    { id: "account", label: "Account" },
    { id: "profile", label: "Your info" },
    { id: "loan", label: "Loan" },
    { id: "bank", label: "Bank" },
    { id: "review", label: "Review" },
  ];

  return (
    <div className="portal">
      <div className="portal-inner portal-inner--wide">
        <header className="portal-header">
          <Link to="/" className="portal-back">VetFin</Link>
          <h1 className="portal-title">Pet care financing</h1>
          <p className="portal-lead">
            Referred by <strong>{practiceName}</strong>. Complete all steps to
            apply — your application stays linked to this clinic.
          </p>
        </header>

        {step !== "done" ? (
          <nav className="apply-steps" aria-label="Application progress">
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`apply-step ${step === s.id ? "apply-step--active" : ""} ${
                  steps.findIndex((x) => x.id === step) > i
                    ? "apply-step--done"
                    : ""
                }`}
              >
                {i + 1}. {s.label}
              </span>
            ))}
          </nav>
        ) : null}

        {error ? <p className="portal-error apply-error">{error}</p> : null}

        {step === "account" && (
          <div className="portal-card">
            <div className="apply-tabs">
              <button
                type="button"
                className={accountMode === "signup" ? "apply-tab--active" : ""}
                onClick={() => setAccountMode("signup")}
              >
                Create account
              </button>
              <button
                type="button"
                className={accountMode === "login" ? "apply-tab--active" : ""}
                onClick={() => setAccountMode("login")}
              >
                Log in
              </button>
            </div>
            <form className="portal-form" onSubmit={handleAccountSubmit}>
              {accountMode === "signup" ? (
                <div className="portal-row">
                  <label className="portal-label">
                    First name
                    <input name="firstName" required autoComplete="given-name" />
                  </label>
                  <label className="portal-label">
                    Last name
                    <input name="lastName" required autoComplete="family-name" />
                  </label>
                </div>
              ) : null}
              <label className="portal-label">
                Email
                <input name="email" type="email" required autoComplete="email" />
              </label>
              <label className="portal-label">
                Password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={
                    accountMode === "signup" ? "new-password" : "current-password"
                  }
                />
              </label>
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? "Please wait…" : "Continue"}
              </button>
            </form>
            {accountMode === "login" ? (
              <p className="portal-footer-text" style={{ marginTop: "1rem" }}>
                View all your loans?{" "}
                <Link to="/borrower/login">Log in to your dashboard</Link>
              </p>
            ) : null}
          </div>
        )}

        {step === "profile" && (
          <div className="portal-card">
            <h2 className="apply-section-title">Personal information</h2>
            <p className="apply-section-lead">
              Standard details used to verify your identity (US applicants).
            </p>
            <form className="portal-form" onSubmit={handleProfileSubmit}>
              <div className="portal-row">
                <label className="portal-label">
                  Legal first name
                  <input
                    name="firstName"
                    required
                    defaultValue={borrower?.firstName ?? ""}
                  />
                </label>
                <label className="portal-label">
                  Legal last name
                  <input
                    name="lastName"
                    required
                    defaultValue={borrower?.lastName ?? ""}
                  />
                </label>
              </div>
              <label className="portal-label">
                Mobile phone
                <input
                  name="phone"
                  type="tel"
                  required
                  defaultValue={borrower?.phone ?? ""}
                  autoComplete="tel"
                />
              </label>
              <label className="portal-label">
                Date of birth
                <input
                  name="dateOfBirth"
                  type="date"
                  required
                  defaultValue={borrower?.dateOfBirth ?? ""}
                />
              </label>
              <label className="portal-label">
                SSN (last 4 digits)
                <input
                  name="ssnLast4"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  required
                  placeholder="1234"
                  autoComplete="off"
                />
              </label>
              <label className="portal-label">
                Street address
                <input
                  name="addressLine1"
                  required
                  defaultValue={borrower?.addressLine1 ?? ""}
                  autoComplete="street-address"
                />
              </label>
              <label className="portal-label">
                Apt, suite (optional)
                <input
                  name="addressLine2"
                  defaultValue={borrower?.addressLine2 ?? ""}
                />
              </label>
              <div className="portal-row">
                <label className="portal-label">
                  City
                  <input name="city" required defaultValue={borrower?.city ?? ""} />
                </label>
                <label className="portal-label">
                  State
                  <select name="state" required defaultValue={borrower?.state ?? ""}>
                    <option value="">Select</option>
                    {US_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="portal-label">
                ZIP code
                <input
                  name="zip"
                  required
                  pattern="\d{5}(-\d{4})?"
                  defaultValue={borrower?.zip ?? ""}
                  autoComplete="postal-code"
                />
              </label>
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? "Saving…" : "Continue to loan details"}
              </button>
            </form>
          </div>
        )}

        {step === "loan" && application && (
          <div className="portal-card">
            <h2 className="apply-section-title">Loan &amp; treatment</h2>
            <form className="portal-form" onSubmit={handleLoanSubmit}>
              <label className="portal-label">
                Amount to borrow (USD)
                <input
                  name="loanAmount"
                  type="number"
                  min={1}
                  max={25000}
                  step={1}
                  required
                  defaultValue={
                    application.loanAmount != null
                      ? Math.round(application.loanAmount)
                      : ""
                  }
                />
              </label>
              <p className="apply-field-hint">
                Enter a whole dollar amount from $1 to $25,000.
              </p>
              <label className="portal-label">
                Service / treatment
                <select
                  name="serviceType"
                  required
                  defaultValue={application.serviceType ?? ""}
                >
                  <option value="">Select</option>
                  {SERVICE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="portal-label">
                Type of animal
                <select
                  name="animalType"
                  required
                  defaultValue={application.animalType ?? ""}
                >
                  <option value="">Select</option>
                  {ANIMAL_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="portal-label">
                Pet&apos;s name (optional)
                <input
                  name="animalName"
                  defaultValue={application.animalName ?? ""}
                />
              </label>
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? "Saving…" : "Continue to bank connection"}
              </button>
            </form>
          </div>
        )}

        {step === "bank" && application && (
          <div className="portal-card">
            <h2 className="apply-section-title">Connect your bank</h2>
            <p className="apply-section-lead">
              Securely link a checking or savings account via Plaid (sandbox in
              development).
            </p>
            <div className="apply-bank-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void startPlaidLink()}
              >
                Connect with Plaid
              </button>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => void runSandboxBank()}
                disabled={submitting}
              >
                Skip Link (sandbox test)
              </button>
            </div>

            {plaidReady && plaidAccounts.length > 0 ? (
              <>
                <p className="apply-section-lead">Select accounts to use:</p>
                <ul className="plaid-test-account-list">
                  {plaidAccounts.map((account) => (
                    <li key={account.accountId}>
                      <label className="plaid-test-account-row">
                        <input
                          type="checkbox"
                          checked={selectedAccountIds.has(account.accountId)}
                          disabled={!isDepository(account)}
                          onChange={() => {
                            setSelectedAccountIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(account.accountId)) {
                                next.delete(account.accountId);
                              } else {
                                next.add(account.accountId);
                              }
                              return next;
                            });
                          }}
                        />
                        <span className="plaid-test-account-info">
                          <strong>{account.name}</strong>
                          {account.mask ? ` ····${account.mask}` : ""}
                          <span className="plaid-test-account-type">
                            {account.subtype ?? account.type}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={selectedAccountIds.size === 0 || submitting}
                  onClick={() => void saveBankAccounts()}
                >
                  {submitting ? "Saving…" : "Save bank accounts & continue"}
                </button>
              </>
            ) : null}
          </div>
        )}

        {step === "review" && application && (
          <div className="portal-card">
            <h2 className="apply-section-title">Review &amp; submit</h2>
            <ul className="apply-review-list">
              <li>
                <strong>Borrower:</strong> {borrower?.firstName} {borrower?.lastName}
              </li>
              <li>
                <strong>Amount:</strong> $
                {application.loanAmount?.toLocaleString() ?? "—"}
              </li>
              <li>
                <strong>Service:</strong> {application.serviceType?.replace(/_/g, " ")}
              </li>
              <li>
                <strong>Animal:</strong> {application.animalType}
                {application.animalName ? ` (${application.animalName})` : ""}
              </li>
              <li>
                <strong>Clinic:</strong> {practiceName}
              </li>
              <li>
                <strong>Bank:</strong> Connected
              </li>
            </ul>
            <button
              type="button"
              className="btn btn--primary"
              disabled={submitting}
              onClick={() => void handleFinalSubmit()}
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </div>
        )}

        {step === "done" && application && (
          <div className="portal-card">
            <h2 className="apply-section-title">Application submitted</h2>
            <p className="portal-lead">
              Thank you! Your application with <strong>{practiceName}</strong>{" "}
              has been submitted. Reference: <code>{application.id}</code>
            </p>
            <Link to="/" className="btn btn--secondary">
              Back to VetFin
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
