import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBorrowerAuth } from "../context/BorrowerAuthContext";
import { fetchBorrowerDashboard } from "../lib/api";
import "./PracticePortal.css";

export default function BorrowerApplyPage() {
  const navigate = useNavigate();
  const { borrower } = useBorrowerAuth();
  const [slug, setSlug] = useState("");
  const [recentSlugs, setRecentSlugs] = useState<
    Array<{ slug: string; practiceName: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchBorrowerDashboard()
      .then((data) => setRecentSlugs(data.practiceSlugs))
      .finally(() => setLoading(false));
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) return;
    navigate(`/apply/${encodeURIComponent(trimmed)}`);
  }

  if (!borrower) return null;

  return (
    <div className="portal">
      <div className="portal-inner">
        <header className="portal-header">
          <Link to="/borrower/dashboard" className="portal-back">
            ← My loans
          </Link>
          <h1 className="portal-title">New loan application</h1>
          <p className="portal-lead">
            Enter the referral code from your vet clinic. You can find it in the
            link they shared (the part after /apply/).
          </p>
        </header>

        <div className="portal-card">
          <form className="portal-form" onSubmit={handleSubmit}>
            <label className="portal-label">
              Clinic referral code
              <input
                name="slug"
                type="text"
                required
                placeholder="e.g. happy-paws-vet"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button type="submit" className="btn btn--primary">
              Continue to application
            </button>
          </form>

          {!loading && recentSlugs.length > 0 ? (
            <div style={{ marginTop: "1.5rem" }}>
              <p
                style={{
                  margin: "0 0 0.75rem",
                  fontSize: "0.9rem",
                  color: "var(--color-ink-muted)",
                }}
              >
                Or apply again through a clinic you&apos;ve used before:
              </p>
              <ul className="borrower-practice-list">
                {recentSlugs.map((p) => (
                  <li key={p.slug}>
                    <Link to={`/apply/${p.slug}`}>
                      {p.practiceName}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
