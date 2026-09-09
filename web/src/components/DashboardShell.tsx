import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import logoLockupWhite from "../assets/logo-lockup-white.png";
import { ArrowLeftIcon, LogOutIcon } from "./icons";
import "./DashboardShell.css";

export type ShellNavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  /** Override automatic pathname matching, e.g. for detail routes nested under a section. */
  active?: boolean;
};

type DashboardShellProps = {
  /** Where the sidebar logo links to (usually the area's dashboard root). */
  homeTo: string;
  navItems: ShellNavItem[];
  userLabel?: string | null;
  onLogout: () => void;
  /** Optional org/practice name shown large above the page title. */
  orgName?: string | null;
  title: string;
  lead?: ReactNode;
  /** Optional "← Back" link shown above the title, e.g. detail pages. */
  backTo?: { to: string; label: string };
  headerActions?: ReactNode;
  children: ReactNode;
};

export default function DashboardShell({
  homeTo,
  navItems,
  userLabel,
  onLogout,
  orgName,
  title,
  lead,
  backTo,
  headerActions,
  children,
}: DashboardShellProps) {
  const location = useLocation();

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <Link to={homeTo} className="shell-logo" aria-label="VetFin home">
          <img src={logoLockupWhite} alt="VetFin" />
        </Link>

        <nav className="shell-nav" aria-label="Primary">
          {navItems.map((item) => {
            const active = item.active ?? location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`shell-nav__link${active ? " shell-nav__link--active" : ""}`}
              >
                <span className="shell-nav__icon">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="shell-sidebar__footer">
          <Link to="/" className="shell-marketing-link">
            ← Back to vetfin.com
          </Link>
          <div className="shell-user">
            <span className="shell-user__name">{userLabel ?? "Account"}</span>
            <button type="button" className="shell-logout" onClick={onLogout}>
              <LogOutIcon size={16} />
              Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topbar__text">
            {backTo ? (
              <Link to={backTo.to} className="shell-back">
                <ArrowLeftIcon size={14} />
                {backTo.label}
              </Link>
            ) : null}
            {orgName ? <p className="shell-org-name">{orgName}</p> : null}
            <h1 className="shell-title">{title}</h1>
            {lead ? <p className="shell-lead">{lead}</p> : null}
          </div>
          {headerActions ? (
            <div className="shell-topbar__actions">{headerActions}</div>
          ) : null}
        </header>

        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
}
