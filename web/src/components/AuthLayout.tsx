import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import logoLockup from "../assets/logo-lockup.png";
import "./AuthLayout.css";

type AuthLayoutProps = {
  title: string;
  lead?: ReactNode;
  wide?: boolean;
  children: ReactNode;
};

export default function AuthLayout({ title, lead, wide, children }: AuthLayoutProps) {
  return (
    <div className="auth">
      <div className={`auth-inner${wide ? " auth-inner--wide" : ""}`}>
        <Link to="/" className="auth-logo" aria-label="VetFin home">
          <img src={logoLockup} alt="VetFin" />
        </Link>
        <h1 className="auth-title">{title}</h1>
        {lead ? <p className="auth-lead">{lead}</p> : null}
        <div className="portal-card auth-card">{children}</div>
      </div>
    </div>
  );
}
