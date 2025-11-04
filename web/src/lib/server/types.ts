import { Session } from "@/lib/auth";
import { NextRequest } from "next/server";

/**
 * Standard API handler that returns an ApiResponse
 */
export type ApiHandler<
  T = any,
  TContext extends RouteContext = RouteContext,
> = (req: Request | NextRequest, context: TContext) => Promise<ApiResponse<T>>;

/**
 * Streaming API handler that returns a streaming Response
 */
export type StreamingApiHandler<TContext extends RouteContext = RouteContext> =
  (req: Request | NextRequest, context: TContext) => Promise<Response>;

/**
 * Middleware function that can modify context and control request flow
 */
export type Middleware<TContext extends RouteContext = RouteContext> = (
  req: Request | NextRequest,
  context: TContext,
  next: () => Promise<ApiResponse>,
) => Promise<ApiResponse>;

/**
 * Base context available to all route handlers
 */
export interface RouteContext {
  params: Record<string, string | string[]>;
  metadata: Record<string, any>;
}

/**
 * Context with authenticated session
 */
export interface AuthenticatedContext extends RouteContext {
  session: Session;
}

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: Record<string, any>;
}

/**
 * Structured error information
 */
export interface ApiError {
  message: string;
  code: string;
  details?: any;
  statusCode: number;
}

/**
 * HTTP error class for throwing structured errors in handlers
 *
 * @example
 * ```ts
 * throw new HttpError(404, "NOT_FOUND", "User not found", { userId: 123 });
 * ```
 */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: any,
  ) {
    super(message);
    this.name = "HttpError";

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
  }

  /**
   * Convert HttpError to ApiError format
   */
  toApiError(): ApiError {
    return {
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }

  /**
   * Create a BadRequest (400) error
   */
  static badRequest(message: string, details?: any): HttpError {
    return new HttpError(400, "BAD_REQUEST", message, details);
  }

  /**
   * Create an Unauthorized (401) error
   */
  static unauthorized(message: string = "Unauthorized", details?: any): HttpError {
    return new HttpError(401, "UNAUTHORIZED", message, details);
  }

  /**
   * Create a Forbidden (403) error
   */
  static forbidden(message: string = "Forbidden", details?: any): HttpError {
    return new HttpError(403, "FORBIDDEN", message, details);
  }

  /**
   * Create a NotFound (404) error
   */
  static notFound(message: string = "Not found", details?: any): HttpError {
    return new HttpError(404, "NOT_FOUND", message, details);
  }

  /**
   * Create a Conflict (409) error
   */
  static conflict(message: string, details?: any): HttpError {
    return new HttpError(409, "CONFLICT", message, details);
  }

  /**
   * Create an UnprocessableEntity (422) error
   */
  static unprocessableEntity(message: string, details?: any): HttpError {
    return new HttpError(422, "UNPROCESSABLE_ENTITY", message, details);
  }

  /**
   * Create a TooManyRequests (429) error
   */
  static tooManyRequests(message: string = "Too many requests", details?: any): HttpError {
    return new HttpError(429, "TOO_MANY_REQUESTS", message, details);
  }

  /**
   * Create an InternalServerError (500) error
   */
  static internal(message: string = "Internal server error", details?: any): HttpError {
    return new HttpError(500, "INTERNAL_ERROR", message, details);
  }

  /**
   * Create a ServiceUnavailable (503) error
   */
  static serviceUnavailable(message: string = "Service unavailable", details?: any): HttpError {
    return new HttpError(503, "SERVICE_UNAVAILABLE", message, details);
  }
}

/**
 * Type guard to check if an error is an HttpError
 */
export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/**
 * Type guard to check if a response is successful
 */
export function isSuccessResponse<T>(
  response: ApiResponse<T>
): response is ApiResponse<T> & { success: true; data: T } {
  return response.success === true && response.data !== undefined;
}

/**
 * Type guard to check if a response is an error
 */
export function isErrorResponse<T>(
  response: ApiResponse<T>
): response is ApiResponse<T> & { success: false; error: ApiError } {
  return response.success === false && response.error !== undefined;
}

/**
 * Helper type to extract the data type from an ApiHandler
 */
export type InferHandlerData<T> = T extends ApiHandler<infer D, any> ? D : never;

/**
 * Helper type to extract the context type from an ApiHandler
 */
export type InferHandlerContext<T> = T extends ApiHandler<any, infer C> ? C : never;

/**
 * Helper type for creating middleware that adds properties to context
 */
export type MiddlewareWithContext<
TInput extends RouteContext,
  TOutput extends TInput,
> = (
  req: NextRequest,
  context: TInput,
  next: () => Promise<ApiResponse>,
) => Promise<ApiResponse>;

/**
 * Utility type for composing middleware context transformations
 */
export type ComposeMiddleware<
T extends readonly Middleware<any>[],
  TBase extends RouteContext = RouteContext,
> = T extends readonly []
  ? TBase
  : T extends readonly [Middleware<infer C1>]
  ? C1
  : T extends readonly [Middleware<any>, ...infer Rest]
  ? Rest extends readonly Middleware<any>[]
  ? ComposeMiddleware<Rest, TBase>
  : TBase
: TBase;

/**
 * Success response with data
 */
export type SuccessResponse<T> = {
  success: true;
  data: T;
  error?: never;
  metadata?: Record<string, any>;
};

/**
 * Error response
 */
export type ErrorResponse = {
  success: false;
  data?: never;
  error: ApiError;
  metadata?: Record<string, any>;
};

/**
 * Discriminated union of response types for better type narrowing
 */
export type TypedApiResponse<T> = SuccessResponse<T> | ErrorResponse;

/**
 * HTTP method types supported by route handlers
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/**
 * Route handler configuration for multiple methods
 */
export type RouteHandlerConfig<
TContext extends RouteContext = RouteContext,
  TMiddleware extends readonly Middleware<any>[] = readonly Middleware<any>[],
> = {
  [K in HttpMethod]?: ApiHandler<any, TContext>;
} & {
  middleware?: TMiddleware;
};

/**
 * Streaming route handler configuration for multiple methods
 */
export type StreamingRouteHandlerConfig<
TContext extends RouteContext = RouteContext,
  TMiddleware extends readonly Middleware<any>[] = readonly Middleware<any>[],
> = {
  [K in HttpMethod]?: StreamingApiHandler<TContext>;
} & {
  middleware?: TMiddleware;
};