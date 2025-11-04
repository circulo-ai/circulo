import { Errors } from "@/lib/server/errors";
import { compose } from "@/lib/server/middlewares";
import { ApiResponseBuilder } from "@/lib/server/response";
import {
  ApiHandler,
  HttpError,
  Middleware,
  RouteContext,
  StreamingApiHandler,
} from "@/lib/server/types";
import { NextResponse } from "next/server";

type InferMiddlewareContext<T extends readonly Middleware<any>[]> =
  T extends readonly [...any[], Middleware<infer Last>]
    ? Last
    : T extends readonly []
      ? RouteContext
      : RouteContext;

/**
 * Creates a formatted error response for failed requests
 */
const createErrorResponse = (error: unknown, context: RouteContext): NextResponse => {
  console.error("[API Error]", error);

  if (error instanceof HttpError) {
    return ApiResponseBuilder.toNextResponse(
      ApiResponseBuilder.error(error),
      context,
    );
  }

  return ApiResponseBuilder.toNextResponse(
    ApiResponseBuilder.error(
      Errors.internal("An unexpected error occurred"),
    ),
    context,
  );
};

/**
 * Creates a streaming error response
 */
const createStreamingErrorResponse = (error: unknown): Response => {
  console.error("[Streaming API Error]", error);

  const errorData = error instanceof HttpError
    ? {
      message: error.message,
      code: error.code,
      details: error.details,
      statusCode: error.statusCode,
    }
    : {
      message: "An unexpected error occurred",
      code: "INTERNAL_ERROR",
      statusCode: 500,
    };

  return new Response(
    JSON.stringify({
      success: false,
      error: errorData,
    }),
    {
      status: errorData.statusCode,
      headers: { "Content-Type": "application/json" },
    },
  );
};

/**
 * Creates a route handler with middleware support for standard API responses
 *
 * @example
 * ```ts
 * export const GET = createRoute({
 *   middleware: [authMiddleware, rateLimitMiddleware],
 *   handler: async (req, ctx) => {
 *     return ApiResponseBuilder.success({ data: "hello" });
 *   }
 * });
 * ```
 */
export const createRoute = <TMiddleware extends readonly Middleware<any>[],
  TContext extends RouteContext = InferMiddlewareContext<TMiddleware>,
>(options: {
  handler: ApiHandler<any, TContext>;
  middleware?: TMiddleware;
}) => {
  const { handler, middleware = [] as unknown as TMiddleware } = options;

  return async (
    req: Request,
    routeContext?: { params: Record<string, string | string[]> },
  ) => {
    const context: RouteContext = {
      params: routeContext?.params || {},
      metadata: {},
    };

    try {
      const finalMiddleware = compose(...middleware);

      const response = await finalMiddleware(
        req as any,
        context as TContext,
        async () => handler(req as any, context as TContext),
      );

      return ApiResponseBuilder.toNextResponse(response, context);
    } catch (error) {
      return createErrorResponse(error, context);
    }
  };
};

/**
 * Creates multiple route handlers for different HTTP methods
 *
 * @example
 * ```ts
 * export const { GET, POST } = createRouteHandlers({
 *   middleware: [authMiddleware],
 *   GET: async (req, ctx) => ApiResponseBuilder.success({ data }),
 *   POST: async (req, ctx) => ApiResponseBuilder.success({ created: true }),
 * });
 * ```
 */
export const createRouteHandlers =
  <TMiddleware extends readonly Middleware<any>[],
  TContext extends RouteContext = InferMiddlewareContext<TMiddleware>,
>(config: {
  GET?: ApiHandler<any, TContext>;
  POST?: ApiHandler<any, TContext>;
  PUT?: ApiHandler<any, TContext>;
  PATCH?: ApiHandler<any, TContext>;
  DELETE?: ApiHandler<any, TContext>;
  middleware?: TMiddleware;
}) => {
  const handlers: Record<string, ReturnType<typeof createRoute<TMiddleware, TContext>>> = {};

  (Object.keys(config) as Array<keyof typeof config>).forEach((method) => {
    if (method !== "middleware") {
      const handler = config[method];
      if (handler) {
        handlers[method] = createRoute<TMiddleware, TContext>({
          handler: handler as ApiHandler<any, TContext>,
          middleware: config.middleware,
        });
      }
    }
  });

  return handlers;
};

/**
 * Creates a streaming route handler with middleware support
 *
 * @example
 * ```ts
 * export const POST = createStreamingRoute({
 *   middleware: [authMiddleware],
 *   handler: async (req, ctx) => {
 *     const stream = new ReadableStream({...});
 *     return new Response(stream);
 *   }
 * });
 * ```
 */
export const createStreamingRoute =
  <TMiddleware extends readonly Middleware<any>[],
  TContext extends RouteContext = InferMiddlewareContext<TMiddleware>,
>(options: {
  handler: StreamingApiHandler<TContext>;
  middleware?: TMiddleware;
}) => {
  const { handler, middleware = [] as unknown as TMiddleware } = options;

  return async (
    req: Request,
    routeContext?: { params: Record<string, string | string[]> },
  ) => {
    const context: RouteContext = {
      params: routeContext?.params || {},
      metadata: {},
    };

    try {
      const finalMiddleware = compose(...middleware);

      // Run middleware chain without requiring an ApiResponse return
      // Middleware can modify context and throw errors, but shouldn't block streaming
      await finalMiddleware(req as any, context as TContext, async () => {
        // Return a placeholder to satisfy middleware chain type
        return ApiResponseBuilder.success(null);
      });

      // After middleware validation, call the actual streaming handler
      const streamingResponse = await handler(req as any, context as TContext);

      if (!streamingResponse || !(streamingResponse instanceof Response)) {
        throw new Error("Handler must return a Response object");
      }

      return streamingResponse;
    } catch (error) {
      return createStreamingErrorResponse(error);
    }
  };
};

/**
 * Creates multiple streaming route handlers for different HTTP methods
 */
export const createStreamingRouteHandlers =
  <TMiddleware extends readonly Middleware<any>[],
  TContext extends RouteContext = InferMiddlewareContext<TMiddleware>,
>(config: {
  GET?: StreamingApiHandler<TContext>;
  POST?: StreamingApiHandler<TContext>;
  PUT?: StreamingApiHandler<TContext>;
  PATCH?: StreamingApiHandler<TContext>;
  DELETE?: StreamingApiHandler<TContext>;
  middleware?: TMiddleware;
}) => {
  const handlers: Record<string, ReturnType<typeof createStreamingRoute<TMiddleware, TContext>>> = {};

  (Object.keys(config) as Array<keyof typeof config>).forEach((method) => {
    if (method !== "middleware") {
      const handler = config[method];
      if (handler) {
        handlers[method] = createStreamingRoute<TMiddleware, TContext>({
          handler: handler as StreamingApiHandler<TContext>,
          middleware: config.middleware,
        });
      }
    }
  });

  return handlers;
};