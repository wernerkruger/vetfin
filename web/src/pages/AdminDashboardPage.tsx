import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  adminResetUserPassword,
  fetchAdminUsers,
  type AdminUser,
} from "../lib/api";
import "./PracticePortal.css";

export default function AdminDashboardPage() {
  const { username, logout } = useAdminAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAdminUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleReset(user: AdminUser) {
    if (
      !window.confirm(
        `Reset password for ${user.email}? They will receive a temporary password and must change it on next login.`,
      )
    ) {
      return;
    }

    setResettingId(user.id);
    setError(null);
    try {
      const result = await adminResetUserPassword(user.type, user.id);
      setTemporaryPassword({
        email: user.email,
        password: result.temporaryPassword,
      });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setResettingId(null);
    }
  }

  return (
    <div className="portal">
      <div className="portal-inner portal-inner--wide">
        <header className="portal-header portal-header--row">
          <div>
            <Link to="/" className="portal-back">
              ← VetFin
            </Link>
            <h1 className="portal-title">User management</h1>
            <p className="portal-lead">
              Signed in as <strong>{username}</strong>. Reset passwords for locked
              accounts or issue temporary passwords.
            </p>
          </div>
          <button type="button" className="btn btn--secondary" onClick={logout}>
            Log out
          </button>
        </header>

        {temporaryPassword ? (
          <div className="portal-card portal-card--highlight">
            <h2 className="portal-subtitle">Temporary password</h2>
            <p>
              Share this with <strong>{temporaryPassword.email}</strong> through a
              secure channel. It will only be shown once.
            </p>
            <p className="portal-temp-password">{temporaryPassword.password}</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setTemporaryPassword(null)}
            >
              I have copied it
            </button>
          </div>
        ) : null}

        <div className="portal-card">
          {error ? <p className="portal-error">{error}</p> : null}

          {loading ? (
            <p>Loading users…</p>
          ) : users.length === 0 ? (
            <p>No user accounts yet.</p>
          ) : (
            <div className="portal-table-wrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Failed logins</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={`${user.type}-${user.id}`}>
                      <td>{user.type === "practice" ? "Practice" : "Borrower"}</td>
                      <td>{user.displayName}</td>
                      <td>{user.email}</td>
                      <td>
                        {user.isLocked
                          ? "Locked"
                          : user.mustChangePassword
                            ? "Must change password"
                            : "Active"}
                      </td>
                      <td>{user.failedLoginAttempts}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--secondary btn--small"
                          disabled={resettingId === user.id}
                          onClick={() => void handleReset(user)}
                        >
                          {resettingId === user.id
                            ? "Resetting…"
                            : "Reset password"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
