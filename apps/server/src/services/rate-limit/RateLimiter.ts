import { getSubscriptionForOrg } from "@/lib/billing/autumn";
import { createLogger } from "@/lib/logs/console/logger";
import type { CirculoRedis } from "@circulo-ai/redis";
import type { RateLimitStore } from "./store";
import type {
  RateLimitBucket,
  RateLimitDecision,
  RateLimitPlan,
  RateLimitRequest,
} from "./types";
import { DEFAULT_PLAN, RATE_LIMITS, RATE_LIMIT_WINDOW_MS } from "./types";

const logger = createLogger("RateLimiter");
const PLAN_CACHE_TTL_SECONDS = 300;

function normalizePlan(plan: string | null | undefined): RateLimitPlan {
  if (plan === "pro" || plan === "team" || plan === "enterprise") {
    return plan;
  }
  return DEFAULT_PLAN;
}

export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly redis: CirculoRedis | null,
  ) {}

  private getLimitForPlan(
    plan: RateLimitPlan,
    bucket: RateLimitBucket,
  ): number {
    const config = RATE_LIMITS[plan] ?? RATE_LIMITS[DEFAULT_PLAN];
    return config[bucket];
  }

  private getWindowMs(plan: RateLimitPlan): number {
    return RATE_LIMITS[plan]?.windowMs ?? RATE_LIMIT_WINDOW_MS;
  }

  composeKey(bucket: RateLimitBucket, identifier: string): string {
    return `${bucket}:${identifier}`;
  }

  async resolvePlan(organizationId?: string | null): Promise<RateLimitPlan> {
    if (!organizationId) return DEFAULT_PLAN;
    const cacheKey = `rate:plan:${organizationId}`;

    if (this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return normalizePlan(cached);
    }

    try {
      const subscription = await getSubscriptionForOrg(organizationId);
      const plan = normalizePlan(subscription?.plan);

      if (this.redis) {
        await this.redis.set(cacheKey, plan, { ex: PLAN_CACHE_TTL_SECONDS });
      }

      return plan;
    } catch (error) {
      logger.warn("Failed to resolve subscription; defaulting to free plan", {
        error,
        organizationId,
      });
      return DEFAULT_PLAN;
    }
  }

  async check(request: RateLimitRequest): Promise<RateLimitDecision> {
    const plan = request.plan ?? DEFAULT_PLAN;
    const limit = request.limit ?? this.getLimitForPlan(plan, request.bucket);
    const windowMs = request.windowMs ?? this.getWindowMs(plan);

    try {
      const state = await this.store.increment(
        request.key,
        request.bucket,
        windowMs,
      );

      const allowed = state.count <= limit;
      return {
        ...state,
        allowed,
        remaining: Math.max(0, limit - state.count),
        limit,
        key: request.key,
        plan,
        bucket: request.bucket,
      };
    } catch (error) {
      logger.error("Rate limit check failed; rejecting request", {
        error,
        key: request.key,
      });

      const resetAt = new Date(Date.now() + windowMs);
      return {
        allowed: false,
        count: 0,
        remaining: 0,
        limit,
        resetAt,
        key: request.key,
        plan,
        bucket: request.bucket,
      };
    }
  }
}
