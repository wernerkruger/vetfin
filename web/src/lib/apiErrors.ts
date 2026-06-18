export class ApiError extends Error {
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = fieldErrors;
  }
}

export function parseApiErrorPayload(data: unknown, status: number): ApiError {
  if (!data || typeof data !== "object") {
    return new ApiError(`Request failed (${status})`);
  }

  const body = data as {
    error?: unknown;
    fieldErrors?: unknown;
    details?: { fieldErrors?: Record<string, string[]> };
  };

  const fieldErrors: Record<string, string> = {};

  if (body.fieldErrors && typeof body.fieldErrors === "object") {
    for (const [key, value] of Object.entries(body.fieldErrors)) {
      if (typeof value === "string") {
        fieldErrors[key] = value;
      }
    }
  } else if (body.details?.fieldErrors) {
    for (const [key, messages] of Object.entries(body.details.fieldErrors)) {
      if (messages?.[0]) {
        fieldErrors[key] = messages[0];
      }
    }
  }

  const message =
    typeof body.error === "string" && body.error !== "Validation failed"
      ? body.error
      : Object.values(fieldErrors)[0] ??
        (typeof body.error === "string" ? body.error : `Request failed (${status})`);

  return new ApiError(message, fieldErrors);
}
