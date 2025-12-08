import z from "zod";

/**
 * Helper to parse or throw
 */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  data: unknown,
): z.infer<T> {
  return schema.parse(data);
}
