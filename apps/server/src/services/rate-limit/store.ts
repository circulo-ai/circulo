import type { DbInstance } from "@/db";
import { userRateLimits } from "@/db/schema";
import { createLogger } from "@/lib/logs/console/logger";
import type { CirculoRedis } from "@circulo-ai/redis";
import { eq, sql } from "drizzle-orm";
import type { RateLimitBucket, RateLimitState } from "./types";

const logger = createLogger("RateLimitStore");

export interface RateLimitStore {
  increment(
    key: string,
    bucket: RateLimitBucket,
    windowMs: number,
  ): Promise<RateLimitState>;
  reset(key: string): Promise<void>;
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly redis: CirculoRedis,
    private readonly prefix = "rate",
  ) {}

  private namespaced(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async increment(
    key: string,
    _bucket: RateLimitBucket,
    windowMs: number,
  ): Promise<RateLimitState> {
    const namespacedKey = this.namespaced(key);
    const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));

    const count = await this.redis.incrBy(namespacedKey, 1);
    if (count === 1) {
      await this.redis.expire(namespacedKey, ttlSeconds);
    } else {
      const ttl = await this.redis.ttl(namespacedKey);
      if (ttl < 0) {
        await this.redis.expire(namespacedKey, ttlSeconds);
      }
    }

    const remainingTtl = await this.redis.ttl(namespacedKey);
    const resetAt = new Date(
      Date.now() + (remainingTtl > 0 ? remainingTtl * 1000 : windowMs),
    );

    return { count, resetAt };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(this.namespaced(key));
  }
}

type UserRateLimitRow = typeof userRateLimits.$inferSelect;
type CounterSnapshot = Pick<
  UserRateLimitRow,
  "syncApiRequests" | "asyncApiRequests" | "apiEndpointRequests"
> & { windowStart?: Date };

function getCountFromRecord(
  record: CounterSnapshot,
  bucket: RateLimitBucket,
): number {
  switch (bucket) {
    case "api":
      return record.apiEndpointRequests;
    case "async":
      return record.asyncApiRequests;
    case "sync":
      return record.syncApiRequests;
  }
}

function getInitialCounts(bucket: RateLimitBucket) {
  return {
    syncApiRequests: bucket === "sync" ? 1 : 0,
    asyncApiRequests: bucket === "async" ? 1 : 0,
    apiEndpointRequests: bucket === "api" ? 1 : 0,
  };
}

export class DatabaseRateLimitStore implements RateLimitStore {
  constructor(private readonly db: DbInstance) {}

  async increment(
    key: string,
    bucket: RateLimitBucket,
    windowMs: number,
  ): Promise<RateLimitState> {
    const now = new Date();
    const windowStartBoundary = new Date(now.getTime() - windowMs);
    const initialCounts = getInitialCounts(bucket);

    const [existing] = await this.db
      .select()
      .from(userRateLimits)
      .where(eq(userRateLimits.referenceId, key))
      .limit(1);

    if (!existing || new Date(existing.windowStart) < windowStartBoundary) {
      const [record] = await this.db
        .insert(userRateLimits)
        .values({
          referenceId: key,
          ...initialCounts,
          windowStart: now,
          lastRequestAt: now,
          isRateLimited: false,
          rateLimitResetAt: null,
        })
        .onConflictDoUpdate({
          target: userRateLimits.referenceId,
          set: {
            syncApiRequests: sql`CASE WHEN ${userRateLimits.windowStart} < ${windowStartBoundary.toISOString()} THEN ${initialCounts.syncApiRequests} ELSE ${userRateLimits.syncApiRequests} + ${initialCounts.syncApiRequests} END`,
            asyncApiRequests: sql`CASE WHEN ${userRateLimits.windowStart} < ${windowStartBoundary.toISOString()} THEN ${initialCounts.asyncApiRequests} ELSE ${userRateLimits.asyncApiRequests} + ${initialCounts.asyncApiRequests} END`,
            apiEndpointRequests: sql`CASE WHEN ${userRateLimits.windowStart} < ${windowStartBoundary.toISOString()} THEN ${initialCounts.apiEndpointRequests} ELSE ${userRateLimits.apiEndpointRequests} + ${initialCounts.apiEndpointRequests} END`,
            windowStart: sql`CASE WHEN ${userRateLimits.windowStart} < ${windowStartBoundary.toISOString()} THEN ${now.toISOString()} ELSE ${userRateLimits.windowStart} END`,
            lastRequestAt: now,
            isRateLimited: false,
            rateLimitResetAt: null,
          },
        })
        .returning({
          syncApiRequests: userRateLimits.syncApiRequests,
          asyncApiRequests: userRateLimits.asyncApiRequests,
          apiEndpointRequests: userRateLimits.apiEndpointRequests,
          windowStart: userRateLimits.windowStart,
        });

      if (!record) {
        const resetAt = new Date(now.getTime() + windowMs);
        return { count: 1, resetAt };
      }

      const count = getCountFromRecord(record, bucket);
      const resetAt = new Date(
        new Date(record.windowStart).getTime() + windowMs,
      );
      return { count, resetAt };
    }

    const updateSet =
      bucket === "api"
        ? {
            apiEndpointRequests: sql`${userRateLimits.apiEndpointRequests} + 1`,
          }
        : bucket === "async"
          ? { asyncApiRequests: sql`${userRateLimits.asyncApiRequests} + 1` }
          : { syncApiRequests: sql`${userRateLimits.syncApiRequests} + 1` };

    const [updated] = await this.db
      .update(userRateLimits)
      .set({
        ...updateSet,
        lastRequestAt: now,
      })
      .where(eq(userRateLimits.referenceId, key))
      .returning({
        syncApiRequests: userRateLimits.syncApiRequests,
        asyncApiRequests: userRateLimits.asyncApiRequests,
        apiEndpointRequests: userRateLimits.apiEndpointRequests,
      });

    if (!updated) {
      const resetAt = new Date(now.getTime() + windowMs);
      return { count: 1, resetAt };
    }

    const count = getCountFromRecord(updated, bucket);
    const resetAt = new Date(
      new Date(existing.windowStart).getTime() + windowMs,
    );
    return { count, resetAt };
  }

  async reset(key: string): Promise<void> {
    await this.db
      .delete(userRateLimits)
      .where(eq(userRateLimits.referenceId, key));
  }
}

export class CompositeRateLimitStore implements RateLimitStore {
  constructor(
    private readonly primary: RateLimitStore | null,
    private readonly fallback?: RateLimitStore,
  ) {}

  async increment(
    key: string,
    bucket: RateLimitBucket,
    windowMs: number,
  ): Promise<RateLimitState> {
    const resetAt = new Date(Date.now() + windowMs);

    if (this.primary) {
      try {
        return await this.primary.increment(key, bucket, windowMs);
      } catch (error) {
        logger.warn("Primary rate-limit store failed; falling back", {
          error,
          key,
          bucket,
        });
      }
    }

    if (this.fallback) {
      try {
        return await this.fallback.increment(key, bucket, windowMs);
      } catch (error) {
        logger.error("Fallback rate-limit store failed; allowing request", {
          error,
          key,
          bucket,
        });
      }
    }

    return { count: 1, resetAt };
  }

  async reset(key: string): Promise<void> {
    if (this.primary) {
      try {
        await this.primary.reset(key);
        return;
      } catch (error) {
        logger.warn("Primary store failed to reset key", { key, error });
      }
    }

    if (this.fallback) {
      try {
        await this.fallback.reset(key);
        return;
      } catch (error) {
        logger.error("Fallback store failed to reset key", { key, error });
      }
    }
  }
}
