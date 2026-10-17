import type { ContactMethod, PaymentMethod } from "./api";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  ach: "ACH / bank transfer",
  card: "Card",
  check: "Check",
  cash: "Cash",
  wire: "Wire",
  other: "Other",
};

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  phone: "Phone call",
  email: "Email",
  sms: "Text message",
  in_person: "In person",
  other: "Other",
};

export const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  partial: "Partly paid",
  paid: "Paid",
  closed_early: "Paid off early",
  written_off: "Written off",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "fee.marked_paid": "Origination fee marked paid",
  "loan.approved": "Approved for funding",
  "loan.declined": "Declined",
  "loan.funded": "Funded (money sent to clinic)",
  "loan.cancelled": "Loan cancelled",
  "loan.written_off": "Loan written off",
  "loan.rescheduled": "Due date changed",
  "payment.recorded": "Payment recorded",
  "payment.payoff_recorded": "Payoff recorded",
  "payment.voided": "Payment voided",
  "note.added": "Note added",
};
