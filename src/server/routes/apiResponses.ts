import type { Response } from "express";

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiError(
  code: string,
  message: string,
  details?: unknown
): ApiErrorBody {
  const body: ApiErrorBody = {
    ok: false,
    error: {
      code,
      message,
    },
  };

  if (details !== undefined) {
    body.error.details = details;
  }

  return body;
}

export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
): void {
  res.status(status).json(apiError(code, message, details));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
