import { google } from "@ai-sdk/google";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";

const supportingLanguageModels = {
  "gemini-2.5-flash": {
    gateway: google("gemini-2.5-flash"),
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
  supportingLanguageModels,
) as SupportedModels[];

export const myProvider = customProvider({
  languageModels: {
    ...Object.fromEntries(
      (
        Object.keys(supportingLanguageModels) as Array<
          keyof typeof supportingLanguageModels
        >
      ).map((key) => [key, supportingLanguageModels[key].gateway]),
    ),
    "chat-model": google("gemini-2.5-flash"),
    "chat-model-reasoning": wrapLanguageModel({
      model: google("gemini-2.5-flash"),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    }),
    "title-model": google("gemini-2.5-flash"),
    "artifact-model": google("gemini-2.5-flash"),
  },
});

export const defaultModel: SupportedModels = "gemini-2.5-flash";
