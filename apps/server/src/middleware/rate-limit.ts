import type { AppEnv } from "@/lib/create-app";
import type { RateLimiter } from "@/services/rate-limit";
import {
  DEFAULT_PLAN,
  type RateLimitBucket,
  type RateLimitDecision,
  type RateLimitPlan,
} from "@/services/rate-limit";
import { RateLimitError } from "@circulo-ai/types";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { env } from "@/lib/env";

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
  const trustedHops = Math.max(0, Number(env.TRUSTED_PROXY_HOPS ?? "0"));
  if (trustedHops > 0 && forwarded) {
    const addresses = forwarded
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const clientIndex = Math.max(0, addresses.length - trustedHops - 1);
    return addresses[clientIndex] ?? null;
  }

  if (trustedHops > 0) {
    const realIp = c.req.header("x-real-ip");
    if (realIp) return realIp;
  }

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

    const limiter = (c.di as any)?.RateLimiter as RateLimiter | undefined;
    if (!limiter) {
      return next();
    }

    const activeOrgId = c.var.activeOrgId;
    const actorIdentifier =
      c.var.apiKeyId || c.var.user?.id || getClientIp(c) || "anonymous";
    const resolvedIdentifier =
      (options.keyResolver && (await options.keyResolver(c, bucket))) ||
      actorIdentifier;

    const plan =
      options.plan ||
      (activeOrgId ? await limiter.resolvePlan(activeOrgId) : DEFAULT_PLAN);

    const scope = activeOrgId ? `org:${activeOrgId}` : "global";
    const key = limiter.composeKey(
      bucket,
      `${scope}:actor:${resolvedIdentifier}:route:${c.req.method}:${c.req.path}`,
    );
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
