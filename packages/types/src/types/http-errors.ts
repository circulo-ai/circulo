export abstract class HttpError extends Error {
  abstract readonly statusCode: number;

  toResponse(): Response {
    return Response.json(
      { message: this.message },
      { status: this.statusCode },
    );
  }
}

export class BadRequestError extends HttpError {
  readonly statusCode = 400;
  constructor(message = "Bad request") {
    super(message);
    this.name = "BadRequestError";
  }
}

export class UnauthorizedError extends HttpError {
  readonly statusCode = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends HttpError {
  readonly statusCode = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends HttpError {
  readonly statusCode = 404;
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class MethodNotAllowedError extends HttpError {
  readonly statusCode = 405;

  constructor(
    public readonly method: string,
    public readonly allowedMethods: string[],
  ) {
    super(`Method ${method} not allowed`);
    this.name = "MethodNotAllowedError";
  }

  toResponse(): Response {
    return new Response(null, {
      status: 405,
      headers: { Allow: this.allowedMethods.join(", ") },
    });
  }
}

export class ConflictError extends HttpError {
  readonly statusCode = 409;
  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
  }
}

export class RateLimitError extends HttpError {
  readonly statusCode = 429;

  constructor(
    public readonly retryAfter: number,
    message = "Too many requests",
  ) {
    super(message);
    this.name = "RateLimitError";
  }

  toResponse(): Response {
    return new Response(JSON.stringify({ message: this.message }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(this.retryAfter),
      },
    });
  }
}

export class ValidationError extends HttpError {
  readonly statusCode = 400;

  constructor(
    public readonly type: "params" | "query" | "body" | "output",
    public readonly issues: Array<{
      message: string;
      path?: Array<string | number | symbol>;
    }>,
  ) {
    super(`Invalid ${type}`);
    this.name = "ValidationError";
  }

  toResponse(): Response {
    return Response.json(
      { message: this.message, errors: this.issues },
      { status: 400 },
    );
  }
}

export class CsrfError extends ForbiddenError {
  constructor(message = "CSRF validation failed") {
    super(message);
    this.name = "CsrfError";
  }
}
