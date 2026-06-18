import type { ZodError, ZodIssue } from "zod";

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  password: "Password",
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone number",
  dateOfBirth: "Date of birth",
  ssnLast4: "SSN (last 4 digits)",
  addressLine1: "Street address",
  addressLine2: "Apt / suite",
  city: "City",
  state: "State",
  zip: "ZIP code",
  referralSlug: "Referral code",
  name: "Practice name",
  loanAmount: "Loan amount",
  serviceType: "Service type",
  animalType: "Animal type",
  username: "Username",
};

function labelFor(path: (string | number)[]): string {
  const key = String(path[0] ?? "field");
  return FIELD_LABELS[key] ?? key;
}

function messageForIssue(issue: ZodIssue): string {
  const label = labelFor(issue.path);

  switch (issue.code) {
    case "too_small":
      if (issue.type === "string" && issue.minimum === 1) {
        return `${label} is required.`;
      }
      if (issue.path[0] === "password") {
        return "Password must be at least 8 characters.";
      }
      if (issue.path[0] === "phone") {
        return "Enter a 10-digit US phone number (area code included).";
      }
      return `${label} is too short.`;
    case "too_big":
      return `${label} is too long.`;
    case "invalid_string":
      if (issue.validation === "email") {
        return "Enter a valid email address.";
      }
      if (issue.path[0] === "dateOfBirth") {
        return "Enter your date of birth (YYYY-MM-DD).";
      }
      if (issue.path[0] === "ssnLast4") {
        return "Enter exactly 4 digits for the last part of your SSN.";
      }
      if (issue.path[0] === "zip") {
        return "Enter a valid 5-digit ZIP code (or ZIP+4).";
      }
      return `${label} is not valid.`;
    case "invalid_type":
      return `${label} is required.`;
    case "custom":
      return issue.message || `${label} is not valid.`;
    default:
      return issue.message || `${label} is not valid.`;
  }
}

export function formatZodError(err: ZodError): {
  error: string;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};

  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!fieldErrors[key]) {
      fieldErrors[key] = messageForIssue(issue);
    }
  }

  const messages = Object.values(fieldErrors);
  const error =
    messages.length === 1
      ? messages[0]!
      : `Please fix the following: ${messages.join(" ")}`;

  return { error, fieldErrors };
}
