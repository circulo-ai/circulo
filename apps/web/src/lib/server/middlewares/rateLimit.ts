import { createLogger } from "@/lib/logs/console/logger";
import { getRedisClient } from "@/lib/redis";
import { RateLimitError } from "../errors";

export { RateLimitError };

const logger = createLogger("RateLimitMiddleware");

export type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
  keyPrefix?: string;
  keyGenerator?: (request: Request) => string;
  skipOnError?: boolean;
};

export type RateLimitContext = {
  rateLimit: { limit: number; remaining: number; reset: number };
};

const inMemoryRateLimit = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitMiddleware(options: RateLimitOptions) {
  const {
    limit,
    windowSeconds,
    keyPrefix = "rl:",
    keyGenerator = getClientIp,
    skipOnError = true,
  } = options;

  return async (request: Request): Promise<RateLimitContext> => {
    const key = `${keyPrefix}${keyGenerator(request)}`;
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    try {
      const redis = getRedisClient();
      if (redis) {
        const result = await redis.multi().incr(key).pttl(key).exec();
        if (!result) throw new Error("Redis transaction failed");

        const [[incrErr, count], [ttlErr, ttl]] = result as [
          [Error | null, number],
          [Error | null, number],
        ];
        if (incrErr || ttlErr) throw incrErr || ttlErr;
        if (count === 1 || ttl === -1) await redis.pexpire(key, windowMs);

        const remaining = Math.max(0, limit - count);
        const reset = ttl > 0 ? Math.ceil(ttl / 1000) : windowSeconds;
        if (count > limit) throw new RateLimitError(reset);

        return { rateLimit: { limit, remaining, reset } };
      }

      // In-memory fallback
      const entry = inMemoryRateLimit.get(key);
      if (!entry || entry.resetAt < now) {
        inMemoryRateLimit.set(key, { count: 1, resetAt: now + windowMs });
        return {
          rateLimit: { limit, remaining: limit - 1, reset: windowSeconds },
        };
      }

      entry.count++;
      const remaining = Math.max(0, limit - entry.count);
      const reset = Math.ceil((entry.resetAt - now) / 1000);
      if (entry.count > limit) throw new RateLimitError(reset);

      return { rateLimit: { limit, remaining, reset } };
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      logger.error("Rate limit error:", { error });
      if (skipOnError)
        return { rateLimit: { limit, remaining: limit, reset: windowSeconds } };
      throw error;
    }
  };
}
