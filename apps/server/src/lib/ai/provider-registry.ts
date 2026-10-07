import { aiProviderCredential, db } from "@/db";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/server-utils";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type {
  AiProviderDefinition,
  AiProviderId,
  AiProviderModel,
} from "@circulo-ai/types";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { and, eq } from "drizzle-orm";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";

export const AI_PROVIDER_DEFINITIONS: readonly AiProviderDefinition[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access many providers through one OpenRouter API key.",
    defaultBaseUrl: OPENROUTER_BASE_URL,
    capabilities: ["chat", "tools", "vision", "embeddings"],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Use your OpenAI API key directly.",
    defaultBaseUrl: OPENAI_BASE_URL,
    capabilities: ["chat", "tools", "vision", "embeddings", "audio-input"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Use your Anthropic API key directly.",
    defaultBaseUrl: ANTHROPIC_BASE_URL,
    capabilities: ["chat", "tools", "vision"],
  },
  {
    id: "google",
    name: "Google AI",
    description: "Use your Google AI Studio API key directly.",
    defaultBaseUrl: GOOGLE_BASE_URL,
    capabilities: ["chat", "tools", "vision", "embeddings"],
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Run local models through an Ollama installation.",
    defaultBaseUrl: OLLAMA_BASE_URL,
    local: true,
    capabilities: ["chat", "tools", "vision"],
  },
  {
    id: "openai-compatible",
    name: "OpenAI-compatible",
    description: "Connect any provider exposing the OpenAI-compatible API.",
    requiresBaseUrl: true,
    capabilities: ["chat", "tools", "vision", "embeddings"],
  },
] as const;

export type ResolvedProviderCredential = {
  providerId: AiProviderId;
  apiKey: string;
  baseUrl?: string;
};

export type ProviderModelQuery = {
  providerId: AiProviderId;
  userId?: string;
  refresh?: boolean;
  toolsOnly?: boolean;
  apiKey?: string;
  baseUrl?: string;
};

function getDefinition(providerId: AiProviderId): AiProviderDefinition {
  const definition = AI_PROVIDER_DEFINITIONS.find(
    (candidate) => candidate.id === providerId,
  );
  if (!definition) throw new Error(`Unsupported AI provider: ${providerId}`);
  return definition;
}

export async function getUserProviderCredential(
  userId: string,
  providerId: AiProviderId,
): Promise<ResolvedProviderCredential | null> {
  const row = await db.query.aiProviderCredential.findFirst({
    where: and(
      eq(aiProviderCredential.userId, userId),
      eq(aiProviderCredential.providerId, providerId),
      eq(aiProviderCredential.enabled, true),
    ),
  });
  if (!row) return null;

  try {
    const { decrypted } = await decryptSecret(row.encryptedApiKey);
    return {
      providerId,
      apiKey: decrypted,
      ...(row.baseUrl
        ? { baseUrl: row.baseUrl }
        : providerId === "ollama"
          ? { baseUrl: `${env.OLLAMA_URL.replace(/\/$/, "")}/v1` }
          : {}),
    };
  } catch {
    throw new Error(
      `${getDefinition(providerId).name} credential could not be decrypted. Remove it and connect the provider again.`,
    );
  }
}

export async function requireProviderCredential(
  providerId: AiProviderId,
  userId?: string,
): Promise<ResolvedProviderCredential> {
  if (userId) {
    const credential = await getUserProviderCredential(userId, providerId);
    if (credential) return credential;
  }

  const serverCredential = getServerCredential(providerId);
  if (serverCredential) return serverCredential;

  throw new Error(
    `${getDefinition(providerId).name} is not configured for this account. Add your API key in Settings → AI providers.`,
  );
}

