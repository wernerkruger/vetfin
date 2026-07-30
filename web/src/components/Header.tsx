import { useState } from "react";
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
          <Link to="/borrower/login" className="nav-dev">
            My account
          </Link>
          <Link to="/practice/signup" className="nav-dev">
            For clinics
          </Link>
          <Link to="/practice/signup" className="btn btn--primary nav-cta">
            SIGN UP MY VET PRACTICE
          </Link>
        </nav>
      </div>
    </header>
  );
}
