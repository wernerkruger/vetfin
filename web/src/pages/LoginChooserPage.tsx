import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import "./PracticePortal.css";

export default function LoginChooserPage() {
  return (
    <AuthLayout title="Log in" lead="Choose the account you want to log in to.">
      <div className="portal-form">
        <Link to="/borrower/login" className="btn btn--primary">
          CLIENT LOGIN
        </Link>
        <Link to="/practice/login" className="btn btn--primary">
          VET CLINIC LOGIN
        </Link>
      </div>

      <p className="portal-footer-text">
        New vet practice?{" "}
        <Link to="/practice/signup">Create a practice account</Link>
      </p>
    </AuthLayout>
  );
}
