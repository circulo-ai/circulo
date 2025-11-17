export interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    Error.captureStackTrace?.(this, ApiError);
  }

  toJSON(): ErrorResponse {
    return {
      error: this.message,
      code: this.code,
      details: this.details,
    };
  }

  getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.code === "TOO_MANY_REQUESTS" && this.details) {
      const details = this.details as { retryAfter?: number };
      if (details.retryAfter) {
        headers["Retry-After"] = details.retryAfter.toString();
      }
    }

    return headers;
  }

  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  isServerError(): boolean {
    return this.statusCode >= 500;
  }

  static from(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    if (error instanceof Error) {
      return new ApiError(500, "INTERNAL_ERROR", error.message);
    }

    return new ApiError(
      500,
      "UNKNOWN_ERROR",
      typeof error === "string" ? error : "An unknown error occurred",
    );
  }
}
