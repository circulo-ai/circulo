import { env } from "@/lib/env";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type OpenRouterPricing = Record<string, string>;

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  canonical_slug?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
    modality?: string;
  };
  pricing?: OpenRouterPricing;
  supported_parameters?: string[];
  supported_voices?: string[] | null;
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
}

export const OPENROUTER_FREE_MODEL: OpenRouterModel = {
  id: "openrouter/free",
  name: "OpenRouter Free Router",
  description: "Automatically routes requests to an available free model.",
  architecture: {
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
  },
  pricing: { prompt: "0", completion: "0" },
};

export interface OpenRouterUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  costDetails?: { upstreamInferenceCost?: number };
}

let modelsCache: { expiresAt: number; data: OpenRouterModel[] } | undefined;

function getBaseUrl() {
  return (env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL).replace(
    /\/$/,
    "",
  );
}

async function openRouterRequest<T>(path: string): Promise<T> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      Accept: "application/json",
      ...(env.OPENROUTER_HTTP_REFERER
        ? { "HTTP-Referer": env.OPENROUTER_HTTP_REFERER }
        : {}),
      ...(env.OPENROUTER_APP_TITLE
        ? { "X-Title": env.OPENROUTER_APP_TITLE }
        : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter request failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  return (await response.json()) as T;
}

export async function listOpenRouterModels({
  refresh = false,
  toolsOnly = false,
}: {
  refresh?: boolean;
  toolsOnly?: boolean;
} = {}): Promise<OpenRouterModel[]> {
  if (!refresh && modelsCache && modelsCache.expiresAt > Date.now()) {
    return filterModels(modelsCache.data, toolsOnly);
  }

  const query = new URLSearchParams({ output_modalities: "text" });

  const result = await openRouterRequest<{ data: OpenRouterModel[] }>(
    `/models?${query.toString()}`,
  );
  const data = [
    OPENROUTER_FREE_MODEL,
    ...result.data.filter(
      (model) =>
        model.id && model.name && model.id !== OPENROUTER_FREE_MODEL.id,
    ),
  ];
  modelsCache = { data, expiresAt: Date.now() + 5 * 60_000 };
  return filterModels(data, toolsOnly);
}

function filterModels(models: OpenRouterModel[], toolsOnly: boolean) {
  if (!toolsOnly) return models;
  return models.filter(
    (model) =>
      model.id === OPENROUTER_FREE_MODEL.id ||
      model.supported_parameters?.includes("tools"),
  );
}

export function getOpenRouterFallbackModels(): OpenRouterModel[] {
  return [OPENROUTER_FREE_MODEL];
}

export async function getOpenRouterGeneration(id: string) {
  return openRouterRequest<{ data: Record<string, unknown> }>(
    `/generation?id=${encodeURIComponent(id)}`,
  );
}

export function readOpenRouterUsage(
  providerMetadata: unknown,
): OpenRouterUsage | undefined {
  if (!providerMetadata || typeof providerMetadata !== "object") return;

  const metadata = providerMetadata as {
    openrouter?: { usage?: OpenRouterUsage };
  };
  return metadata.openrouter?.usage;
}
