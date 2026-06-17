export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export const SERVICE_TYPE_OPTIONS = [
  { value: "surgery", label: "Surgery" },
  { value: "emergency_care", label: "Emergency care" },
  { value: "wellness_exam", label: "Wellness exam / checkup" },
  { value: "dental", label: "Dental" },
  { value: "diagnostics", label: "Diagnostics / imaging" },
  { value: "medication", label: "Medication / treatment" },
  { value: "other", label: "Other" },
] as const;

export const ANIMAL_TYPE_OPTIONS = [
  { value: "dog", label: "Dog" },
  { value: "cat", label: "Cat" },
  { value: "rabbit", label: "Rabbit" },
  { value: "bird", label: "Bird" },
  { value: "reptile", label: "Reptile" },
  { value: "horse", label: "Horse" },
  { value: "other", label: "Other" },
] as const;
