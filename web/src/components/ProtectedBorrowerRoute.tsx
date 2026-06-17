import { Navigate, Outlet } from "react-router-dom";
import { useBorrowerAuth } from "../context/BorrowerAuthContext";

export default function ProtectedBorrowerRoute() {
  const { borrower, loading } = useBorrowerAuth();

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

  return <Outlet />;
}
