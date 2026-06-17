import { Navigate, Outlet } from "react-router-dom";
import { usePracticeAuth } from "../context/PracticeAuthContext";

export default function ProtectedPracticeRoute() {
  const { practice, loading } = usePracticeAuth();

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

  return <Outlet />;
}
