import { Infer, Schema, ValidationAdapter } from "./adapters/types";
import { zodAdapter } from "./adapters/zod";
import {
  HandlerFunction,
  HandlerServerErrorFn,
  HttpMethod,
  MethodNotAllowedError,
  Middleware,
  OriginalRouteHandler,
  ValidationError,
} from "./types";

type BuilderConfig<
  TParams extends Schema,
  TQuery extends Schema,
  TBody extends Schema,
  TOutput extends Schema,
> = {
  paramsSchema?: TParams;
  querySchema?: TQuery;
  bodySchema?: TBody;
  outputSchema?: TOutput;
  methods?: HttpMethod[];
};

type BuilderOptions<
  TParams extends Schema,
  TQuery extends Schema,
  TBody extends Schema,
  TOutput extends Schema,
  TContext extends Record<string, unknown>,
> = {
  config?: BuilderConfig<TParams, TQuery, TBody, TOutput>;
  middlewares?: Middleware<any, any, any, any, any>[];
  handleServerError?: HandlerServerErrorFn;
  validationAdapter?: ValidationAdapter;
  contextType: TContext;
};

export class RouteHandlerBuilder<
  TParams extends Schema = Schema,
  TQuery extends Schema = Schema,
  TBody extends Schema = Schema,
  TOutput extends Schema = Schema,
  TContext extends Record<string, unknown> = Record<string, unknown>,
