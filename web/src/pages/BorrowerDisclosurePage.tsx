import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TruthInLendingDisclosure from "../components/TruthInLendingDisclosure";
import { fetchTilaDisclosure, type TilaDisclosure } from "../lib/api";
import "./PracticePortal.css";

/** Borrower's copy of their Truth in Lending disclosure — viewable and printable any time. */
export default function BorrowerDisclosurePage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const [disclosure, setDisclosure] = useState<TilaDisclosure | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    fetchTilaDisclosure(applicationId)
      .then((data) => setDisclosure(data.disclosure))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load disclosure"),
      );
  }, [applicationId]);

  return (
    <div className="portal">
      <div className="portal-inner portal-inner--wide">
        <header className="portal-header no-print">
          <Link to="/borrower/dashboard" className="portal-back">
            ← My loans
          </Link>
        </header>
        <div className="portal-card">
          {error ? (
            <p className="portal-error">{error}</p>
          ) : disclosure ? (
            <>
              <TruthInLendingDisclosure disclosure={disclosure} />
              <div className="no-print" style={{ marginTop: "1.5rem" }}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => window.print()}
                >
                  Print or save as PDF
                </button>
              </div>
            </>
          ) : (
            <p className="portal-status">Loading…</p>
          )}
        </div>
      </div>
    </div>
  );
}
