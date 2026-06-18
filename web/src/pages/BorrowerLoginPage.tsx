import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBorrowerAuth } from "../context/BorrowerAuthContext";
import "./PracticePortal.css";

export default function BorrowerLoginPage() {
  const navigate = useNavigate();
  const { login, borrower, loading } = useBorrowerAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && borrower) {
      navigate("/borrower/dashboard", { replace: true });
    }
  }, [loading, borrower, navigate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    try {
      const redirectTo = await login(
        String(form.get("email") ?? ""),
        String(form.get("password") ?? ""),
      );
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal">
      <div className="portal-inner">
        <header className="portal-header">
          <Link to="/" className="portal-back">
            ← VetFin
          </Link>
          <h1 className="portal-title">Your account</h1>
          <p className="portal-lead">
            Log in to view your loans, track repayments, and apply for new
            financing.
          </p>
        </header>

        <div className="portal-card">
          <form className="portal-form" onSubmit={handleSubmit}>
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
                autoComplete="current-password"
              />
            </label>

            {error ? <p className="portal-error">{error}</p> : null}

            <button
              type="submit"
              className="btn btn--primary"
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Log in"}
            </button>
          </form>

          <p className="portal-footer-text">
            Applying through your vet? Use the referral link from your clinic to
            start an application.
          </p>
        </div>
      </div>
    </div>
  );
}
