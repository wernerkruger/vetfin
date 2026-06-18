import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import "./PracticePortal.css";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { login, username, loading } = useAdminAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && username) {
      navigate("/admin", { replace: true });
    }
  }, [loading, username, navigate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    try {
      await login(
        String(form.get("username") ?? ""),
        String(form.get("password") ?? ""),
      );
      navigate("/admin", { replace: true });
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
          <h1 className="portal-title">Admin</h1>
          <p className="portal-lead">
            Sign in to manage user accounts and reset passwords.
          </p>
        </header>

        <div className="portal-card">
          <form className="portal-form" onSubmit={handleSubmit}>
            <label className="portal-label">
              Username
              <input
                name="username"
                type="text"
                required
                autoComplete="username"
                defaultValue="admin"
              />
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
        </div>
      </div>
    </div>
  );
}
