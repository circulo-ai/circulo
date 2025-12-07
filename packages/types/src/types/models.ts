export const supportingLanguageModels = {
  "gemini-2.5-flash": {
    capabilities: {
      imageInput: true,
      objectGeneration: true,
      toolUsage: true,
      toolStreaming: true,
    },
  },
} as const;

export type SupportedModels = keyof typeof supportingLanguageModels;

export const LLM_MODELS = Object.keys(
  supportingLanguageModels
) as SupportedModels[];

export const defaultModel: SupportedModels = "gemini-2.5-flash";
