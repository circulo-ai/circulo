import { ApiError } from "../server/types";
import { getBaseUrl } from "../urls/utils";

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

    // Handle non-JSON responses (like 204 No Content)
    if (response.status === 204) {
      return undefined as T;
    }

    const data = await response.json();

    // Handle API errors (custom ApiError format)
    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.code || "UNKNOWN_ERROR",
        data.error || `Request failed with status ${response.status}`,
        data.details,
      );
    }

    // Handle envelope errors (success: false)
    if ("success" in data && !data.success) {
      throw new ApiError(
        response.status,
        data.code || "API_ERROR",
        data.error || "Request failed",
        data.details,
      );
    }

    // Return unwrapped data if envelope format
    return "data" in data ? data.data : data;
  } catch (error) {
    // Network errors
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new ApiError(0, "NETWORK_ERROR", "Network request failed");
    }

    // Re-throw ApiErrors
    if (error instanceof ApiError) {
      throw error;
    }

    // Unknown errors
    throw new ApiError(500, "UNKNOWN_ERROR", "An unexpected error occurred");
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
