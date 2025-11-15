import { google } from "@ai-sdk/google";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";

export const myProvider = customProvider({
  languageModels: {
    "chat-model": google("gemini-2.5-flash"),
    "chat-model-reasoning": wrapLanguageModel({
      model: google("gemini-2.5-flash"),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    }),
    "title-model": google("gemini-2.5-flash"),
    "artifact-model": google("gemini-2.5-flash"),
  },
});
