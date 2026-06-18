import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminNav from "../components/AdminNav";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  adminResetUserPassword,
  adminUnlockUser,
  fetchAdminUsers,
  type AdminUser,
} from "../lib/api";
import "./PracticePortal.css";

type AdminTab = "practices" | "borrowers";

function statusLabel(user: AdminUser): string {
  if (user.isLocked) return "Locked";
  if (user.mustChangePassword) return "Must change password";
  if (!user.hasLogin) return "No login yet";
  return "Active";
}

function UserTable({
  users,
  emptyMessage,
  resettingId,
  unlockingId,
  onReset,
  onUnlock,
  linkBorrowers = false,
}: {
  users: AdminUser[];
  emptyMessage: string;
  resettingId: string | null;
  unlockingId: string | null;
  onReset: (user: AdminUser) => void;
  onUnlock: (user: AdminUser) => void;
  linkBorrowers?: boolean;
}) {
  if (users.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div className="portal-table-wrap">
      <table className="portal-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Failed logins</th>
            <th>Created</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                {linkBorrowers && user.type === "borrower" ? (
                  <Link to={`/admin/borrowers/${user.id}`}>{user.displayName}</Link>
                ) : (
                  user.displayName
                )}
              </td>
              <td>{user.email}</td>
              <td>{statusLabel(user)}</td>
              <td>{user.failedLoginAttempts}</td>
              <td>{new Date(user.createdAt).toLocaleDateString()}</td>
              <td className="portal-table-actions">
                {user.isLocked ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    disabled={unlockingId === user.id}
                    onClick={() => onUnlock(user)}
                  >
                    {unlockingId === user.id ? "Unlocking…" : "Unlock"}
                  </button>
                ) : null}
                {user.hasLogin ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    disabled={resettingId === user.id}
                    onClick={() => onReset(user)}
                  >
                    {resettingId === user.id ? "Resetting…" : "Reset password"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--secondary btn--small"
                    disabled={resettingId === user.id}
                    onClick={() => onReset(user)}
                  >
                    {resettingId === user.id ? "Setting up…" : "Set password"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { username, logout } = useAdminAuth();
  const [tab, setTab] = useState<AdminTab>("practices");
  const [practices, setPractices] = useState<AdminUser[]>([]);
  const [borrowers, setBorrowers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchAdminUsers();
      setPractices(data.practices);
      setBorrowers(data.borrowers);
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
    const action = user.hasLogin ? "Reset password for" : "Create a login for";
    if (
      !window.confirm(
        `${action} ${user.email}? They will receive a temporary password and must change it on next login.`,
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

  async function handleUnlock(user: AdminUser) {
    setUnlockingId(user.id);
    setError(null);
    try {
      await adminUnlockUser(user.type, user.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock account");
    } finally {
      setUnlockingId(null);
    }
  }

  const activeUsers = tab === "practices" ? practices : borrowers;

  return (
    <div className="portal">
      <div className="portal-inner portal-inner--wide">
        <header className="portal-header portal-header--row">
          <div>
            <Link to="/" className="portal-back">
              ← VetFin
            </Link>
            <h1 className="portal-title">Admin</h1>
            <p className="portal-lead">
              Signed in as <strong>{username}</strong>. Manage vet practices and
              borrower accounts.
            </p>
          </div>
          <button type="button" className="btn btn--secondary" onClick={logout}>
            Log out
          </button>
        </header>

        <AdminNav active="users" />

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
          <div className="apply-tabs" style={{ marginBottom: "1.25rem" }}>
            <button
              type="button"
              className={tab === "practices" ? "apply-tab--active" : ""}
              onClick={() => setTab("practices")}
            >
              Vet practices ({practices.length})
            </button>
            <button
              type="button"
              className={tab === "borrowers" ? "apply-tab--active" : ""}
              onClick={() => setTab("borrowers")}
            >
              Borrowers ({borrowers.length})
            </button>
          </div>

          {error ? <p className="portal-error">{error}</p> : null}

          {loading ? (
            <p>Loading…</p>
          ) : (
            <UserTable
              users={activeUsers}
              emptyMessage={
                tab === "practices"
                  ? "No vet practices yet."
                  : "No borrowers or applicants yet."
              }
              resettingId={resettingId}
              unlockingId={unlockingId}
              onReset={(user) => void handleReset(user)}
              onUnlock={(user) => void handleUnlock(user)}
              linkBorrowers={tab === "borrowers"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
