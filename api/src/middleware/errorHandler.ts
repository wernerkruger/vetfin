import type { ErrorRequestHandler } from "express";
import { isAxiosError } from "axios";
import { ZodError } from "zod";
import { HttpError } from "../errors.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const status =
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number"
      ? (err as { status: number }).status
      : undefined;

  if (status !== undefined && status >= 400 && status < 600) {
    res.status(status).json({
      error: err instanceof Error ? err.message : "Request failed",
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      details: err.flatten(),
    });
    return;
  }

  if (isAxiosError(err) && err.response?.data) {
    const data = err.response.data as {
      error_message?: string;
      display_message?: string;
      error_type?: string;
      error_code?: string;
    };

    res.status(err.response.status ?? 502).json({
      error: data.display_message ?? data.error_message ?? "Plaid request failed",
      errorType: data.error_type,
      errorCode: data.error_code,
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
