/** $1,234.56 */
export function formatUsdCents(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

/** 23.96% */
export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(2)}%`;
}

/** "November 2, 2026" from YYYY-MM-DD (treated as a calendar date, no timezone shift). */
export function formatCalendarDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Nov 2026" from YYYY-MM-DD */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Local date+time for timestamps like "2026-10-03 12:35:16" (UTC) or ISO strings. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
