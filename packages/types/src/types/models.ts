/**
 * OpenRouter model identifiers are intentionally data, not a TypeScript enum.
 * The catalog changes independently of application releases and is loaded at
 * runtime from OpenRouter's models API.
 */
export type SupportedModels = string;

export const defaultModel: SupportedModels = "openai/gpt-4o-mini";

// Kept for backwards-compatible consumers that need a non-empty z.enum tuple.
// Runtime model validation is performed against the OpenRouter catalog.
export const LLM_MODELS = [defaultModel] as [
  SupportedModels,
  ...SupportedModels[],
];
