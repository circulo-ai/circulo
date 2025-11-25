import { toast } from "@/components/toast";
import { mutate as globalMutate, mutate, SWRConfiguration } from "swr";
import { ApiRequestError, getRequest } from "./api/client";
import { ChatSDKError, ErrorCode } from "./errors";
import { toQueryString } from "./utils";

export const fetcher = async <T>(
  url: [string, Record<string, unknown>] | string,
): Promise<T> => {
  if (typeof url === "string") return getRequest<T>(url);
  const [path, queryParams] = url;
  return getRequest<T>(path + toQueryString(queryParams));
};

export const swrConfig: SWRConfiguration = {
  fetcher,
  shouldRetryOnError: (error) => {
    // Don't retry on client errors (4xx)
    if (error instanceof ApiRequestError) {
      if (error.status >= 400 && error.status < 500) {
        return false;
      }
    }
    return true;
  },
  errorRetryCount: 3,
  onError: (error, key) => {
    if (shouldIgnoreKey(key)) return;

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
    if (shouldIgnoreKey(key)) return;
  },

  onLoadingSlow: (key) => {
    if (shouldIgnoreKey(key)) return;

    console.warn("SWR: Slow request", {
      key,
      timestamp: new Date().toISOString(),
    });
  },
  loadingTimeout: 5000,
};

function shouldIgnoreKey(key: any): boolean {
  if (typeof key !== "string") return true;

  const internalPatterns = [
    ":should-",
    "artifact",
    "artifact-metadata-init",
    "-visibility",
    ":state:",
    ":local:",
  ];

  if (internalPatterns.some((pattern) => key.includes(pattern))) {
    return true;
  }

  return !key.startsWith("/") && !key.startsWith("http");
}

function getErrorMessage(error: unknown): string {
  // Handle our custom Client Error from api/client.ts
  if (error instanceof ApiRequestError) {
    // If validation errors exist, showing the first one is often helpful
    if (Array.isArray(error.details) && error.details.length > 0) {
      return error.details[0].message;
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred";
}

export async function fetchWithErrorHandlers(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const response = await fetch(input, init);

    if (!response.ok) {
      // Updated to match standard backend error shape if possible,
      // otherwise keep generic handling
      let code = "UNKNOWN_ERROR";
      let cause = undefined;

      try {
        const data = await response.json();
        code = data.message || response.statusText;
        cause = data.errors;
      } catch (e) {
        // response was not JSON
      }

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

export async function batchMutate(keys: string[]) {
  await Promise.all(keys.map((key) => mutate(key)));
}

export { globalMutate };
