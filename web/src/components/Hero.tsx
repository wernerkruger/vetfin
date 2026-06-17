import { Link } from "react-router-dom";
import "./Hero.css";

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-content">
          <p className="hero-eyebrow">Veterinary bill financing</p>
          <h1 className="hero-title">
            Care for your pet now.
            <br />
            <span className="hero-title-accent">Pay on your terms.</span>
          </h1>
          <p className="hero-lead">
            VetFin helps pet owners cover unexpected vet costs at the clinic—when
            the estimate is in front of you and you need an answer in minutes,
            not days.
          </p>
          <div className="hero-actions">
            <Link to="/practice/signup" className="btn btn--primary">
              SIGN UP MY VET PRACTICE
            </Link>
          </div>
          <ul className="hero-stats" aria-label="Highlights">
            <li>
              <strong>Minutes</strong>
              <span>Apply at the practice</span>
            </li>
            <li>
              <strong>Clear</strong>
              <span>Rates &amp; terms upfront</span>
            </li>
            <li>
              <strong>Secure</strong>
              <span>Bank-level verification</span>
            </li>
          </ul>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-card hero-card--main">
            <div className="hero-card-header">
              <span className="hero-card-dot" />
              <span>Estimate approved</span>
            </div>
            <p className="hero-card-amount">$2,340</p>
            <p className="hero-card-label">Emergency surgery · Oakwood Animal Hospital</p>
            <div className="hero-card-progress">
              <div className="hero-card-progress-fill" />
            </div>
            <p className="hero-card-status">Application in review — about 3 min</p>
          </div>
          <div className="hero-card hero-card--float">
            <span className="hero-float-icon">✓</span>
            <div>
              <p className="hero-float-title">Payment sent to clinic</p>
              <p className="hero-float-sub">Funds available today</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
