import type { PracticeReferral } from "../lib/api";
import type { PracticeSection } from "../components/PracticeNav";

const IN_PROGRESS = new Set([
  "draft",
  "profile_complete",
  "loan_details",
  "bank_linked",
  "started",
]);

const APPROVED = new Set(["approved", "active", "paid_off"]);

export type PracticeLoanFilter = Exclude<PracticeSection, "dashboard">;

export function filterPracticeReferrals(
  referrals: PracticeReferral[],
  section: PracticeLoanFilter,
): PracticeReferral[] {
  switch (section) {
    case "review":
      return referrals.filter((r) => r.needsVetReview);
    case "open":
      return referrals.filter(
        (r) =>
          IN_PROGRESS.has(r.applicationStatus) ||
          (r.applicationStatus === "submitted" && r.vetApproved === 1),
      );
    case "approved":
      return referrals.filter((r) => APPROVED.has(r.applicationStatus));
    case "declined":
      return referrals.filter(
        (r) =>
          r.applicationStatus === "declined" ||
          r.applicationStatus === "cancelled" ||
          (r.applicationStatus === "submitted" && r.vetApproved === 0),
      );
  }
}

export const PRACTICE_LOAN_COPY: Record<
  PracticeLoanFilter,
  { title: string; lead: string; empty: string }
> = {
  review: {
    title: "Needs review",
    lead: "Confirm each submitted application is from your clinic before VetFin can approve funding.",
    empty: "No applications waiting for your review.",
  },
  open: {
    title: "Open loans",
    lead: "Applications still in progress with the pet owner, or confirmed by you and awaiting VetFin funding.",
    empty: "No open applications right now.",
  },
  approved: {
    title: "Approved loans",
    lead: "Applications approved for funding through your clinic.",
    empty: "No approved loans yet.",
  },
  declined: {
    title: "Declined",
    lead: "Applications declined by VetFin or cancelled by your clinic.",
    empty: "No declined or cancelled applications.",
  },
};
