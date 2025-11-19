import { getRedisClient } from "./redis"; // Adjust path to your redis.ts

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
};

/**
 * checkRateLimit
 * @param identifier Unique key (e.g. IP address or User ID)
 * @param limit Max requests allowed
 * @param windowSeconds Time window in seconds
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = 10,
  windowSeconds: number = 60,
): Promise<RateLimitResult> {
  const redis = getRedisClient();

  // Fail open if Redis is down to not block legitimate traffic
  if (!redis) return { success: true, limit, remaining: limit, reset: 0 };

  const key = `ratelimit:${identifier}`;

  try {
    // Simple fixed window counter using generic Redis commands (works with ioredis)
    const multi = redis.multi();
    multi.incr(key);
    multi.ttl(key);

    const results = await multi.exec();
    // results: [[null, count], [null, ttl]]

    const count = results?.[0]?.[1] as number;
    let ttl = results?.[1]?.[1] as number;

    if (count === 1) {
      // First request, set expiry
      await redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    }

    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      reset: Date.now() + ttl * 1000,
    };
  } catch (error) {
    console.error("Rate limit error:", error);
    return { success: true, limit, remaining: limit, reset: 0 };
  }
}
