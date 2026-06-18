import type { ProspectClinic } from "./api";

const EXPORT_HEADERS = [
  "Status",
  "Category",
  "Name",
  "Address",
  "City",
  "State",
  "ST",
  "Phone",
  "Website",
  "Rating",
  "Source URL",
  "Email",
  "ID",
] as const;

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function clinicToRow(clinic: ProspectClinic): string[] {
  return [
    clinic.signedUp ? "Signed up" : "Prospect",
    clinic.category ?? "",
    clinic.name,
    clinic.address ?? "",
    clinic.city ?? "",
    clinic.state ?? "",
    clinic.stateShort ?? "",
    clinic.phone ?? "",
    clinic.website ?? "",
    clinic.rating != null ? String(clinic.rating) : "",
    clinic.sourceUrl ?? "",
    clinic.email ?? "",
    clinic.id,
  ];
}

export function prospectClinicsToCsv(clinics: ProspectClinic[]): string {
  const lines = [
    EXPORT_HEADERS.join(","),
    ...clinics.map((clinic) =>
      clinicToRow(clinic).map((cell) => csvEscape(cell)).join(","),
    ),
  ];
  return lines.join("\n");
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function prospectClinicsToHtml(clinics: ProspectClinic[]): string {
  const head = EXPORT_HEADERS.map((h) => `<th>${htmlEscape(h)}</th>`).join("");
  const body = clinics
    .map((clinic) => {
      const cells = clinicToRow(clinic)
        .map((cell) => `<td>${htmlEscape(cell)}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>VetFin prospect clinics export</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 1.5rem; }
    table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.55rem; text-align: left; vertical-align: top; }
    th { background: #f5f5f5; }
    tr:nth-child(even) td { background: #fafafa; }
  </style>
</head>
<body>
  <h1>Prospect clinics</h1>
  <p>${clinics.length.toLocaleString()} clinics</p>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
