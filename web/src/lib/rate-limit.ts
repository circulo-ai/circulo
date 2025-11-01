import { getRedisClient } from "@/lib/redis";

const fallbackCounters = new Map<string, { count: number; expiry: number }>();

export async function incrementCounter(key: string, windowSeconds: number): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    const pipeline = redis.multi();
    pipeline.incr(key);
    pipeline.ttl(key);
    const results = await pipeline.exec();
    // ioredis returns an array of [error, result] tuples; it may return null.
    if (!results) {
      const countVal = await redis.incr(key);
      const ttlVal = await redis.ttl(key);
      if (ttlVal === -1) {
        await redis.expire(key, windowSeconds);
      }
      return Number(countVal);
    }
    const incrRes = results[0];
    const ttlRes = results[1];
    const count = Number((Array.isArray(incrRes) ? incrRes[1] : 0) ?? 0);
    const ttl = Number((Array.isArray(ttlRes) ? ttlRes[1] : -1) ?? -1);
    if (ttl === -1) {
      await redis.expire(key, windowSeconds);
    }
    return count;
  }
  const now = Date.now();
  const existing = fallbackCounters.get(key);
  if (!existing || existing.expiry < now) {
    fallbackCounters.set(key, { count: 1, expiry: now + windowSeconds * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export async function enforceRateLimit(
  userId: string,
  metric: string,
  limitCount: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number; key: string }> {
  const key = `rate:${metric}:${userId}:${windowSeconds}`;
  const count = await incrementCounter(key, windowSeconds);
  return { allowed: count <= limitCount, count, key };
}