function getServerCredential(
  providerId: AiProviderId,
): ResolvedProviderCredential | null {
  if (providerId === "openrouter" && env.OPENROUTER_API_KEY) {
    return {
      providerId,
      apiKey: env.OPENROUTER_API_KEY,
      baseUrl: env.OPENROUTER_BASE_URL ?? OPENROUTER_BASE_URL,
    };
  }
  if (providerId === "google" && env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { providerId, apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY };
  }
  if (providerId === "openai" && env.OPENAI_API_KEY) {
    return { providerId, apiKey: env.OPENAI_API_KEY };
  }
  if (providerId === "anthropic" && env.ANTHROPIC_API_KEY) {
    return { providerId, apiKey: env.ANTHROPIC_API_KEY };
  }
  if (providerId === "ollama" && env.OLLAMA_URL) {
    return {
      providerId,
      apiKey: env.OLLAMA_API_KEY ?? "ollama",
      baseUrl: `${env.OLLAMA_URL.replace(/\/$/, "")}/v1`,
    };
  }
  return null;
}

export async function resolveLanguageModel(params: {
  providerId?: AiProviderId | null;
  modelId?: string | null;
  userId?: string;
}): Promise<LanguageModel> {
  const providerId = params.providerId ?? "openrouter";
  const modelId = params.modelId?.trim();
  if (!modelId) throw new Error("An AI model is required");
  const credential = await requireProviderCredential(providerId, params.userId);
  const definition = getDefinition(providerId);
  if (definition.requiresBaseUrl && !credential.baseUrl) {
    throw new Error(
      `${definition.name} requires an API base URL. Configure it in Settings → AI providers.`,
    );
  }

  switch (providerId) {
    case "openrouter":
      return createOpenRouter({
        apiKey: credential.apiKey,
        baseURL: credential.baseUrl ?? OPENROUTER_BASE_URL,
      })(modelId, { usage: { include: true } });
    case "openai":
    case "ollama":
    case "openai-compatible":
      return createOpenAI({
        apiKey: credential.apiKey,
        baseURL:
          credential.baseUrl ??
          (providerId === "ollama" ? OLLAMA_BASE_URL : OPENAI_BASE_URL),
      })(modelId);
    case "anthropic":
      return createAnthropic({
        apiKey: credential.apiKey,
        baseURL: credential.baseUrl ?? ANTHROPIC_BASE_URL,
      })(modelId);
    case "google":
      return createGoogleGenerativeAI({
        apiKey: credential.apiKey,
        baseURL: credential.baseUrl,
      })(modelId);
  }
}

export async function listProviderModels(
  query: ProviderModelQuery,
): Promise<AiProviderModel[]> {
  const credential = query.apiKey
    ? {
        apiKey: query.apiKey,
        baseUrl: query.baseUrl,
      }
    : await requireProviderCredential(query.providerId, query.userId);

  const models = await fetchProviderModels(query.providerId, credential);

  return query.toolsOnly
    ? models.filter((candidate) => candidate.supportsTools !== false)
    : models;
}

