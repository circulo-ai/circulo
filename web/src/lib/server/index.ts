import { getSession, Session } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { output, z, ZodError } from "zod";
import { ApiError } from "./types";

// ============================================================================
// Error Handling
// ============================================================================

export const Errors = {
  badRequest: (msg: string = "Bad Request", code?: string, details?: unknown) =>
    new ApiError(400, code ?? "BAD_REQUEST", msg, details),
  unauthorized: (msg = "Unauthorized", code?: string) =>
    new ApiError(401, code ?? "UNAUTHORIZED", msg),
  forbidden: (msg = "Forbidden", code?: string) =>
    new ApiError(403, code ?? "FORBIDDEN", msg),
  notFound: (msg = "Not found", code?: string) =>
    new ApiError(404, code ?? "NOT_FOUND", msg),
  conflict: (msg: string, code?: string, details?: unknown) =>
    new ApiError(409, code ?? "CONFLICT", msg, details),
  unprocessable: (msg: string, code?: string, details?: unknown) =>
    new ApiError(422, code ?? "UNPROCESSABLE_ENTITY", msg, details),
  tooManyRequests: (
    msg = "Too many requests",
    code?: string,
    details?: unknown,
  ) => new ApiError(429, code ?? "TOO_MANY_REQUESTS", msg, details),
  internal: (msg = "Internal server error", code?: string) =>
    new ApiError(500, code ?? "INTERNAL_ERROR", msg),
} as const;

function handleError(error: unknown): NextResponse {
  console.error("[API Error]", error);

  // Zod errors → consistent shape
  if (error instanceof ZodError) {
    return json(
      {
        success: false,
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      },
      400,
    );
  }

  // Custom API errors
  if (error instanceof ApiError) {
    return json(error.toJSON(), error.statusCode);
  }

  // Unknown errors
  return json(
    {
      success: false,
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    },
    500,
  );
}

// ============================================================================
// Core Types
// ============================================================================

type InferZodSchema<T extends z.ZodSchema> = output<T>;

interface RouteConfig<
  TBody extends z.ZodSchema = z.ZodSchema,
  TQuery extends z.ZodSchema = z.ZodSchema,
  TParams extends z.ZodSchema = z.ZodSchema,
  TAuth extends boolean = false,
> {
  body?: TBody;
  query?: TQuery;
  params?: TParams;
  auth?: TAuth;
}

interface BaseContext<TBody = unknown, TQuery = unknown, TParams = unknown> {
  readonly body: TBody;
  readonly query: TQuery;
  readonly params: TParams;
}

interface UnauthenticatedContext<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
> extends BaseContext<TBody, TQuery, TParams> {
  readonly user?: never;
}

interface AuthenticatedContext<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
> extends BaseContext<TBody, TQuery, TParams> {
  readonly user: NonNullable<Session["user"]>;
}

type Context<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TAuth extends boolean = false,
> = TAuth extends true
  ? AuthenticatedContext<TBody, TQuery, TParams>
  : UnauthenticatedContext<TBody, TQuery, TParams>;

type Handler<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TAuth extends boolean = false,
> = (
  req: NextRequest,
  ctx: Context<TBody, TQuery, TParams, TAuth>,
) => Promise<unknown> | unknown;

// Next.js expects raw string params in the route context.
type StringParams<T> = { [K in keyof T]: string };

type NextRouteHandler<TParams = Record<string, never>> = (
  req: NextRequest,
  routeContext: { params: TParams | Promise<TParams> },
) => Promise<NextResponse>;

// ============================================================================
// Main API Handler (Type-Safe Overloads)
// ============================================================================

// Overload 1: Handler only (no config)
export function api<TParams = Record<string, never>>(
  handler: Handler<
    Record<string, never>,
    Record<string, never>,
    TParams,
    false
  >,
): NextRouteHandler<TParams>;

// Overload 2: Config with auth required
export function api<
  TBody extends z.ZodSchema,
  TQuery extends z.ZodSchema,
  TParams extends z.ZodSchema,
>(
  config: RouteConfig<TBody, TQuery, TParams, true> & { auth: true },
  handler: Handler<
    InferZodSchema<TBody>,
    InferZodSchema<TQuery>,
    InferZodSchema<TParams>,
    true
  >,
): NextRouteHandler<StringParams<InferZodSchema<TParams>>>;

// Overload 3: Config without auth
export function api<
  TBody extends z.ZodSchema,
  TQuery extends z.ZodSchema,
  TParams extends z.ZodSchema,
