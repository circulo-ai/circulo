import { Schema } from "./adapters/types";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD";

export type MiddlewareContext<TParams, TQuery, TBody> = {
  params: TParams;
  query: TQuery;
  body: TBody;
};

export type Middleware<
  TIn extends Record<string, unknown> = Record<string, unknown>,
  TOut extends Record<string, unknown> = Record<string, unknown>,
  TParams = unknown,
  TQuery = unknown,
  TBody = unknown,
> = (
  request: Request,
  context: MiddlewareContext<TParams, TQuery, TBody> & { data: TIn },
) => Promise<TOut>;

export type HandlerFunction<TParams, TQuery, TBody, TContext, TOutput> = (
  request: Request,
  context: { params: TParams; query: TQuery; body: TBody; data: TContext },
) => Promise<TOutput> | TOutput;

export interface RouteHandlerBuilderConfig {
  paramsSchema?: Schema;
  querySchema?: Schema;
  bodySchema?: Schema;
  outputSchema?: Schema;
  methods?: HttpMethod[];
}

export type OriginalRouteHandler = (
  request: Request,
  context?: {
    params: Record<string, unknown> | Promise<Record<string, unknown>>;
  },
) => Promise<Response>;

export type HandlerServerErrorFn = (error: Error) => Response;

export type ValidationErrorResponse = {
  message: string;
  errors: Array<{
    message: string;
    path?: Array<string | number | symbol>;
  }>;
};

export class ValidationError extends Error {
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
      {
        message: this.message,
        errors: this.issues,
      } satisfies ValidationErrorResponse,
      { status: 400 },
    );
  }
}

export class MethodNotAllowedError extends Error {
  constructor(
    public readonly method: string,
    public readonly allowedMethods: HttpMethod[],
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
