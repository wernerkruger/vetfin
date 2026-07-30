import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
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
    <AuthLayout
      title="Practice portal"
      lead="Log in to manage your referral link, QR code, and applications."
    >
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

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? "Signing in…" : "Log in"}
        </button>
      </form>

      <p className="portal-footer-text">
        New partner? <Link to="/practice/signup">Create a practice account</Link>
      </p>
    </AuthLayout>
  );
}
