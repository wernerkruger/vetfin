import { BrowserRouter, Route, Routes } from "react-router-dom";
import ProtectedBorrowerRoute from "./components/ProtectedBorrowerRoute";
import ProtectedPracticeRoute from "./components/ProtectedPracticeRoute";
import { BorrowerAuthProvider } from "./context/BorrowerAuthContext";
import { PracticeAuthProvider } from "./context/PracticeAuthContext";
import ApplyPage from "./pages/ApplyPage";
import BorrowerApplyPage from "./pages/BorrowerApplyPage";
import BorrowerDashboardPage from "./pages/BorrowerDashboardPage";
import BorrowerLoginPage from "./pages/BorrowerLoginPage";
import LandingPage from "./pages/LandingPage";
import PlaidTestPage from "./pages/PlaidTestPage";
import PracticeDashboardPage from "./pages/PracticeDashboardPage";
import PracticeLoginPage from "./pages/PracticeLoginPage";
import PracticeSignupPage from "./pages/PracticeSignupPage";

export default function App() {
  return (
    <BrowserRouter>
      <PracticeAuthProvider>
        <BorrowerAuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/plaid-test" element={<PlaidTestPage />} />
            <Route path="/apply/:slug" element={<ApplyPage />} />
            <Route path="/borrower/login" element={<BorrowerLoginPage />} />
            <Route path="/practice/signup" element={<PracticeSignupPage />} />
            <Route path="/practice/login" element={<PracticeLoginPage />} />
            <Route element={<ProtectedPracticeRoute />}>
              <Route
                path="/practice/dashboard"
                element={<PracticeDashboardPage />}
              />
            </Route>
            <Route element={<ProtectedBorrowerRoute />}>
              <Route
                path="/borrower/dashboard"
                element={<BorrowerDashboardPage />}
              />
              <Route path="/borrower/apply" element={<BorrowerApplyPage />} />
            </Route>
          </Routes>
        </BorrowerAuthProvider>
      </PracticeAuthProvider>
    </BrowserRouter>
  );
}
