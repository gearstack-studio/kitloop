import type { ErrorRequestHandler } from "express";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const apiErrorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    });
    return;
  }

  if (error instanceof SyntaxError && "status" in error && error.status === 400) {
    response.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body must be valid JSON" },
    });
    return;
  }

  if (
    error instanceof Error &&
    "status" in error && error.status === 413 &&
    "type" in error && error.type === "entity.too.large"
  ) {
    response.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body must not exceed 16 KB" },
    });
    return;
  }

  response.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
};
