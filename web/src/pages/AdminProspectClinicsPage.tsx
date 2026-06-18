import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminNav from "../components/AdminNav";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  fetchAdminProspectClinics,
  fetchAdminProspectClinicsExport,
  type AdminProspectClinicFilters,
  type ProspectClinic,
} from "../lib/api";
import {
  copyTextToClipboard,
  downloadTextFile,
  prospectClinicsToCsv,
  prospectClinicsToHtml,
} from "../lib/prospectExport";
import "./PracticePortal.css";

const FILTER_COLUMNS: Array<{
  key: keyof AdminProspectClinicFilters;
  label: string;
}> = [
  { key: "category", label: "Category" },
  { key: "name", label: "Name" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "stateShort", label: "ST" },
  { key: "phone", label: "Phone" },
  { key: "website", label: "Website" },
  { key: "rating", label: "Rating" },
  { key: "sourceUrl", label: "Source URL" },
  { key: "email", label: "Email" },
];

const emptyFilters = (): AdminProspectClinicFilters => ({
  category: "",
  name: "",
  address: "",
  city: "",
  state: "",
  stateShort: "",
  phone: "",
  website: "",
  rating: "",
  sourceUrl: "",
  email: "",
  signedUp: "all",
  page: 1,
  limit: 50,
});

function SignedUpBadge({ clinic }: { clinic: ProspectClinic }) {
  if (!clinic.signedUp) {
    return <span className="portal-badge portal-badge--muted">Prospect</span>;
  }
  return <span className="portal-badge portal-badge--disbursement-disbursed">Signed up</span>;
}

export default function AdminProspectClinicsPage() {
  const { username, logout } = useAdminAuth();
  const [filters, setFilters] = useState<AdminProspectClinicFilters>(emptyFilters);
  const [clinics, setClinics] = useState<ProspectClinic[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const load = useCallback(async (activeFilters: AdminProspectClinicFilters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAdminProspectClinics(activeFilters);
      setClinics(result.clinics);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load clinics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void load(filters);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [filters, load]);

  function updateFilter(
    key: keyof AdminProspectClinicFilters,
    value: string | number,
  ) {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }

  function clearFilters() {
    setFilters(emptyFilters());
  }

  function goToPage(page: number) {
    setFilters((prev) => ({ ...prev, page }));
  }

  async function loadExportClinics(): Promise<ProspectClinic[]> {
    const { clinics: exported } = await fetchAdminProspectClinicsExport(filters);
    return exported;
  }

  async function handleExport(
    action: "copy-csv" | "download-csv" | "download-html",
  ) {
    setExporting(true);
    setExportMessage(null);
    setError(null);
    try {
      const exported = await loadExportClinics();
      if (exported.length === 0) {
        setExportMessage("No clinics match the current filters.");
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);

      if (action === "copy-csv") {
        const csv = prospectClinicsToCsv(exported);
        await copyTextToClipboard(csv);
        setExportMessage(
          `Copied ${exported.length.toLocaleString()} clinics to clipboard as CSV.`,
        );
        return;
      }

      if (action === "download-csv") {
        downloadTextFile(
          `vetfin-prospect-clinics-${stamp}.csv`,
          prospectClinicsToCsv(exported),
          "text/csv;charset=utf-8",
        );
        setExportMessage(
          `Downloaded ${exported.length.toLocaleString()} clinics as CSV.`,
        );
        return;
      }

      downloadTextFile(
        `vetfin-prospect-clinics-${stamp}.html`,
        prospectClinicsToHtml(exported),
        "text/html;charset=utf-8",
      );
      setExportMessage(
        `Downloaded ${exported.length.toLocaleString()} clinics as HTML.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="portal">
      <div className="portal-inner portal-inner--prospects">
        <header className="portal-header portal-header--row">
          <div>
            <Link to="/" className="portal-back">
              ← VetFin
            </Link>
            <h1 className="portal-title">Prospect clinics</h1>
            <p className="portal-lead">
              Signed in as <strong>{username}</strong>. Browse and filter the
              WowVets clinic directory. Clinics are marked signed up when they
              register on VetFin.
            </p>
          </div>
          <button type="button" className="btn btn--secondary" onClick={logout}>
            Log out
          </button>
        </header>

        <AdminNav active="clinics" />

        <div className="portal-card prospect-card">
          <div className="prospect-toolbar">
            <div className="prospect-toolbar__actions">
              <button
                type="button"
                className="btn btn--secondary btn--small"
                disabled={exporting || loading}
                onClick={() => void handleExport("copy-csv")}
              >
                {exporting ? "Exporting…" : "Copy CSV"}
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                disabled={exporting || loading}
                onClick={() => void handleExport("download-csv")}
              >
                Download CSV
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                disabled={exporting || loading}
                onClick={() => void handleExport("download-html")}
              >
                Download HTML
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </div>
            <p className="portal-muted prospect-toolbar__count">
              {loading
                ? "Loading…"
                : `${total.toLocaleString()} clinics match filters`}
            </p>
          </div>

          {exportMessage ? (
            <p className="portal-status">{exportMessage}</p>
          ) : null}

          {error ? <p className="portal-error">{error}</p> : null}

          <div className="portal-table-wrap prospect-table-wrap">
            <table className="portal-table prospect-table">
              <thead>
                <tr>
                  <th>Status</th>
                  {FILTER_COLUMNS.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
                <tr className="prospect-filter-row">
                  <th>
                    <select
                      className="prospect-filter-input"
                      value={filters.signedUp ?? "all"}
                      onChange={(e) =>
                        updateFilter(
                          "signedUp",
                          e.target.value as "yes" | "no" | "all",
                        )
                      }
                    >
                      <option value="all">All</option>
                      <option value="no">Prospect</option>
                      <option value="yes">Signed up</option>
                    </select>
                  </th>
                  {FILTER_COLUMNS.map((col) => (
                    <th key={col.key}>
                      <input
                        className="prospect-filter-input"
                        value={String(filters[col.key] ?? "")}
                        onChange={(e) => updateFilter(col.key, e.target.value)}
                        placeholder="Filter…"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clinics.map((clinic) => (
                  <tr key={clinic.id}>
                    <td>
                      <SignedUpBadge clinic={clinic} />
                    </td>
                    <td>{clinic.category ?? "—"}</td>
                    <td>{clinic.name}</td>
                    <td>{clinic.address ?? "—"}</td>
                    <td>{clinic.city ?? "—"}</td>
                    <td>{clinic.state ?? "—"}</td>
                    <td>{clinic.stateShort ?? "—"}</td>
                    <td>{clinic.phone ?? "—"}</td>
                    <td>
                      {clinic.website ? (
                        <a href={clinic.website} target="_blank" rel="noreferrer">
                          Website
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{clinic.rating ?? "—"}</td>
                    <td>
                      {clinic.sourceUrl ? (
                        <a href={clinic.sourceUrl} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{clinic.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && clinics.length === 0 ? (
            <p className="portal-muted">No clinics match your filters.</p>
          ) : null}

          <div className="prospect-pagination">
            <button
              type="button"
              className="btn btn--secondary btn--small"
              disabled={(filters.page ?? 1) <= 1 || loading}
              onClick={() => goToPage((filters.page ?? 1) - 1)}
            >
              Previous
            </button>
            <span className="portal-muted">
              Page {filters.page ?? 1} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              disabled={(filters.page ?? 1) >= totalPages || loading}
              onClick={() => goToPage((filters.page ?? 1) + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
