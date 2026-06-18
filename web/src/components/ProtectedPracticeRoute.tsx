import { Navigate, Outlet, useLocation } from "react-router-dom";
import { usePracticeAuth } from "../context/PracticeAuthContext";

export default function ProtectedPracticeRoute() {
  const { practice, loading } = usePracticeAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="portal portal--centered">
        <p className="portal-status">Loading…</p>
      </div>
    );
  }

  if (!practice) {
    return <Navigate to="/practice/login" replace />;
  }

  if (
    practice.mustChangePassword &&
    location.pathname !== "/practice/change-password"
  ) {
    return <Navigate to="/practice/change-password" replace />;
  }

  return <Outlet />;
}
