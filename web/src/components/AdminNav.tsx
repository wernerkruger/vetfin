import { Link } from "react-router-dom";

type AdminNavProps = {
  active: "users" | "disbursements";
};

export default function AdminNav({ active }: AdminNavProps) {
  return (
    <nav className="admin-nav" aria-label="Admin sections">
      <Link
        to="/admin"
        className={`admin-nav__link${active === "users" ? " admin-nav__link--active" : ""}`}
      >
        Users
      </Link>
      <Link
        to="/admin/disbursements"
        className={`admin-nav__link${active === "disbursements" ? " admin-nav__link--active" : ""}`}
      >
        Disbursements
      </Link>
    </nav>
  );
}
