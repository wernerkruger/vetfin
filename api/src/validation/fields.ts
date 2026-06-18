import { z } from "zod";

function digitsOnly(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "");
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const emailField = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("Enter a valid email address");

export const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

export const phoneField = z.preprocess(
  digitsOnly,
  z
    .string()
    .length(10, "Enter a 10-digit US phone number (area code included)"),
);

export const zipField = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().replace(/\s/g, "") : value),
  z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a valid 5-digit ZIP code (or ZIP+4)"),
);

export const dateOfBirthField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth (YYYY-MM-DD)");

export const ssnLast4Field = z.preprocess(
  digitsOnly,
  z.string().length(4, "Enter exactly 4 digits for the last part of your SSN"),
);

export const nameField = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(80);

export const stateField = z
  .string()
  .trim()
  .length(2, "Select a 2-letter state code")
  .transform((s) => s.toUpperCase());

export { trimString };
