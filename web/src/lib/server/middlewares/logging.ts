import { Middleware } from "../types";

export type LoggingOptions = {
  logRequest?: boolean;
  logResponse?: boolean;
  logTiming?: boolean;
  excludePaths?: string[];
};

export function loggingMiddleware(options: LoggingOptions = {}) {
  const {
    logRequest = true,
    logResponse = true,
    logTiming = true,
    excludePaths = [],
  } = options;

  return (async (request, context) => {
    const url = new URL(request.url);
    if (excludePaths.some((path) => url.pathname.includes(path))) {
      return {};
    }

    const startTime = Date.now();

    if (logRequest) {
      console.log(`[${request.method}] ${url.pathname}`, {
        query: context.query,
        params: context.params,
      });
    }

    // Store timing info for response logging
    const timing = { startTime };

    if (logResponse || logTiming) {
      // We'll log the response in the handler wrapper
      return { _logging: timing };
    }

    return {};
  }) as Middleware;
}
