import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import PracticeNameAutocomplete from "../components/PracticeNameAutocomplete";
import { usePracticeAuth } from "../context/PracticeAuthContext";
import type { ProspectClinic } from "../lib/api";
import "./PracticePortal.css";

export default function PracticeSignupPage() {
  const navigate = useNavigate();
  const { signup } = usePracticeAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [practiceName, setPracticeName] = useState("");
  const [selectedClinic, setSelectedClinic] = useState<ProspectClinic | null>(
    null,
  );
  const [clinicConfirmed, setClinicConfirmed] = useState(false);

  function prefillFromClinic(clinic: ProspectClinic) {
    const form = formRef.current;
    if (!form) return;

    const setField = (name: string, value: string | null | undefined) => {
      const input = form.elements.namedItem(name) as HTMLInputElement | null;
      if (input && value) input.value = value;
    };

    setField("addressLine1", clinic.address);
    setField("city", clinic.city);
    setField("state", clinic.stateShort);
    setField("phone", clinic.phone);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (selectedClinic && !clinicConfirmed) {
      setError("Please confirm whether the suggested clinic is your practice.");
      return;
    }

    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    try {
      await signup({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        contactName: String(form.get("contactName") ?? "") || undefined,
        phone: String(form.get("phone") ?? "") || undefined,
        addressLine1: String(form.get("addressLine1") ?? "") || undefined,
        city: String(form.get("city") ?? "") || undefined,
        state: String(form.get("state") ?? "") || undefined,
        zip: String(form.get("zip") ?? "") || undefined,
        prospectClinicId:
          clinicConfirmed && selectedClinic ? selectedClinic.id : undefined,
      });
      navigate("/practice/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      wide
      title="Partner with VetFin"
      lead="Create your practice account, get a referral link and QR code, and track every loan application from your clinic."
    >
      <form ref={formRef} className="portal-form" onSubmit={handleSubmit}>
            <label className="portal-label">
              Practice name
              <PracticeNameAutocomplete
                value={practiceName}
                onValueChange={setPracticeName}
                selectedClinic={selectedClinic}
                onSelectClinic={setSelectedClinic}
                confirmed={clinicConfirmed}
                onConfirm={setClinicConfirmed}
                onPrefill={prefillFromClinic}
              />
            </label>
            <label className="portal-label">
              Your name
              <input name="contactName" autoComplete="name" />
            </label>
            <label className="portal-label">
              Work email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </label>
            <label className="portal-label">
              Password (min. 8 characters)
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label className="portal-label">
              Phone
              <input name="phone" type="tel" autoComplete="tel" />
            </label>
            <label className="portal-label">
              Street address
              <input name="addressLine1" autoComplete="street-address" />
            </label>
            <div className="portal-row">
              <label className="portal-label">
                City
                <input name="city" autoComplete="address-level2" />
              </label>
              <label className="portal-label">
                State
                <input name="state" maxLength={2} autoComplete="address-level1" />
              </label>
            </div>
            <label className="portal-label">
              ZIP
              <input name="zip" autoComplete="postal-code" />
            </label>

            {error ? <p className="portal-error">{error}</p> : null}

            <button
              type="submit"
              className="btn btn--primary"
              disabled={submitting}
            >
              {submitting ? "Creating account…" : "Create practice account"}
            </button>
      </form>

      <p className="portal-footer-text">
        Already registered? <Link to="/practice/login">Log in to your portal</Link>
      </p>
    </AuthLayout>
  );
}