async function fetchProviderModels(
  providerId: AiProviderId,
  credential: Pick<ResolvedProviderCredential, "apiKey" | "baseUrl">,
): Promise<AiProviderModel[]> {
  if (providerId === "google") return fetchGoogleModels(credential);

  if (providerId === "anthropic") return fetchAnthropicModels(credential);

  const baseUrl = (
    credential.baseUrl ??
    (providerId === "openrouter"
      ? OPENROUTER_BASE_URL
      : providerId === "ollama"
        ? OLLAMA_BASE_URL
        : OPENAI_BASE_URL)
  ).replace(/\/$/, "");
  const modelsPath =
    providerId === "openrouter" ? "/models?output_modalities=text" : "/models";
  const response = await fetch(`${baseUrl}${modelsPath}`, {
    headers: {
      Authorization: `Bearer ${credential.apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw providerRequestError(providerId, response.status);

  const payload = (await response.json()) as {
    data?: Array<{
      id?: unknown;
      name?: unknown;
      description?: unknown;
      architecture?: { input_modalities?: unknown[] };
      supported_parameters?: unknown[];
    }>;
  };
  return (payload.data ?? [])
    .filter(
      (candidate) =>
        typeof candidate.id === "string" &&
        candidate.id !== "openrouter/free" &&
        isGenerationModel(candidate.id),
    )
    .map((candidate) => ({
      id: candidate.id as string,
      name:
        typeof candidate.name === "string"
          ? candidate.name
          : (candidate.id as string),
      ...(typeof candidate.description === "string"
        ? { description: candidate.description }
        : {}),
      supportsTools:
        providerId === "openrouter"
          ? candidate.supported_parameters?.includes("tools") === true ||
            candidate.id === "openrouter/free"
          : true,
      ...(candidate.architecture?.input_modalities?.includes("image")
        ? { supportsVision: true }
        : {}),
    }))
    .concat(
      providerId === "openrouter"
        ? [
            {
              id: "openrouter/free",
              name: "OpenRouter Free Router",
              description:
                "Automatically routes requests to an available free model.",
              supportsTools: true,
              supportsVision: true,
            },
          ]
        : [],
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function fetchAnthropicModels(
  credential: Pick<ResolvedProviderCredential, "apiKey" | "baseUrl">,
): Promise<AiProviderModel[]> {
  const baseUrl = (credential.baseUrl ?? ANTHROPIC_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      "x-api-key": credential.apiKey,
      "anthropic-version": "2023-06-01",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw providerRequestError("anthropic", response.status);

  const payload = (await response.json()) as {
    data?: Array<{
      id?: unknown;
      display_name?: unknown;
    }>;
  };
  return (payload.data ?? [])
    .filter((candidate) => typeof candidate.id === "string")
    .map((candidate) => ({
      id: candidate.id as string,
      name:
        typeof candidate.display_name === "string"
          ? candidate.display_name
          : (candidate.id as string),
      supportsTools: true,
      supportsVision: true,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function isGenerationModel(modelId: string) {
  const normalized = modelId.toLowerCase();
  return ![
    "embedding",
    "moderation",
    "whisper",
    "tts",
    "dall-e",
    "transcription",
    "rerank",
  ].some((term) => normalized.includes(term));
}

async function fetchGoogleModels(
  credential: Pick<ResolvedProviderCredential, "apiKey" | "baseUrl">,
): Promise<AiProviderModel[]> {
  const baseUrl = (credential.baseUrl ?? GOOGLE_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      "x-goog-api-key": credential.apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw providerRequestError("google", response.status);

  const payload = (await response.json()) as {
    models?: Array<{
      name?: unknown;
      displayName?: unknown;
      description?: unknown;
      supportedGenerationMethods?: unknown;
    }>;
  };
  return (payload.models ?? [])
    .filter(
      (candidate) =>
        typeof candidate.name === "string" &&
        Array.isArray(candidate.supportedGenerationMethods) &&
        candidate.supportedGenerationMethods.includes("generateContent"),
    )
    .map((candidate) => {
      const name = candidate.name as string;
      const id = name.replace(/^models\//, "");
      return {
        id,
        name:
          typeof candidate.displayName === "string"
            ? candidate.displayName
            : id,
        ...(typeof candidate.description === "string"
          ? { description: candidate.description }
          : {}),
        supportsTools: true,
        supportsVision: id.includes("gemini"),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function providerRequestError(providerId: AiProviderId, status: number) {
  return new Error(
    `${getDefinition(providerId).name} rejected the request (HTTP ${status}). Check the API key and endpoint.`,
  );
}

export function publicProviderDefinitions() {
  return AI_PROVIDER_DEFINITIONS;
}

export function getDefaultModelForProvider(providerId: AiProviderId): string {
  switch (providerId) {
    case "openrouter":
      return env.OPENROUTER_DEFAULT_MODEL ?? "openai/gpt-4o-mini";
    case "openai":
    case "openai-compatible":
      return "gpt-4o-mini";
    case "anthropic":
      return "claude-sonnet-4-5";
    case "google":
      return "gemini-2.5-flash";
    case "ollama":
      return "llama3.2";
  }
}

export function redactProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|key|token)=([^\s&]+)/gi, "$1=[redacted]")
    .slice(0, 500);
}
