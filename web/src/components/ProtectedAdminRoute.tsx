import { Navigate, Outlet } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";

export default function ProtectedAdminRoute() {
  const { username, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="portal" style={{ padding: "3rem", textAlign: "center" }}>
        Loading…
      </div>
    );
  }

  if (!username) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
