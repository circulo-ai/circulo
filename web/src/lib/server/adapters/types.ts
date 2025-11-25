/* eslint-disable @typescript-eslint/no-explicit-any */
// Code inspired by https://github.com/decs/typeschema
import type {
  GenericSchema,
  GenericSchemaAsync,
  InferInput,
  InferOutput,
} from "valibot";
import type { z } from "zod";

export type IfInstalled<T> = any extends T ? never : T;

export type ZodSchema = IfInstalled<z.ZodType>;
export type ValibotSchema = IfInstalled<GenericSchema | GenericSchemaAsync>;

export type Schema = ZodSchema | ValibotSchema;

export type Infer<S> =
  S extends IfInstalled<z.ZodType>
    ? z.infer<S>
    : S extends IfInstalled<GenericSchema>
      ? InferOutput<S>
      : S extends IfInstalled<GenericSchemaAsync>
        ? InferOutput<S>
        : never;

export type InferIn<S> =
  S extends IfInstalled<z.ZodType>
    ? z.input<S>
    : S extends IfInstalled<GenericSchema>
      ? InferInput<S>
      : S extends IfInstalled<GenericSchemaAsync>
        ? InferInput<S>
        : never;

export type InferArray<BAS extends readonly Schema[]> = {
  [K in keyof BAS]: Infer<BAS[K]>;
};

export type InferInArray<BAS extends readonly Schema[]> = {
  [K in keyof BAS]: InferIn<BAS[K]>;
};

export type ValidationIssue = {
  message: string;
  path?: Array<string | number | symbol>;
};

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ValidationIssue[] };

// Non-generic interface - implementations handle type checking internally
export interface ValidationAdapter {
  validate(schema: unknown, data: unknown): Promise<ValidationResult<unknown>>;
}

// Helper type for typed validate calls
export type TypedValidate = <S extends Schema>(
  schema: S,
  data: unknown,
) => Promise<ValidationResult<Infer<S>>>;