>(
  config: RouteConfig<TBody, TQuery, TParams, false>,
  handler: Handler<
    InferZodSchema<TBody>,
    InferZodSchema<TQuery>,
    InferZodSchema<TParams>,
    false
  >,
): NextRouteHandler<StringParams<InferZodSchema<TParams>>>;

// Implementation
export function api<
  TBody extends z.ZodSchema = z.ZodSchema,
  TQuery extends z.ZodSchema = z.ZodSchema,
  TParams extends z.ZodSchema = z.ZodSchema,
  TAuth extends boolean = false,
>(
  configOrHandler:
    | RouteConfig<TBody, TQuery, TParams, TAuth>
    | Handler<output<TBody>, output<TQuery>, output<TParams>, boolean>,
  handler?: Handler<output<TBody>, output<TQuery>, output<TParams>, TAuth>,
): NextRouteHandler<StringParams<InferZodSchema<TParams>>> {
  // Determine if first arg is config or handler
  const isConfig =
    (typeof configOrHandler === "object" &&
      configOrHandler !== null &&
      "body" in configOrHandler) ||
    "query" in configOrHandler ||
    "params" in configOrHandler ||
    "auth" in configOrHandler;
  const actualConfig = isConfig
    ? (configOrHandler as RouteConfig<TBody, TQuery, TParams, TAuth>)
    : ({} as RouteConfig<TBody, TQuery, TParams, TAuth>);
  const actualHandler = (isConfig ? handler : configOrHandler) as Handler<
    InferZodSchema<TBody>,
    InferZodSchema<TQuery>,
    InferZodSchema<TParams>,
    TAuth
  >;

  if (!actualHandler) {
    throw new Error("Handler function is required");
  }

  return async (
    req: NextRequest,
    routeContext: {
      params:
        | StringParams<InferZodSchema<TParams>>
        | Promise<StringParams<InferZodSchema<TParams>>>;
    },
  ): Promise<NextResponse> => {
    try {
      // --- 1️⃣  Handle params (Next.js 15: may be a Promise) ---
      let rawParams: unknown = {};

      if (routeContext?.params !== undefined) {
        // Await if it's a Promise
        rawParams = await Promise.resolve(routeContext.params);
      }

      const validatedParams = actualConfig.params
        ? actualConfig.params.parse(rawParams)
        : (rawParams as output<TParams>);

      // --- 2️⃣  Parse query string ---
      const queryObj = Object.fromEntries(req.nextUrl.searchParams);
      const validatedQuery = actualConfig.query
        ? actualConfig.query.parse(queryObj)
        : (queryObj as output<TQuery>);

      // --- 3️⃣  Parse body (if configured) ---
      let validatedBody: InferZodSchema<TBody>;
      if (actualConfig.body) {
        try {
          const rawBody = await req.json();
          validatedBody = actualConfig.body.parse(rawBody);
        } catch (jsonError) {
          if (jsonError instanceof SyntaxError) {
            throw Errors.badRequest("Invalid JSON in request body");
          }
          throw jsonError;
        }
      } else {
        validatedBody = {} as output<TBody>;
      }

      // --- 4️⃣  Optional auth check ---
      let user: Session["user"] | undefined;
      if (actualConfig.auth) {
        const potentialUser = await getUser(req);
        if (!potentialUser) throw Errors.unauthorized();
        user = potentialUser;
      }

      // --- 5️⃣  Build context ---
      const ctx = (
        actualConfig.auth
          ? {
              body: validatedBody,
              query: validatedQuery,
              params: validatedParams,
              user: user!,
            }
          : {
              body: validatedBody,
              query: validatedQuery,
              params: validatedParams,
            }
      ) as Context<output<TBody>, output<TQuery>, output<TParams>, TAuth>;

      // --- 6️⃣  Execute actual handler ---
      const result = await actualHandler(req, ctx);

      // --- 7️⃣  Return result ---
      if (result instanceof Response) {
        return result as NextResponse;
      }

      return NextResponse.json(result);
    } catch (error) {
      return handleError(error);
    }
  };
}

// ============================================================================
// Auth Helper
// ============================================================================

async function getUser(req: NextRequest): Promise<Session["user"] | null> {
  return (await getSession())?.user || null;
}

// ============================================================================
// Response Helpers
// ============================================================================

export const json = <T>(data: T, status = 200): NextResponse =>
  NextResponse.json(data, { status });

export const success = <T>(data: T, status = 200): NextResponse =>
  json({ success: true, data }, status);

