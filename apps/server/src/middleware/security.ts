import type { AppEnv } from "@/lib/create-app";
import { createMiddleware } from "hono/factory";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type SecurityOptions = {
  allowedOrigins: readonly string[];
};

/**
 * Add headers that are safe for the API and the browser-facing server.
 * CSP remains an edge/web-app concern because the API does not render HTML.
 */
export const securityHeaders = createMiddleware<AppEnv>(async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  await next();
});

/**
 * Cookie-authenticated mutations must originate from the Circulo origin.
 * API-key clients and signed webhook ingress do not use browser cookies and
 * intentionally remain compatible with server-to-server callers.
 */
export function enforceCookieMutationOrigin({
  allowedOrigins,
}: SecurityOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (
      SAFE_METHODS.has(c.req.method) ||
      !isCookieAuthenticatedRequest(c.req.raw.headers) ||
      isOriginCheckExempt(c.req.path)
    ) {
      await next();
      return;
    }

    const origin = c.req.header("Origin");
    const referer = c.req.header("Referer");
    if (!isAllowedRequestOrigin(origin, referer, allowedOrigins)) {
      return c.json(
        { error: "Cross-origin state-changing requests are not allowed" },
        403,
      );
    }

    await next();
  });
}

export function isAllowedRequestOrigin(
  origin: string | undefined,
  referer: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  const candidate = origin?.trim() || getOriginFromReferer(referer);
  if (!candidate || candidate === "null") return false;

  return allowedOrigins.some((allowedOrigin) => {
    try {
      return new URL(candidate).origin === new URL(allowedOrigin).origin;
    } catch {
      return false;
    }
  });
}

function isCookieAuthenticatedRequest(headers: Headers): boolean {
  if (!headers.get("Cookie")?.trim()) return false;
  return !headers.get("Authorization") && !headers.get("X-API-Key");
}

function isOriginCheckExempt(path: string): boolean {
  if (path === "/api/auth" || path.startsWith("/api/auth/")) return true;
  return /^\/api\/automation\/webhooks\/[^/]+\/events$/.test(path);
}

function getOriginFromReferer(referer: string | undefined): string | undefined {
  if (!referer?.trim()) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
