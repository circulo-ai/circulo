import type { AppEnv } from "@/lib/create-app";
import {
  DEFAULT_PLAN,
  type RateLimitBucket,
  type RateLimitDecision,
  type RateLimitPlan,
} from "@/services/rate-limit";
import type { RateLimiter } from "@/services/rate-limit";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { RateLimitError } from "@circulo-ai/types";

type KeyResolver = (
  c: Context<AppEnv>,
  bucket: RateLimitBucket,
) => string | null | Promise<string | null>;

export type RateLimitOptions = {
  bucket?: RateLimitBucket;
  limit?: number;
  windowMs?: number;
  plan?: RateLimitPlan;
  keyResolver?: KeyResolver;
  skip?: (c: Context<AppEnv>) => boolean | Promise<boolean>;
};

function getClientIp(c: Context<AppEnv>): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;

  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp;

  const socketIp = (c.req.raw as any)?.socket?.remoteAddress;
  if (typeof socketIp === "string" && socketIp.length > 0) return socketIp;

  return null;
}

function setRateLimitHeaders(c: Context<AppEnv>, decision: RateLimitDecision) {
  c.header("X-RateLimit-Limit", String(decision.limit));
  c.header("X-RateLimit-Remaining", String(decision.remaining));
  c.header(
    "X-RateLimit-Reset",
    String(Math.floor(decision.resetAt.getTime() / 1000)),
  );
}

export function rateLimit(options: RateLimitOptions = {}) {
  const bucket: RateLimitBucket = options.bucket ?? "api";

  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.req.method === "OPTIONS") return next();
    if (options.skip && (await options.skip(c))) return next();

    const limiter: RateLimiter | undefined = c.di?.RateLimiter;
    if (!limiter) {
      return next();
    }

    const user = c.var.user;
    const activeOrgId = c.var.activeOrgId;
    const resolvedIdentifier =
      (options.keyResolver && (await options.keyResolver(c, bucket))) ||
      activeOrgId ||
      user?.id ||
      getClientIp(c) ||
      "anonymous";

    const plan =
      options.plan ||
      (activeOrgId ? await limiter.resolvePlan(activeOrgId) : DEFAULT_PLAN);

    const key = limiter.composeKey(bucket, resolvedIdentifier);
    const decision = await limiter.check({
      key,
      bucket,
      plan,
      limit: options.limit,
      windowMs: options.windowMs,
    });

    setRateLimitHeaders(c, decision);
    c.set("rateLimit", decision);

    if (!decision.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000),
      );
      throw new RateLimitError(retryAfterSeconds);
    }

    await next();
  });
}
