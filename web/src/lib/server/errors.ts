import { HttpError } from "@/lib/server/types";

export const Errors = {
  badRequest: (message: string, details?: any) =>
    new HttpError(400, "BAD_REQUEST", message, details),

  unauthorized: (message = "Unauthorized") =>
    new HttpError(401, "UNAUTHORIZED", message),

  forbidden: (message = "Forbidden") =>
    new HttpError(403, "FORBIDDEN", message),

  notFound: (message = "Resource not found") =>
    new HttpError(404, "NOT_FOUND", message),

  conflict: (message: string, details?: any) =>
    new HttpError(409, "CONFLICT", message, details),

  unprocessable: (message: string, details?: any) =>
    new HttpError(422, "UNPROCESSABLE_ENTITY", message, details),

  internal: (message = "Internal server error") =>
    new HttpError(500, "INTERNAL_ERROR", message),

  notImplemented: (message = "Not implemented") =>
    new HttpError(501, "NOT_IMPLEMENTED", message),
};
