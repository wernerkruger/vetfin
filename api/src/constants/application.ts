export const SERVICE_TYPES = [
  "surgery",
  "emergency_care",
  "wellness_exam",
  "dental",
  "diagnostics",
  "medication",
  "other",
] as const;

export const ANIMAL_TYPES = [
  "dog",
  "cat",
  "rabbit",
  "bird",
  "reptile",
  "horse",
  "other",
] as const;

export const APPLICATION_STATUSES = [
  "draft",
  "profile_complete",
  "loan_details",
  "bank_linked",
  "submitted",
  "approved",
  "active",
  "declined",
  "cancelled",
  "paid_off",
] as const;

export const IN_PROGRESS_STATUSES = [
  "draft",
  "profile_complete",
  "loan_details",
  "bank_linked",
] as const;

export const ACTIVE_LOAN_STATUSES = ["approved", "active", "paid_off"] as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: "In progress",
  profile_complete: "In progress",
  loan_details: "In progress",
  bank_linked: "In progress",
  submitted: "Pending approval",
  approved: "Approved",
  active: "Active",
  declined: "Declined",
  cancelled: "Cancelled",
  paid_off: "Paid off",
};

export type ServiceType = (typeof SERVICE_TYPES)[number];
export type AnimalType = (typeof ANIMAL_TYPES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export function loanTermsVisible(status: string): boolean {
  return (ACTIVE_LOAN_STATUSES as readonly string[]).includes(status);
}

/** NULL = awaiting clinic review; 1 = clinic confirmed; 0 = clinic rejected */
export type VetApprovedValue = 0 | 1 | null;

export function practiceStatusLabel(
  status: string,
  vetApproved: VetApprovedValue,
): string {
  if (status === "submitted") {
    if (vetApproved === 1) return "Vet approved";
    if (vetApproved === 0) return "Cancelled by clinic";
    return "Awaiting clinic review";
  }
  return STATUS_LABELS[status] ?? status;
}

export function borrowerStatusLabel(
  status: string,
  vetApproved: VetApprovedValue,
): string {
  if (status === "submitted") {
    if (vetApproved === 1) return "Clinic confirmed — pending approval";
    if (vetApproved === 0) return "Cancelled by clinic";
    return "Pending clinic review";
  }
  return STATUS_LABELS[status] ?? status;
}

export function needsVetReview(
  status: string,
  vetApproved: VetApprovedValue,
): boolean {
  return status === "submitted" && vetApproved === null;
}
