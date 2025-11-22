// Core
export { createSafeRoute, type SafeRouteOptions } from "./createSafeRoute";
export { RouteHandlerBuilder } from "./routeHandlerBuilder";

// Errors (single source)
export {
  BadRequestError,
  ConflictError,
  CsrfError,
  ForbiddenError,
  HttpError,
  MethodNotAllowedError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from "./errors";

// Error handling
export { createErrorHandler, handleServerError } from "./handleServerError";

// Middlewares
export {
  authMiddleware,
  optionalAuthMiddleware,
  requireRoleMiddleware,
  requireVerifiedEmailMiddleware,
  type AuthContext,
  type OptionalAuthContext,
} from "./middlewares/auth";
export { csrfMiddleware } from "./middlewares/csrf";
export {
  rateLimitMiddleware,
  type RateLimitContext,
  type RateLimitOptions,
} from "./middlewares/rateLimit";

// Adapters
export type {
  Infer,
  InferIn,
  Schema,
  ValidationAdapter,
  ValidationIssue,
  ValidationResult,
} from "./adapters/types";
export { valibotAdapter } from "./adapters/valibot";
export { zodAdapter } from "./adapters/zod";

// Types
export type {
  HandlerFunction,
  HandlerServerErrorFn,
  HttpMethod,
  Middleware,
  MiddlewareContext,
  OriginalRouteHandler,
} from "./types";
