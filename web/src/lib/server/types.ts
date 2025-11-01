import { Session } from "@/lib/auth";
import { NextRequest } from "next/server";

export type ApiHandler<
  T = any,
  TContext extends RouteContext = RouteContext,
> = (req: NextRequest, context: TContext) => Promise<ApiResponse<T>>;

export type StreamingApiHandler<TContext extends RouteContext = RouteContext> =
  (req: NextRequest, context: TContext) => Promise<Response>;

export type Middleware<TContext extends RouteContext = RouteContext> = (
  req: NextRequest,
  context: TContext,
  next: () => Promise<ApiResponse>,
) => Promise<ApiResponse>;

export interface RouteContext {
  params?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface AuthenticatedContext extends RouteContext {
  session: Session;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: Record<string, any>;
}

export interface ApiError {
  message: string;
  code: string;
  details?: any;
  statusCode: number;
}

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
