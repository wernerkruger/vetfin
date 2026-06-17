import { Link } from "react-router-dom";
import "./Audiences.css";

export default function Audiences() {
  return (
    <section className="section audiences">
      <div className="section-inner">
        <span className="section-label">Who we serve</span>
        <h2 className="section-title">Better outcomes for pets and practices</h2>

        <div className="audience-grid">
          <article id="for-owners" className="audience-card audience-card--owners">
            <div className="audience-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M24 8c-4 0-7 3-7 7 0 3 2 5 4 6-3 1-6 4-6 8 0 5 4 9 9 9s9-4 9-9c0-4-3-7-6-8 2-1 4-3 4-6 0-4-3-7-7-7z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="14" cy="32" r="4" stroke="currentColor" strokeWidth="2" />
                <circle cx="34" cy="32" r="4" stroke="currentColor" strokeWidth="2" />
                <path
                  d="M18 38h12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="audience-title">For pet owners</h3>
            <p className="audience-text">
              When savings or a card limit aren&apos;t enough, VetFin gives you a
              regulated path to yes—without delaying treatment or leaving your pet
              in pain.
            </p>
            <ul className="audience-list">
              <li>Fixed monthly payments you can plan for</li>
              <li>No surprise fees—we show terms before you sign</li>
              <li>Soft credit check options where available</li>
            </ul>
          </article>

          <article id="for-clinics" className="audience-card audience-card--clinics">
            <div className="audience-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect
                  x="8"
                  y="12"
                  width="32"
                  height="28"
                  rx="3"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M24 18v12M18 24h12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M16 8h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h3 className="audience-title">For veterinary clinics</h3>
            <p className="audience-text">
              Turn more estimates into completed care. VetFin integrates at checkout
              so your team stays focused on medicine, not collections.
            </p>
            <ul className="audience-list">
              <li>Get paid at treatment—not on a payment plan you manage</li>
              <li>Simple staff workflow: link, QR, or kiosk</li>
              <li>Revenue you might otherwise lose to sticker shock</li>
            </ul>
            <Link to="/practice/signup" className="audience-link">
              Sign up my vet practice →
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
