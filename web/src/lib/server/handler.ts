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
import { NextRequest } from "next/server";

type InferMiddlewareContext<T extends readonly Middleware<any>[]> =
  T extends readonly [...any[], Middleware<infer Last>] ? Last : RouteContext;

// route-handler.ts
export const createRoute = <
  TMiddleware extends readonly Middleware<any>[],
  TContext extends RouteContext = InferMiddlewareContext<TMiddleware>,
>(options: {
  handler: ApiHandler<any, TContext>;
  middleware?: TMiddleware;
}) => {
  const { handler, middleware = [] as unknown as TMiddleware } = options;

  return async (
    req: NextRequest,
    routeContext?: { params: Record<string, string> },
  ) => {
    const context: RouteContext = {
      params: routeContext?.params || {},
      metadata: {},
    };

    try {
      const finalMiddleware = compose(...middleware);

      const response = await finalMiddleware(
        req,
        context as TContext,
        async () => {
          return handler(req, context as TContext);
        },
      );

      return ApiResponseBuilder.toNextResponse(response, context);
    } catch (error) {
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
    }
  };
};

// Helper to create handlers for different HTTP methods
export const createRouteHandlers = <
  TMiddleware extends readonly Middleware<any>[],
  TContext extends RouteContext = InferMiddlewareContext<TMiddleware>,
>(config: {
  GET?: ApiHandler<any, TContext>;
  POST?: ApiHandler<any, TContext>;
  PUT?: ApiHandler<any, TContext>;
  PATCH?: ApiHandler<any, TContext>;
  DELETE?: ApiHandler<any, TContext>;
  middleware?: TMiddleware;
}) => {
  const handlers: Record<string, any> = {};

  for (const [method, handler] of Object.entries(config)) {
    if (method !== "middleware" && handler) {
      handlers[method] = createRoute<TMiddleware, TContext>({
        handler: handler as ApiHandler<any, TContext>,
        middleware: config.middleware,
      });
    }
  }

  return handlers;
};

export const createStreamingRoute = <
  TMiddleware extends readonly Middleware<any>[],
  TContext extends RouteContext = InferMiddlewareContext<TMiddleware>,
>(options: {
  handler: StreamingApiHandler<TContext>;
  middleware?: TMiddleware;
}) => {
  const { handler, middleware = [] as unknown as TMiddleware } = options;

  return async (
    req: NextRequest,
    routeContext?: { params: Record<string, string> },
  ) => {
    const context: RouteContext = {
      params: routeContext?.params || {},
      metadata: {},
    };

    try {
      const finalMiddleware = compose(...middleware);

      // For streaming, we need to handle middleware differently
      // Middleware should still run, but we return a Response directly
      let streamingResponse: Response | null = null;

      await finalMiddleware(req, context as TContext, async () => {
        streamingResponse = await handler(req, context as TContext);
        // Return a dummy ApiResponse to satisfy middleware chain
        return ApiResponseBuilder.success(null);
      });

      if (!streamingResponse) {
        throw new Error("Handler did not return a streaming response");
      }

      return streamingResponse;
    } catch (error) {
      console.error("[Streaming API Error]", error);

      if (error instanceof HttpError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              message: error.message,
              code: error.code,
              details: error.details,
              statusCode: error.statusCode,
            },
          }),
          {
            status: error.statusCode,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: {
            message: "An unexpected error occurred",
            code: "INTERNAL_ERROR",
            statusCode: 500,
          },
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  };
};

// Helper to create streaming handlers for different HTTP methods
export const createStreamingRouteHandlers = <
  TMiddleware extends readonly Middleware<any>[],
  TContext extends RouteContext = InferMiddlewareContext<TMiddleware>,
>(config: {
  GET?: StreamingApiHandler<TContext>;
  POST?: StreamingApiHandler<TContext>;
  PUT?: StreamingApiHandler<TContext>;
  PATCH?: StreamingApiHandler<TContext>;
  DELETE?: StreamingApiHandler<TContext>;
  middleware?: TMiddleware;
}) => {
  const handlers: Record<string, any> = {};

  for (const [method, handler] of Object.entries(config)) {
    if (method !== "middleware" && handler) {
      handlers[method] = createStreamingRoute<TMiddleware, TContext>({
        handler: handler as StreamingApiHandler<TContext>,
        middleware: config.middleware,
      });
    }
  }

  return handlers;
};
