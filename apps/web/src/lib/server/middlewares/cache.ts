import { Middleware } from "../types";

export type CacheOptions = {
  ttl?: number; // seconds
  type?: "public" | "private" | "no-cache" | "no-store";
  revalidate?: number;
  staleWhileRevalidate?: number;
};

export function cacheMiddleware(options: CacheOptions = {}) {
  return (async () => {
    const { ttl, type = "public", revalidate, staleWhileRevalidate } = options;

    const directives: string[] = [type];

    if (ttl) {
      directives.push(`max-age=${ttl}`);
    }

    if (revalidate) {
      directives.push(`s-maxage=${revalidate}`);
    }

    if (staleWhileRevalidate) {
      directives.push(`stale-while-revalidate=${staleWhileRevalidate}`);
    }

    return {
      _cacheControl: directives.join(", "),
    };
  }) as Middleware;
}