export const error = (message: string, status = 400): NextResponse =>
  json({ success: false, error: message }, status);

export const created = <T>(data: T): NextResponse => success(data, 201);

export const noContent = (): NextResponse =>
  new NextResponse(null, { status: 204 });

export const notFound = (msg = "Entity not found!") => {
  throw Errors.notFound(msg);
};

// ============================================================================
// Composable Middleware
// ============================================================================

export interface RateLimitOptions<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TAuth extends boolean = false,
> {
  maxRequests: number;
  windowMs: number;
  keyPrefix?: string;
  getIdentifier?: (
    req: NextRequest,
    ctx: Context<TBody, TQuery, TParams, TAuth>,
  ) => string | Promise<string>;
  onLimit?: (
    req: NextRequest,
    ctx: Context<TBody, TQuery, TParams, TAuth>,
  ) => void | Promise<void>;
}

export function withRateLimit<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TAuth extends boolean = false,
>(
  options: RateLimitOptions<TBody, TQuery, TParams, TAuth>,
  handler: Handler<TBody, TQuery, TParams, TAuth>,
): Handler<TBody, TQuery, TParams, TAuth> {
  const {
    maxRequests,
    windowMs,
    keyPrefix = "ratelimit",
    getIdentifier = (req) =>
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown",
    onLimit,
  } = options;

  const fallbackCache = new Map<string, number[]>();

  return async (req, ctx) => {
    const identifier = await getIdentifier(req, ctx);
    const cacheKey = `${keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    const windowSeconds = Math.ceil(windowMs / 1000);

    try {
      // Try Redis first
      const { getRedisClient } = await import("@/lib/redis").catch(() => ({
        getRedisClient: () => null,
      }));
      const redis = getRedisClient();

      if (redis) {
        const multi = redis.multi();
        multi.zremrangebyscore(cacheKey, 0, windowStart);
        multi.zcard(cacheKey);
        multi.zadd(cacheKey, now, `${now}-${Math.random()}`);
        multi.expire(cacheKey, windowSeconds + 1);

        const results = await multi.exec();
        if (!results) throw new Error("Redis multi command failed");

        const [countErr, count] = results[1];
        if (countErr) throw countErr;

        const requestCount = count as number;

        if (requestCount >= maxRequests) {
          await onLimit?.(req, ctx);
          throw Errors.tooManyRequests("Rate limit exceeded", undefined, {
            limit: maxRequests,
            window: `${windowMs}ms`,
            retryAfter: windowSeconds,
          });
        }
      } else {
        // Fallback to in-memory
        const userRequests = fallbackCache.get(cacheKey) || [];
        const recent = userRequests.filter((time) => time > windowStart);

        if (recent.length >= maxRequests) {
          await onLimit?.(req, ctx);
          throw Errors.tooManyRequests("Rate limit exceeded", undefined, {
            limit: maxRequests,
            window: `${windowMs}ms`,
            retryAfter: windowSeconds,
          });
        }

        recent.push(now);
        fallbackCache.set(cacheKey, recent);

        // Periodic cleanup
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
      }

      return handler(req, ctx);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error("[Rate Limit Error]", error);
      return handler(req, ctx);
    }
  };
}

export function withLogger<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TAuth extends boolean = false,
>(
  handler: Handler<TBody, TQuery, TParams, TAuth>,
  options: {
    logBody?: boolean;
    logQuery?: boolean;
  } = {},
): Handler<TBody, TQuery, TParams, TAuth> {
  return async (req, ctx) => {
    const start = Date.now();
    const logData: Record<string, unknown> = {
      method: req.method,
      url: req.url,
    };

    if (options.logBody) logData.body = ctx.body;
    if (options.logQuery) logData.query = ctx.query;

    console.log("[API Request]", logData);

    try {
      const result = await handler(req, ctx);
      const duration = Date.now() - start;
      console.log(
        `[API Success] ${req.method} ${req.url} - 200 (${duration}ms)`,
      );
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const status = error instanceof ApiError ? error.statusCode : 500;
      console.error(
        `[API Error] ${req.method} ${req.url} - ${status} (${duration}ms)`,
        error,
      );
      throw error;
    }
  };
}

export function withTimeout<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TAuth extends boolean = false,
>(
  timeoutMs: number,
  handler: Handler<TBody, TQuery, TParams, TAuth>,
): Handler<TBody, TQuery, TParams, TAuth> {
  return async (req, ctx) => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(Errors.internal("Request timeout")), timeoutMs),
    );

    return Promise.race([handler(req, ctx), timeoutPromise]);
  };
}

export function compose<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  TAuth extends boolean = false,
>(
  ...middlewares: Array<
    (
      handler: Handler<TBody, TQuery, TParams, TAuth>,
    ) => Handler<TBody, TQuery, TParams, TAuth>
  >
) {
  return (handler: Handler<TBody, TQuery, TParams, TAuth>) =>
    middlewares.reduceRight((acc, middleware) => middleware(acc), handler);
}

// ============================================================================
// Request Helpers
// ============================================================================

export async function parseBody<T = unknown>(req: NextRequest): Promise<T> {
  try {
    return await req.json();
  } catch {
    throw Errors.badRequest("Invalid JSON in request body");
  }
}

export function parseQuery(req: NextRequest): Record<string, string> {
  return Object.fromEntries(req.nextUrl.searchParams);
}

export function getQueryParam(
  req: NextRequest,
  key: string,
  required = false,
): string | undefined {
  const value = req.nextUrl.searchParams.get(key);
  if (required && !value) {
    throw Errors.badRequest(`Missing required query parameter: ${key}`);
  }
  return value ?? undefined;
}

export function getHeader(
  req: NextRequest,
  key: string,
  required = false,
): string | undefined {
  const value = req.headers.get(key);
  if (required && !value) {
    throw Errors.badRequest(`Missing required header: ${key}`);
  }
  return value ?? undefined;
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
// Example 1: Simple handler
export const GET = api(async (req, ctx) => {
  return { hello: 'world' };
});

// Example 2: With validation and auth
export const POST = api(
  {
    body: z.object({
      title: z.string().min(1).max(200),
      content: z.string(),
    }),
    auth: true,
  },
  async (req, ctx) => {
    // ctx.body is fully typed!
    // ctx.user is guaranteed to exist
    const post = await db.post.create({
      data: { ...ctx.body, authorId: ctx.user.id },
    });
    return created({ post });
  }
);

// Example 3: With params and query
export const GET = api(
  {
    params: z.object({ id: z.string().uuid() }),
    query: z.object({
      include: z.enum(['author', 'comments']).optional(),
    }),
  },
  async (req, ctx) => {
    const post = await db.post.findUnique({
      where: { id: ctx.params.id },
      include: {
        author: ctx.query.include === 'author',
        comments: ctx.query.include === 'comments',
      },
    });
    if (!post) throw Errors.notFound('Post not found');
    return success({ post });
  }
);

// Example 4: Streaming response
export const POST = api(async (req, ctx) => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('chunk 1\n'));
      controller.enqueue(new TextEncoder().encode('chunk 2\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain' },
  });
});

// Example 5: Composable middleware
export const POST = api(
  compose(
    (handler) => withTimeout(5000, handler),
    (handler) =>
      withRateLimit(
        {
          maxRequests: 10,
          windowMs: 60000,
          keyPrefix: 'api:posts',
          getIdentifier: (req, ctx) =>
            ctx.user?.id || req.headers.get('x-forwarded-for') || 'unknown',
        },
        handler
      ),
    (handler) => withLogger(handler, { logBody: true })
  )(async (req, ctx) => {
    return { data: 'Rate limited, logged, and timeout protected' };
  })
);

// Example 6: Multiple methods in one file
const postSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string(),
  tags: z.array(z.string()).optional(),
});

export const GET = api(
  {
    query: z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().min(1).max(100).default(10),
    }),
  },
  async (req, ctx) => {
    const posts = await db.post.findMany({
      skip: (ctx.query.page - 1) * ctx.query.limit,
      take: ctx.query.limit,
    });
    return success({ posts, page: ctx.query.page });
  }
);

export const POST = api(
  { body: postSchema, auth: true },
  async (req, ctx) => {
    const post = await db.post.create({
      data: { ...ctx.body, authorId: ctx.user.id },
    });
    return created({ post });
  }
);

// Example 7: Custom error handling
export const DELETE = api(
  {
    params: z.object({ id: z.string().uuid() }),
    auth: true,
  },
  async (req, ctx) => {
    const post = await db.post.findUnique({
      where: { id: ctx.params.id },
    });

    if (!post) throw Errors.notFound('Post not found');
    if (post.authorId !== ctx.user.id) {
      throw Errors.forbidden('You can only delete your own posts');
    }

    await db.post.delete({ where: { id: ctx.params.id } });
    return noContent();
  }
);
*/
