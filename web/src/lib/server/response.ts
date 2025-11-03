import { ApiResponse, HttpError, RouteContext } from "@/lib/server/types";
import { NextResponse } from "next/server";

export const ApiResponseBuilder = {
  success: <T>(data: T, metadata?: Record<string, any>): ApiResponse<T> => ({
    success: true,
    data,
    metadata,
  }),

  error: (error: HttpError | Error): ApiResponse => {
    if (error instanceof HttpError) {
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
          statusCode: error.statusCode,
        },
      };
    }

    return {
      success: false,
      error: {
        message: error.message || "Internal server error",
        code: "INTERNAL_ERROR",
        statusCode: 500,
      },
    };
  },

  toNextResponse: (
    response: ApiResponse,
    context?: RouteContext,
  ): NextResponse => {
    const statusCode =
      response.error?.statusCode || (response.success ? 200 : 500);
    const nextResponse = NextResponse.json(response, { status: statusCode });

    // Add rate limit headers if available
    if (context?.metadata?.rateLimit) {
      const { limit, remaining, reset } = context.metadata.rateLimit;
      nextResponse.headers.set("X-RateLimit-Limit", limit.toString());
      nextResponse.headers.set("X-RateLimit-Remaining", remaining.toString());
      nextResponse.headers.set("X-RateLimit-Reset", reset.toString());
    }

    return nextResponse;
  },
};
