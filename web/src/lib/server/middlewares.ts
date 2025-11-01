import { getSession } from "@/lib/auth";
import { getRedisClient } from "@/lib/redis";
import { Errors } from "@/lib/server/errors";
import {
  ApiResponse,
  AuthenticatedContext,
  HttpError,
  Middleware,
  RouteContext,
} from "@/lib/server/types";
import { NextRequest } from "next/server";

export const createMiddleware = <TContext extends RouteContext = RouteContext>(
  fn: Middleware<TContext>,
): Middleware<TContext> => fn;

export const compose = <TContext extends RouteContext = RouteContext>(
  ...middlewares: Middleware<any>[]
): Middleware<TContext> => {
  return async (req, context, next) => {
    let index = 0;

    const dispatch = async (): Promise<ApiResponse> => {
      if (index >= middlewares.length) return next();
      const middleware = middlewares[index++];
      return middleware(req, context, dispatch);
    };

    return dispatch();
  };
};

export const corsMiddleware = (options?: {
  origin?: string;
  methods?: string[];
}): Middleware => {
  return async (req, context, next) => {
    const response = await next();
    // CORS headers would be set in the NextResponse
    return response;
  };
};

export const loggerMiddleware: Middleware = async (req, context, next) => {
  const start = Date.now();
  const { createLogger } = await import("@/lib/logs/console/logger");
  const logger = createLogger("Api");
  logger.info(`${req.method} ${req.url}`);

  const response = await next();

  const duration = Date.now() - start;
  logger.info(
    `${req.method} ${req.url} - ${response.error?.statusCode || 200} (${duration}ms)`,
  );

  return response;
};

export const authMiddleware = createMiddleware<AuthenticatedContext>(
  async (req, context, next) => {
    const session = await getSession();

    if (!session?.user?.id) {
      throw Errors.unauthorized("No token provided");
    }

    try {
      context.session = session;
      return next();
    } catch (error) {
      throw Errors.unauthorized("Invalid token");
    }
  },
);

export const rateLimitMiddleware = (options: {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
  getIdentifier?: (req: NextRequest) => string;
}): Middleware => {
  // Fallback in-memory cache when Redis is unavailable
  const fallbackCache = new Map<string, number[]>();
  const keyPrefix = options.keyPrefix || "ratelimit";
  const getIdentifier =
    options.getIdentifier ||
    ((req: NextRequest) =>
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown");

  return async (req, context, next) => {
    const identifier = getIdentifier(req);
    const cacheKey = `${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - options.windowMs;
    const windowSeconds = Math.ceil(options.windowMs / 1000);

    try {
      const redis = getRedisClient();

      if (redis) {
        // Redis-based rate limiting using sorted sets
        const multi = redis.multi();

        // Remove old entries outside the time window
        multi.zremrangebyscore(cacheKey, 0, windowStart);

        // Count requests in current window
        multi.zcard(cacheKey);

        // Add current request
        multi.zadd(cacheKey, now, `${now}-${Math.random()}`);

        // Set expiry on the key
        multi.expire(cacheKey, windowSeconds + 1);

        const results = await multi.exec();

        if (!results) {
          throw new Error("Redis multi command failed");
        }

        // Get the count from ZCARD (second command, index 1)
        const [countErr, count] = results[1];

        if (countErr) {
          throw countErr;
        }

        const requestCount = count as number;

        if (requestCount >= options.maxRequests) {
          throw Errors.badRequest("Rate limit exceeded", {
            limit: options.maxRequests,
            window: `${options.windowMs}ms`,
            retryAfter: Math.ceil(options.windowMs / 1000),
          });
        }

        // Add rate limit headers to context for later use
        context.metadata = context.metadata || {};
        context.metadata.rateLimit = {
          limit: options.maxRequests,
          remaining: Math.max(0, options.maxRequests - requestCount - 1),
          reset: now + options.windowMs,
        };

        return next();
      } else {
        // Fallback to in-memory cache
        const userRequests = fallbackCache.get(cacheKey) || [];
        const recentRequests = userRequests.filter(
          (time) => time > windowStart,
        );

        if (recentRequests.length >= options.maxRequests) {
          throw Errors.badRequest("Rate limit exceeded", {
            limit: options.maxRequests,
            window: `${options.windowMs}ms`,
            retryAfter: Math.ceil(options.windowMs / 1000),
          });
        }

        recentRequests.push(now);
        fallbackCache.set(cacheKey, recentRequests);

        // Cleanup old entries periodically
        if (Math.random() < 0.01) {
          for (const [key, timestamps] of fallbackCache.entries()) {
            const valid = timestamps.filter((time) => time > windowStart);
            if (valid.length === 0) {
              fallbackCache.delete(key);
            } else {
              fallbackCache.set(key, valid);
            }
          }
        }

        context.metadata = context.metadata || {};
        context.metadata.rateLimit = {
          limit: options.maxRequests,
          remaining: Math.max(0, options.maxRequests - recentRequests.length),
          reset: now + options.windowMs,
        };

        return next();
      }
    } catch (error) {
      // If it's already a rate limit error, rethrow it
      if (error instanceof HttpError && error.code === "BAD_REQUEST") {
        throw error;
      }

      // For other errors, log and fall back to in-memory
      console.error("[Rate Limit Error]", error);

      const userRequests = fallbackCache.get(cacheKey) || [];
      const recentRequests = userRequests.filter((time) => time > windowStart);

      if (recentRequests.length >= options.maxRequests) {
        throw Errors.badRequest("Rate limit exceeded", {
          limit: options.maxRequests,
          window: `${options.windowMs}ms`,
        });
      }

      recentRequests.push(now);
      fallbackCache.set(cacheKey, recentRequests);

      return next();
    }
  };
};
