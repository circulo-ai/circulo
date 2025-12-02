import { getBaseUrl } from "../urls/utils";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string, // e.g., "BAD_REQUEST", "UNAUTHORIZED"
    message: string,
    public details?: unknown, // Captures the "errors" array from ValidationError
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function request<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${getBaseUrl()}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    // Handle 204 No Content (e.g., successful DELETE)
    if (response.status === 204) {
      return undefined as T;
    }

    // Check if response is JSON before parsing
    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      // BACKEND MAPPING:
      // Your backend returns { message: string, errors?: [] } for 400/500
      //

      const errorMessage = data?.message || response.statusText;
      const errorDetails = data?.errors || undefined; // Specifically for ValidationError

      throw new ApiRequestError(
        response.status,
        inferCodeFromStatus(response.status),
        errorMessage,
        errorDetails,
      );
    }

    // Your backend returns raw data (e.g., User object), not an envelope
    //
    return data as T;
  } catch (error) {
    // Handle Network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new ApiRequestError(0, "NETWORK_ERROR", "Network request failed");
    }

    // Re-throw our custom error
    if (error instanceof ApiRequestError) {
      throw error;
    }

    // Fallback
    throw new ApiRequestError(
      500,
      "UNKNOWN_ERROR",
      error instanceof Error ? error.message : "An unexpected error occurred",
    );
  }
}

/**
 * Helper: Our backend uses HTTP status codes for error types
 * (e.g., UnauthorizedError = 401, RateLimitError = 429).
 * We map these to string codes for easier client-side handling.
 *
 */
function inferCodeFromStatus(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 405:
      return "METHOD_NOT_ALLOWED";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMIT";
    case 500:
      return "INTERNAL_SERVER_ERROR";
    default:
      return "API_ERROR";
  }
}

export async function getRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  return request<T>(endpoint, { ...options, method: "GET" });
}

export async function postRequest<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestInit,
): Promise<T> {
  return request<T>(endpoint, {
    ...options,
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function putRequest<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestInit,
): Promise<T> {
  return request<T>(endpoint, {
    ...options,
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function patchRequest<T>(
  endpoint: string,
  body?: unknown,
  options?: RequestInit,
): Promise<T> {
  return request<T>(endpoint, {
    ...options,
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function deleteRequest<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  return request<T>(endpoint, { ...options, method: "DELETE" });
}
