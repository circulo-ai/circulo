import type {
  RateLimitDecision,
  RateLimitRequest,
  RateLimiterOptions,
  TokenBucketStore,
} from "../models";

export class TokenBucketRateLimiter {
  constructor(
    private readonly store: TokenBucketStore,
    private readonly options: RateLimiterOptions,
  ) {
    if (!Number.isFinite(options.capacity) || options.capacity <= 0) {
      throw new RangeError("Rate limit capacity must be positive");
    }
    if (!Number.isFinite(options.refillPerSecond) || options.refillPerSecond <= 0) {
      throw new RangeError("Rate limit refillPerSecond must be positive");
    }
  }

  take(request: RateLimitRequest): Promise<RateLimitDecision> {
    const cost = request.cost ?? 1;
    if (!Number.isFinite(cost) || cost <= 0) {
      return Promise.reject(new RangeError("Rate limit cost must be positive"));
    }
    return this.store.take(
      `${this.options.keyPrefix ?? "wf:rate:"}${request.key}`,
      this.options.capacity,
      this.options.refillPerSecond,
      cost,
      request.now ?? Date.now(),
    );
  }
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/** Reference token bucket; production adapters must make `take` atomic. */
export class InMemoryTokenBucketStore implements TokenBucketStore {
  private readonly buckets = new Map<string, Bucket>();

  async take(
    key: string,
    capacity: number,
    refillPerSecond: number,
    cost: number,
    now: number,
  ): Promise<RateLimitDecision> {
    const bucket = this.buckets.get(key) ?? {
      tokens: capacity,
      updatedAt: now,
    };
    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + elapsedSeconds * refillPerSecond,
    );
    bucket.updatedAt = now;
    const allowed = bucket.tokens >= cost;
    if (allowed) bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: allowed
        ? 0
        : Math.ceil(((cost - bucket.tokens) / refillPerSecond) * 1000),
    };
  }
}
