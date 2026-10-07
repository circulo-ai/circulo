import type { AiProviderId } from "@circulo-ai/types";

export type ModelPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
};

const BUILTIN_PRICING: Record<string, ModelPricing> = {
  "openai:gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "anthropic:claude-3-5-haiku": {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
  },
  "google:gemini-2.5-flash": {
    inputPerMillion: 0.3,
    outputPerMillion: 2.5,
  },
};

function configuredPricing(): Record<string, ModelPricing> {
  const raw = process.env.CIRCULO_MODEL_PRICING_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, ModelPricing>;
  } catch {
    return {};
  }
}

export function estimateProviderCost(params: {
  providerId: AiProviderId;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}): number {
  const pricing =
    configuredPricing()[`${params.providerId}:${params.modelId}`] ??
    BUILTIN_PRICING[`${params.providerId}:${params.modelId}`];
  if (!pricing) return 0;

  const inputTokens = Math.max(0, params.inputTokens ?? 0);
  const outputTokens = Math.max(0, params.outputTokens ?? 0);
  const cachedInputTokens = Math.min(
    inputTokens,
    Math.max(0, params.cachedInputTokens ?? 0),
  );
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  const inputCost = (uncachedInputTokens * pricing.inputPerMillion) / 1_000_000;
  const cachedCost =
    (cachedInputTokens *
      (pricing.cachedInputPerMillion ?? pricing.inputPerMillion)) /
    1_000_000;
  const outputCost = (outputTokens * pricing.outputPerMillion) / 1_000_000;
  return Number((inputCost + cachedCost + outputCost).toFixed(8));
}
