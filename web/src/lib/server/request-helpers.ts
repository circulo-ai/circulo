import { Errors } from "@/lib/server/errors";
import { RouteContext } from "@/lib/server/types";
import { NextRequest } from "next/server";

export const parseBody = async <T = any>(req: NextRequest): Promise<T> => {
  try {
    return (await req.json()) as T;
  } catch {
    throw Errors.badRequest("Invalid JSON in request body");
  }
};

export const parseQuery = (req: NextRequest): Record<string, string> => {
  const { searchParams } = new URL(req.url);
  const query: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return query;
};

export const getParam = (context: RouteContext, key: string): string => {
  const value = context.params?.[key];
  if (!value) {
    throw Errors.badRequest(`Missing required parameter: ${key}`);
  }
  return value;
};
