import {
  type GenericSchema,
  type GenericSchemaAsync,
  getDotPath,
  safeParseAsync,
} from "valibot";
import type { ValidationAdapter, ValidationResult } from "./types";

type ValibotSchemaType = GenericSchema | GenericSchemaAsync;

function isValibotSchema(schema: unknown): schema is ValibotSchemaType {
  return (
    schema !== null &&
    typeof schema === "object" &&
    "async" in schema &&
    "~run" in schema
  );
}

class ValibotAdapter implements ValidationAdapter {
  async validate(
    schema: unknown,
    data: unknown,
  ): Promise<ValidationResult<unknown>> {
    if (!isValibotSchema(schema)) {
      throw new Error(
        "ValibotAdapter: Invalid schema type. Expected a Valibot schema.",
      );
    }

    const result = await safeParseAsync(schema, data);

    if (result.success) {
      return { success: true, data: result.output };
    }

    return {
      success: false,
      issues: result.issues.map((issue) => ({
        message: issue.message,
        path: getDotPath(issue)?.split("."),
      })),
    };
  }
}

export function valibotAdapter(): ValidationAdapter {
  return new ValibotAdapter();
}
