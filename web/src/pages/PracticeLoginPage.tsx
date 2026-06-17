import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePracticeAuth } from "../context/PracticeAuthContext";
import "./PracticePortal.css";

export default function PracticeLoginPage() {
  const navigate = useNavigate();
  const { login, practice, loading } = usePracticeAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && practice) {
      navigate("/practice/dashboard", { replace: true });
    }
  }, [loading, practice, navigate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    try {
      await login(
        String(form.get("email") ?? ""),
        String(form.get("password") ?? ""),
      );
      navigate("/practice/dashboard", { replace: true });
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
          <h1 className="portal-title">Practice portal</h1>
          <p className="portal-lead">
            Log in to manage your referral link, QR code, and applications.
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
            New partner?{" "}
            <Link to="/practice/signup">Create a practice account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
