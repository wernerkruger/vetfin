import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import ProtectedBorrowerRoute from "./components/ProtectedBorrowerRoute";
import ProtectedPracticeRoute from "./components/ProtectedPracticeRoute";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { BorrowerAuthProvider } from "./context/BorrowerAuthContext";
import { PracticeAuthProvider } from "./context/PracticeAuthContext";
import AdminBiPage from "./pages/AdminBiPage";
import AdminBorrowerDetailPage from "./pages/AdminBorrowerDetailPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminDisbursementsPage from "./pages/AdminDisbursementsPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import ApplyPage from "./pages/ApplyPage";
import BorrowerApplyPage from "./pages/BorrowerApplyPage";
import BorrowerChangePasswordPage from "./pages/BorrowerChangePasswordPage";
import BorrowerDashboardPage from "./pages/BorrowerDashboardPage";
import BorrowerLoginPage from "./pages/BorrowerLoginPage";
import LandingPage from "./pages/LandingPage";
import PlaidTestPage from "./pages/PlaidTestPage";
import PracticeChangePasswordPage from "./pages/PracticeChangePasswordPage";
import PracticeDashboardPage from "./pages/PracticeDashboardPage";
import PracticeLoginPage from "./pages/PracticeLoginPage";
import PracticeSignupPage from "./pages/PracticeSignupPage";

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <PracticeAuthProvider>
          <BorrowerAuthProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/plaid-test" element={<PlaidTestPage />} />
              <Route path="/apply/:slug" element={<ApplyPage />} />
              <Route path="/borrower/login" element={<BorrowerLoginPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/practice/signup" element={<PracticeSignupPage />} />
              <Route path="/practice/login" element={<PracticeLoginPage />} />
              <Route element={<ProtectedAdminRoute />}>
                <Route path="/admin" element={<AdminDashboardPage />} />
                <Route
                  path="/admin/borrowers/:id"
                  element={<AdminBorrowerDetailPage />}
                />
                <Route
                  path="/admin/disbursements"
                  element={<AdminDisbursementsPage />}
                />
                <Route path="/admin/bi" element={<AdminBiPage />} />
              </Route>
              <Route element={<ProtectedPracticeRoute />}>
                <Route
                  path="/practice/dashboard"
                  element={<PracticeDashboardPage />}
                />
                <Route
                  path="/practice/change-password"
                  element={<PracticeChangePasswordPage />}
                />
              </Route>
              <Route element={<ProtectedBorrowerRoute />}>
                <Route
                  path="/borrower/dashboard"
                  element={<BorrowerDashboardPage />}
                />
                <Route path="/borrower/apply" element={<BorrowerApplyPage />} />
                <Route
                  path="/borrower/change-password"
                  element={<BorrowerChangePasswordPage />}
                />
              </Route>
            </Routes>
          </BorrowerAuthProvider>
        </PracticeAuthProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
