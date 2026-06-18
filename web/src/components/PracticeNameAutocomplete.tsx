import { useEffect, useRef, useState } from "react";
import {
  searchProspectClinics,
  type ProspectClinic,
} from "../lib/api";

type PracticeNameAutocompleteProps = {
  value: string;
  onValueChange: (value: string) => void;
  selectedClinic: ProspectClinic | null;
  onSelectClinic: (clinic: ProspectClinic | null) => void;
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
  onPrefill: (clinic: ProspectClinic) => void;
};

export default function PracticeNameAutocomplete({
  value,
  onValueChange,
  selectedClinic,
  onSelectClinic,
  confirmed,
  onConfirm,
  onPrefill,
}: PracticeNameAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<ProspectClinic[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (confirmed || value.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const handle = window.setTimeout(() => {
      setLoading(true);
      void searchProspectClinics(value)
        .then((result) => {
          setSuggestions(result.clinics);
          setOpen(result.clinics.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => window.clearTimeout(handle);
  }, [value, confirmed]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSelect(clinic: ProspectClinic) {
    onSelectClinic(clinic);
    onValueChange(clinic.name);
    onConfirm(false);
    setOpen(false);
  }

  function handleReject() {
    onSelectClinic(null);
    onConfirm(false);
    onValueChange("");
  }

  function handleConfirm() {
    if (!selectedClinic) return;
    onConfirm(true);
    onPrefill(selectedClinic);
  }

  return (
    <div className="clinic-autocomplete" ref={wrapRef}>
      <input
        name="name"
        required
        minLength={2}
        autoComplete="organization"
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          onSelectClinic(null);
          onConfirm(false);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
      />

      {loading ? <p className="clinic-autocomplete__hint">Searching clinics…</p> : null}

      {open && suggestions.length > 0 ? (
        <ul className="clinic-autocomplete__list" role="listbox">
          {suggestions.map((clinic) => (
            <li key={clinic.id}>
              <button
                type="button"
                className="clinic-autocomplete__option"
                onClick={() => handleSelect(clinic)}
              >
                <strong>{clinic.name}</strong>
                <span>
                  {[clinic.city, clinic.stateShort].filter(Boolean).join(", ")}
                  {clinic.phone ? ` · ${clinic.phone}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selectedClinic && !confirmed ? (
        <div className="clinic-confirm">
          <p className="clinic-confirm__title">Is this your practice?</p>
          <p className="clinic-confirm__name">{selectedClinic.name}</p>
          <p className="clinic-confirm__meta">
            {[
              selectedClinic.address,
              [selectedClinic.city, selectedClinic.stateShort]
                .filter(Boolean)
                .join(", "),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {selectedClinic.phone ? (
            <p className="clinic-confirm__meta">{selectedClinic.phone}</p>
          ) : null}
          <div className="clinic-confirm__actions">
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={handleConfirm}
            >
              Yes, that&apos;s us
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={handleReject}
            >
              No, search again
            </button>
          </div>
        </div>
      ) : null}

      {confirmed && selectedClinic ? (
        <p className="clinic-autocomplete__confirmed">
          Matched to <strong>{selectedClinic.name}</strong> from our clinic directory.
        </p>
      ) : null}
    </div>
  );
}
