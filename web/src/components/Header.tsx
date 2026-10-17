import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import logoLockup from "../assets/logo-lockup.png";
import "./Header.css";

const navLinks = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#for-owners", label: "Pet owners" },
  { href: "#for-clinics", label: "Clinics" },
  { href: "mailto:hello@vetfin.com", label: "Contact" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const loginRef = useRef<HTMLDivElement>(null);

  // Close the login menu on outside click or Escape
  useEffect(() => {
    if (!loginOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setLoginOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLoginOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [loginOpen]);

  function closeAll() {
    setLoginOpen(false);
    setMenuOpen(false);
  }

  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="logo" aria-label="VetFin home">
          <img src={logoLockup} alt="VetFin" className="logo-img" />
        </Link>

        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className="sr-only">Menu</span>
          <span className="menu-bar" />
          <span className="menu-bar" />
          <span className="menu-bar" />
        </button>

        <nav
          id="site-nav"
          className={`nav ${menuOpen ? "nav--open" : ""}`}
          aria-label="Main"
        >
          <ul className="nav-list">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a href={link.href} onClick={() => setMenuOpen(false)}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="login-menu" ref={loginRef}>
            <button
              type="button"
              className="btn btn--secondary login-toggle"
              aria-haspopup="true"
              aria-expanded={loginOpen}
              aria-controls="login-options"
              onClick={() => setLoginOpen((o) => !o)}
            >
              LOG IN
              <span className="login-caret" aria-hidden="true">
                ▾
              </span>
            </button>

            {loginOpen ? (
              <div id="login-options" className="login-options">
                <Link
                  to="/borrower/login"
                  className="login-option"
                  onClick={closeAll}
                >
                  <span className="login-option-title">Client login</span>
                  <span className="login-option-desc">
                    Pet owners — view your loan and repayments
                  </span>
                </Link>
                <Link
                  to="/practice/login"
                  className="login-option"
                  onClick={closeAll}
                >
                  <span className="login-option-title">Vet clinic login</span>
                  <span className="login-option-desc">
                    Practices — referrals, QR code and applications
                  </span>
                </Link>
              </div>
            ) : null}
          </div>

          <Link to="/practice/signup" className="btn btn--primary nav-cta">
            SIGN UP MY VET PRACTICE
          </Link>
        </nav>
      </div>
    </header>
  );
}
