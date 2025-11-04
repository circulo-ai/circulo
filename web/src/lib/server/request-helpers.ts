import { Errors } from "@/lib/server/errors";
import { RouteContext } from "@/lib/server/types";
import { NextRequest } from "next/server";

export const parseBody = async <T = any>(req: Request | NextRequest): Promise<T> => {
  try {
    return (await req.json()) as T;
  } catch {
    throw Errors.badRequest("Invalid JSON in request body");
  }
};

export const parseQuery = (req: Request | NextRequest): Record<string, string> => {
  const { searchParams } = new URL(req.url);
  const query: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
};

export const getParam = (context: RouteContext, key: string): string => {
  const raw = context.params?.[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw Errors.badRequest(`Missing required parameter: ${key}`);
  }
  return value;
};

export const getQueryParam = (
  req: Request | NextRequest,
  key: string,
  options?: { required?: boolean; default?: string },
): string | undefined => {
  const { searchParams } = new URL(req.url);
  const val = searchParams.get(key) ?? options?.default;
  if (options?.required && !val) {
    throw Errors.badRequest(`Missing required query parameter: ${key}`);
  }
  return val ?? undefined;
};
