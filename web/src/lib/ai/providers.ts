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
    }
  },
} as const

export const LLM_MODELS = Object.keys(supportingLanguageModels);

export type modelID = keyof typeof supportingLanguageModels;

export const myProvider = customProvider({
  languageModels: {
    ...Object.fromEntries(
      (Object.keys(supportingLanguageModels) as Array<keyof typeof supportingLanguageModels>).map(
        key => [key, supportingLanguageModels[key].gateway]
      )
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

export const defaultModel: modelID = "gemini-2.5-flash";