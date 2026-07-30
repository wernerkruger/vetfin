import logoMarkWhite from "../assets/logo-mark-white.png";
import "./Footer.css";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <img src={logoMarkWhite} alt="" aria-hidden="true" className="footer-logo-img" />
          <span className="footer-tagline">
            Veterinary bill financing, at the point of care.
          </span>
        </div>

        <nav className="footer-nav" aria-label="Footer">
          <a href="#how-it-works">How it works</a>
          <a href="#for-owners">Pet owners</a>
          <a href="#for-clinics">Clinics</a>
          <a href="mailto:hello@vetfin.com">Contact</a>
        </nav>

        <p className="footer-legal">
          © {year} VetFin. All rights reserved. Lending products will be offered
          subject to credit approval and applicable state licenses. This site is
          for informational purposes; applications are not yet available.
        </p>
      </div>
    </footer>
  );
}
