import {
  getDefaultModelForProvider,
  resolveLanguageModel,
  type ResolvedProviderCredential,
} from "@/lib/ai/provider-registry";
import { env } from "@/lib/env";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { customProvider, type LanguageModel } from "ai";

export const defaultModel =
  env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-4o-mini";

/** Always-available last-resort model for orchestration control-plane calls. */
export const orchestrationFallbackModel = defaultModel;

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

export async function withModelFallback<T>(options: {
  userId?: string;
  providerId?: import("@circulo-ai/types").AiProviderId | null;
  modelId?: string | null;
  fallbackModelId?: string | null;
  run: (model: LanguageModel) => Promise<T>;
}): Promise<T> {
  const providerId = options.providerId ?? "openrouter";
  const providerFallbackModel = getProviderFallbackModel(providerId);
  const modelIds = [
    options.modelId?.trim(),
    options.fallbackModelId?.trim(),
    providerFallbackModel,
    ...(providerId === "openrouter" ? [orchestrationFallbackModel] : []),
  ].filter((modelId): modelId is string => Boolean(modelId));
  const uniqueModelIds = [...new Set(modelIds)];
  const errors: unknown[] = [];

  for (const modelId of uniqueModelIds) {
    try {
      return await options.run(
        await resolveLanguageModel({
          userId: options.userId,
          providerId: options.providerId,
          modelId,
        }),
      );
    } catch (error) {
      errors.push(error);
    }
  }

  throw new AggregateError(
    errors,
    `All orchestration models failed: ${uniqueModelIds.join(", ")}`,
  );
}

function getProviderFallbackModel(
  providerId: import("@circulo-ai/types").AiProviderId,
): string {
  return getDefaultModelForProvider(providerId);
}

export { resolveLanguageModel };
export type { ResolvedProviderCredential };

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