> {
  private config: BuilderConfig<TParams, TQuery, TBody, TOutput>;
  private middlewares: Middleware<any, any, any, any, any>[];
  private handleServerError?: HandlerServerErrorFn;
  private validationAdapter: ValidationAdapter;
  private contextType: TContext;

  constructor(
    options: BuilderOptions<TParams, TQuery, TBody, TOutput, TContext>,
  ) {
    this.config = options.config ?? {};
    this.middlewares = options.middlewares ?? [];
    this.handleServerError = options.handleServerError;
    this.validationAdapter = options.validationAdapter ?? zodAdapter();
    this.contextType = options.contextType;
  }

  private clone<
    NewParams extends Schema = TParams,
    NewQuery extends Schema = TQuery,
    NewBody extends Schema = TBody,
    NewOutput extends Schema = TOutput,
    NewContext extends Record<string, unknown> = TContext,
  >(
    overrides: Partial<
      BuilderOptions<NewParams, NewQuery, NewBody, NewOutput, NewContext>
    > = {},
  ): RouteHandlerBuilder<NewParams, NewQuery, NewBody, NewOutput, NewContext> {
    return new RouteHandlerBuilder({
      config: (overrides.config ?? this.config) as BuilderConfig<
        NewParams,
        NewQuery,
        NewBody,
        NewOutput
      >,
      middlewares: overrides.middlewares ?? this.middlewares,
      handleServerError: overrides.handleServerError ?? this.handleServerError,
      validationAdapter: overrides.validationAdapter ?? this.validationAdapter,
      contextType: (overrides.contextType ?? this.contextType) as NewContext,
    });
  }

  /** Restrict allowed HTTP methods */
  methods<M extends HttpMethod[]>(...methods: M) {
    return this.clone({ config: { ...this.config, methods } });
  }

  /** Define the schema for route params */
  params<T extends Schema>(schema: T) {
    return this.clone<T, TQuery, TBody, TOutput, TContext>({
      config: { ...this.config, paramsSchema: schema },
    });
  }

  /** Define the schema for query parameters */
  query<T extends Schema>(schema: T) {
    return this.clone<TParams, T, TBody, TOutput, TContext>({
      config: { ...this.config, querySchema: schema },
    });
  }

  /** Define the schema for request body */
  body<T extends Schema>(schema: T) {
    return this.clone<TParams, TQuery, T, TOutput, TContext>({
      config: { ...this.config, bodySchema: schema },
    });
  }

  /** Define the schema for response output validation */
  output<T extends Schema>(schema: T) {
    return this.clone<TParams, TQuery, TBody, T, TContext>({
      config: { ...this.config, outputSchema: schema },
    });
  }

  /** Add middleware that receives request and current context */
  use<TOut extends Record<string, unknown>>(
    middleware: Middleware<
      TContext,
      TOut,
      Infer<TParams>,
      Infer<TQuery>,
      Infer<TBody>
    >,
  ) {
    return this.clone<TParams, TQuery, TBody, TOutput, TContext & TOut>({
      middlewares: [...this.middlewares, middleware],
      contextType: {} as TContext & TOut,
    });
  }

  /** Create the final route handler */
  handler(
    handler: HandlerFunction<
      Infer<TParams>,
      Infer<TQuery>,
      Infer<TBody>,
      TContext,
      Infer<TOutput>
    >,
  ): OriginalRouteHandler {
    return async (request, context): Promise<Response> => {
      try {
        // Method validation
        if (this.config.methods?.length) {
          const method = request.method as HttpMethod;
          if (!this.config.methods.includes(method)) {
            throw new MethodNotAllowedError(method, this.config.methods);
          }
        }

        const url = new URL(request.url);

        // Handle async params (Next.js 15+)
        const rawParams = context?.params;
        const params =
          rawParams instanceof Promise ? await rawParams : (rawParams ?? {});

        // Parse query
        const query = Object.fromEntries(url.searchParams.entries());

        // Parse body safely
        let body: unknown = {};
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
          try {
            const text = await request.text();
            if (text) body = JSON.parse(text);
          } catch {
            // Empty or invalid body, keep as empty object
          }
        }

        // Validate params
        let validatedParams = params;
        if (this.config.paramsSchema) {
          const result = await this.validationAdapter.validate(
            this.config.paramsSchema,
            params,
          );
          if (!result.success)
            throw new ValidationError("params", result.issues);
          validatedParams = result.data as typeof params;
        }

        // Validate query
        let validatedQuery = query;
        if (this.config.querySchema) {
          const result = await this.validationAdapter.validate(
            this.config.querySchema,
            query,
          );
          if (!result.success)
            throw new ValidationError("query", result.issues);
          validatedQuery = result.data as typeof query;
        }

        // Validate body
        let validatedBody = body;
        if (this.config.bodySchema) {
          const result = await this.validationAdapter.validate(
            this.config.bodySchema,
            body,
          );
          if (!result.success) throw new ValidationError("body", result.issues);
          validatedBody = result.data as typeof body;
        }

        // Execute middlewares with context
        let middlewareData: TContext = {} as TContext;
        for (const middleware of this.middlewares) {
          const result = await middleware(request, {
            params: validatedParams as Infer<TParams>,
            query: validatedQuery as Infer<TQuery>,
            body: validatedBody as Infer<TBody>,
            data: middlewareData,
          });
          middlewareData = { ...middlewareData, ...result };
        }

        // Call handler
        const output = await handler(request, {
          params: validatedParams as Infer<TParams>,
          query: validatedQuery as Infer<TQuery>,
          body: validatedBody as Infer<TBody>,
          data: middlewareData,
        });

        // Validate output if schema provided
        if (this.config.outputSchema) {
          const result = await this.validationAdapter.validate(
            this.config.outputSchema,
            output,
          );
          if (!result.success)
            throw new ValidationError("output", result.issues);
          return Response.json(result.data);
        }

        // Return response
        if (output instanceof Response) return output;
        return Response.json(output);
      } catch (error) {
        if (error instanceof ValidationError) return error.toResponse();
        if (error instanceof MethodNotAllowedError) return error.toResponse();
        if (this.handleServerError)
          return this.handleServerError(error as Error);

        console.error("[SafeRoute Error]", error);
        return Response.json(
          { message: "Internal server error" },
          { status: 500 },
        );
      }
    };
  }
}
