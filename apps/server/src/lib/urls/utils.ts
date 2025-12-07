import { getEnv } from "@/lib/env";
import { isProd } from "@/lib/environment";

const DEFAULT_APP_URL = isProd
  ? "https://circulo-ai.com"
  : "http://localhost:3002";

function normalizeUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const protocol = isProd ? "https://" : "http://";
  return `${protocol}${url}`;
}

/**
 * Returns the public base URL of the application for links/CORS.
 * Prefers the frontend URL, then falls back to the backend URL, then a sensible default.
 */
export function getBaseUrl(): string {
  const appUrl = getEnv("BETTER_AUTH_URL");
  if (appUrl) {
    return normalizeUrl(appUrl);
  }
  return DEFAULT_APP_URL;
}

/**
 * Returns just the domain and port part of the application URL
 * @returns The domain with port if applicable (e.g., 'localhost:3000' or 'circulo-ai.com')
 */
export function getBaseDomain(): string {
  try {
    const url = new URL(getBaseUrl());
    return url.host; // host includes port if specified
  } catch (_e) {
    try {
      return new URL(DEFAULT_APP_URL).host;
    } catch {
      return isProd ? "circulo-ai.com" : "localhost:3000";
    }
  }
}

/**
 * Returns the domain for email addresses, stripping www subdomain for Resend compatibility
 * @returns The email domain (e.g., 'circulo-ai.com' instead of 'www.circulo-ai.com')
 */
export function getEmailDomain(): string {
  try {
    const baseDomain = getBaseDomain();
    return baseDomain.startsWith("www.") ? baseDomain.substring(4) : baseDomain;
  } catch (_e) {
    return isProd ? "circulo-ai.com" : "localhost:3000";
  }
}
