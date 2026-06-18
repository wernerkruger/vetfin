import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useBorrowerAuth } from "../context/BorrowerAuthContext";

export default function ProtectedBorrowerRoute() {
  const { borrower, loading } = useBorrowerAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="portal" style={{ padding: "3rem", textAlign: "center" }}>
        Loading…
      </div>
    );
  }

  if (!borrower) {
    return <Navigate to="/borrower/login" replace />;
  }

  if (
    borrower.mustChangePassword &&
    location.pathname !== "/borrower/change-password"
  ) {
    return <Navigate to="/borrower/change-password" replace />;
  }

  return <Outlet />;
}
