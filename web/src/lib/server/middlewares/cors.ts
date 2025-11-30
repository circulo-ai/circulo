import { Middleware } from "../types";

export type CorsOptions = {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
};

export function corsMiddleware(options: CorsOptions = {}) {
  return (async (request) => {
    const origin = request.headers.get("origin");
    const headers = new Headers();

    // Handle origin
    if (options.origin) {
      if (typeof options.origin === "string") {
        headers.set("Access-Control-Allow-Origin", options.origin);
      } else if (Array.isArray(options.origin)) {
        if (origin && options.origin.includes(origin)) {
          headers.set("Access-Control-Allow-Origin", origin);
        }
      } else if (typeof options.origin === "function") {
        if (origin && options.origin(origin)) {
          headers.set("Access-Control-Allow-Origin", origin);
        }
      }
    } else {
      headers.set("Access-Control-Allow-Origin", "*");
    }

    // Handle methods
    if (options.methods) {
      headers.set("Access-Control-Allow-Methods", options.methods.join(", "));
    }

    // Handle headers
    if (options.allowedHeaders) {
      headers.set(
        "Access-Control-Allow-Headers",
        options.allowedHeaders.join(", ")
      );
    }

    if (options.exposedHeaders) {
      headers.set(
        "Access-Control-Expose-Headers",
        options.exposedHeaders.join(", ")
      );
    }

    // Handle credentials
    if (options.credentials) {
      headers.set("Access-Control-Allow-Credentials", "true");
    }

    // Handle max age
    if (options.maxAge) {
      headers.set("Access-Control-Max-Age", String(options.maxAge));
    }

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    return { _corsHeaders: headers };
  }) as Middleware;
}
