import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { useBorrowerAuth } from "../context/BorrowerAuthContext";
import { changeBorrowerPassword } from "../lib/api";
import "./PracticePortal.css";

export default function BorrowerChangePasswordPage() {
  const navigate = useNavigate();
  const { refresh } = useBorrowerAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      setSubmitting(false);
      return;
    }

    try {
      await changeBorrowerPassword(
        String(form.get("currentPassword") ?? ""),
        newPassword,
      );
      await refresh();
      navigate("/borrower/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Change your password"
      lead="You must set a new password before continuing."
    >
      <form className="portal-form" onSubmit={handleSubmit}>
        <label className="portal-label">
          Current password
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <label className="portal-label">
          New password
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label className="portal-label">
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>

        {error ? <p className="portal-error">{error}</p> : null}

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? "Saving…" : "Update password"}
        </button>
      </form>

      <p className="portal-footer-text">
        <Link to="/borrower/login">Back to login</Link>
      </p>
    </AuthLayout>
  );
}
