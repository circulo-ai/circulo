import type { z } from "zod";
import type { ValidationAdapter, ValidationResult } from "./types";

function isZodSchema(schema: unknown): schema is z.ZodType {
  return (
    schema !== null &&
    typeof schema === "object" &&
    "safeParseAsync" in schema &&
    typeof (schema as z.ZodType).safeParseAsync === "function"
  );
}

class ZodAdapter implements ValidationAdapter {
  async validate(
    schema: unknown,
    data: unknown,
  ): Promise<ValidationResult<unknown>> {
    if (!isZodSchema(schema)) {
      throw new Error(
        "ZodAdapter: Invalid schema type. Expected a Zod schema.",
      );
    }

    const result = await schema.safeParseAsync(data);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return {
      success: false,
      issues: result.error.issues.map(({ message, path }) => ({
        message,
        path,
      })),
    };
  }
}

export function zodAdapter(): ValidationAdapter {
  return new ZodAdapter();
}
