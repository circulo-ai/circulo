import { toast } from "@/components/toast";
import { mutate as globalMutate, mutate, SWRConfiguration } from "swr";
import {
  ApiRequestError,
  deleteRequest,
  getRequest,
  patchRequest,
  postRequest,
  putRequest,
} from "./api/client";
import { toQueryString } from "./utils";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type FetcherOptions = RequestInit & { raw?: boolean };

export const getFetcher = (
  method: Method = "GET",
  options?: FetcherOptions,
) => {
  const requests = {
    GET: { fn: getRequest, hasBody: false as const },
    POST: { fn: postRequest, hasBody: true as const },
    PUT: { fn: putRequest, hasBody: true as const },
    PATCH: { fn: patchRequest, hasBody: true as const },
    DELETE: { fn: deleteRequest, hasBody: false as const },
  };

  const { fn, hasBody } = requests[method];
  const { raw, ...init } = options ?? {};

  return async <T>(
    url: [string, Record<string, unknown>] | string,
    body?: { arg?: unknown },
  ): Promise<T> => {
    const normalUrl = normalizeUrl(url);
    if (raw) {
      if (hasBody) return fn<T>(normalUrl, body?.arg ?? init.body, init);
      return fn<T>(normalUrl, init);
    }
    if (hasBody) return fn<T>(normalUrl, body?.arg, init);
    return fn<T>(normalUrl, init);
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
      let message = response.statusText;
      let details: unknown;
      const code = "API_ERROR";
      try {
        const data = await response.json();
        message = data?.message || message;
        details = data?.errors;
      } catch {
        // non-JSON response, keep defaults
      }
      throw new ApiRequestError(response.status, code, message, details);
    }

    return response;
  } catch (error: unknown) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new ApiRequestError(0, "NETWORK_ERROR", "Network request failed");
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
