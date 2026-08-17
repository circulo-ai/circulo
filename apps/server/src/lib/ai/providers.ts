import { env } from "@/lib/env";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { customProvider, type LanguageModel } from "ai";

export const defaultModel =
  env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-4o-mini";

export const openRouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  baseURL: env.OPENROUTER_BASE_URL,
  headers: {
    ...(env.OPENROUTER_HTTP_REFERER
      ? { "HTTP-Referer": env.OPENROUTER_HTTP_REFERER }
      : {}),
    ...(env.OPENROUTER_APP_TITLE
      ? { "X-Title": env.OPENROUTER_APP_TITLE }
      : {}),
  },
});

export function getLanguageModel(modelId = defaultModel): LanguageModel {
  return openRouter(modelId, { usage: { include: true } });
}

// Compatibility aliases for artifact and legacy callers. New model IDs are
// resolved dynamically with getLanguageModel so the catalog is not hardcoded.
export const myProvider: ReturnType<typeof customProvider> = customProvider({
  languageModels: {
    "chat-model": getLanguageModel(),
    "chat-model-reasoning": getLanguageModel(),
    "title-model": getLanguageModel(),
    "artifact-model": getLanguageModel(),
  },
});

export const supportingLanguageModels = {} as Record<
  string,
  {
    gateway: LanguageModel;
    capabilities: {
      imageInput: boolean;
      objectGeneration: boolean;
      toolUsage: boolean;
      toolStreaming: boolean;
    };
  }
>;

export type SupportedModels = string;
export const LLM_MODELS: SupportedModels[] = [defaultModel];
