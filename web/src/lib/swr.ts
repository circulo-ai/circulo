import { toast } from "@/components/toast";
import { mutate as globalMutate, mutate, SWRConfiguration } from "swr";
import {
  deleteRequest,
  getRequest,
  patchRequest,
  postRequest,
  putRequest,
} from "./api/client";
import { ChatSDKError, ErrorCode } from "./errors";
import { ApiError } from "./server/types";
import { toQueryString } from "./utils";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const getFetcher = (method: Method = "GET", options?: RequestInit) => {
  const requests = {
    GET: { fn: getRequest, hasBody: false as const },
    POST: { fn: postRequest, hasBody: true as const },
    PUT: { fn: putRequest, hasBody: true as const },
    PATCH: { fn: patchRequest, hasBody: true as const },
    DELETE: { fn: deleteRequest, hasBody: false as const },
  };

  const { fn, hasBody } = requests[method];

  return async <T>(
    url: [string, Record<string, unknown>] | string,
    body?: { arg?: unknown },
  ): Promise<T> => {
    const normalUrl = normalizeUrl(url);
    if (hasBody) return fn<T>(normalUrl, body?.arg, options);
    return fn<T>(normalUrl, options);
  };

  function normalizeUrl(url: [string, Record<string, unknown>] | string) {
    if (typeof url === "string") return url;
    const [path, queryParams] = url;
    return path + toQueryString(queryParams);
  }
};

export const swrConfig: SWRConfiguration = {
  // TODO add caching securely
  // provider() {
  //   if (typeof window === "undefined") {
  //     return new Map([]) as Map<string, State<any, any>>;
  //   }

  //   // When initializing, we restore the data from `localStorage` into a map.
  //   const map = new Map(JSON.parse(localStorage.getItem("app-cache") || "[]"));

  //   // Before unloading the app, we write back all the data into `localStorage`.
  //   window.addEventListener("beforeunload", () => {
  //     const appCache = JSON.stringify(Array.from(map.entries()));
  //     localStorage.setItem("app-cache", appCache);
  //   });

  //   // We still use the map for write & read for performance.
  //   return map as Cache<any>;
  // },
  fetcher: getFetcher(),
  shouldRetryOnError: (error) => {
    // Don't retry on client errors (4xx)
    if (error instanceof ApiError) {
      if (error.statusCode >= 400 && error.statusCode < 500) {
        return false;
      }

      if (error.isClientError()) {
        return false;
      }
    }

    return true;
  },
  errorRetryCount: 3,
  onError: (error, key) => {
    // Skip internal/non-API keys
    if (shouldIgnoreKey(key)) {
      return;
    }

    console.error("SWR Error:", {
      key,
      error,
      timestamp: new Date().toISOString(),
    });

    // Show user-friendly error toast
    toast({
      type: "error",
      description: getErrorMessage(error),
    });
  },

  onSuccess: (data, key) => {
    // Skip internal keys
    if (shouldIgnoreKey(key)) {
      return;
    }

    // Handle envelope format with explicit messages
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as any).message;
      const success = (data as any).success !== false;

      if (message) {
        toast({
          type: success ? "success" : "error",
          description: message,
        });
      }
    }

    // Handle envelope errors (success: false)
    if (data && typeof data === "object" && "success" in data) {
      const success = (data as any).success;
      const error = (data as any).error;

      if (success === false && error) {
        console.error("SWR Response Error:", { key, error });

        // Don't show toast here if already shown via message
        if (!(data as any).message) {
          toast({
            type: "error",
            description: error,
          });
        }
      }
    }
  },

  // Optional: Global loading handler
  onLoadingSlow: (key) => {
    if (shouldIgnoreKey(key)) {
      return;
    }

    console.warn("SWR: Slow request", {
      key,
      timestamp: new Date().toISOString(),
    });
  },
  loadingTimeout: 5000,
};

function shouldIgnoreKey(key: any): boolean {
  if (typeof key !== "string") return true;

  // Internal state keys that should be ignored
  const internalPatterns = [
    ":should-",
    "artifact",
    "artifact-metadata-init",
    "-visibility",
    ":state:",
    ":local:",
  ];

  // Check if key matches any internal pattern
  if (internalPatterns.some((pattern) => key.includes(pattern))) {
    return true;
  }

  // Only process API endpoints (start with / or http)
  return !key.startsWith("/") && !key.startsWith("http");
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error
      ? error.message
      : "An unexpected error occurred";
  }

  // Map error codes to user-friendly messages
  const errorMessages: Record<string, string> = {
    UNAUTHORIZED: "You need to be logged in to perform this action",
    FORBIDDEN: "You don't have permission to perform this action",
    NOT_FOUND: "The requested resource was not found",
    VALIDATION_ERROR: "Please check your input and try again",
    TOO_MANY_REQUESTS: "Too many requests. Please try again later",
    NETWORK_ERROR: "Network error. Please check your connection",
    CONFLICT: "This action conflicts with existing data",
    BAD_REQUEST: "Invalid request. Please check your input",
  };

  return errorMessages[error.code] || error.message || "An error occurred";
}

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      const { code, cause } = await response.json();
      throw new ChatSDKError(code as ErrorCode, cause);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new ChatSDKError("offline:chat");
    }

    throw error;
  }
}

// Prefetch multiple resources
export async function prefetchAll(
  resources: Array<{ key: any; fetcher: () => Promise<any> }>,
) {
  await Promise.all(
    resources.map(({ key, fetcher }) =>
      mutate(key, fetcher(), { revalidate: false }),
    ),
  );
}

export async function clearCachePattern(pattern: RegExp) {
  await mutate(
    (key) => typeof key === "string" && pattern.test(key),
    undefined,
    { revalidate: false },
  );
}

// Batch mutations
export async function batchMutate(keys: string[]) {
  await Promise.all(keys.map((key) => mutate(key)));
}

// convenient re-exports
export { globalMutate };
