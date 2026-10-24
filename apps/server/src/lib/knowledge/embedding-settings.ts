import { db, embeddingPreference } from "@/db";
import { getUserProviderCredential } from "@/lib/ai/provider-registry";
import { env } from "@/lib/env";
import {
  DEFAULT_EMBEDDING_PREFERENCES,
  embeddingPreferencesSchema,
  type EmbeddingPreferences,
} from "@circulo-ai/types";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import type {
  EmbeddingProviderConfig,
  EmbeddingProviderId,
} from "./embedding-provider";

const DEFAULT_PROVIDER_BASE_URL: Record<EmbeddingProviderId, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta",
};

export type ResolvedEmbeddingConfig = EmbeddingProviderConfig & {
  provider: EmbeddingProviderId;
  identity: string;
  preferences: EmbeddingPreferences;
};

export async function getEmbeddingPreferences(
  organizationId?: string,
): Promise<EmbeddingPreferences> {
  const seed = embeddingPreferencesSchema.safeParse({
    model:
      env.CIRCULO_EMBEDDING_MODEL?.replace(/^(?:openai|google)\//, "") ??
      DEFAULT_EMBEDDING_PREFERENCES.model,
  });
  const defaults = seed.success ? seed.data : DEFAULT_EMBEDDING_PREFERENCES;
  if (!organizationId) return defaults;
  await db
    .insert(embeddingPreference)
    .values({ organizationId, config: defaults })
    .onConflictDoNothing();
  const row = await db.query.embeddingPreference.findFirst({
    where: eq(embeddingPreference.organizationId, organizationId),
  });
  return embeddingPreferencesSchema.parse(row?.config ?? defaults);
}

function serverCredential(provider: EmbeddingProviderId) {
  switch (provider) {
    case "openrouter":
      return env.OPENROUTER_API_KEY
        ? {
            apiKey: env.OPENROUTER_API_KEY,
            baseUrl:
              env.OPENROUTER_BASE_URL ?? DEFAULT_PROVIDER_BASE_URL.openrouter,
          }
        : null;
    case "openai":
      return env.OPENAI_API_KEY ? { apiKey: env.OPENAI_API_KEY } : null;
    case "google":
      return env.GOOGLE_GENERATIVE_AI_API_KEY
        ? { apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY }
        : null;
  }
}

export async function resolveEmbeddingConfig(
  userId: string | undefined,
  preferences: EmbeddingPreferences,
): Promise<ResolvedEmbeddingConfig | null> {
  if (!preferences.enabled) return null;
  const modelUsesGoogle = preferences.model.startsWith("gemini-embedding-");
  const providers: EmbeddingProviderId[] =
    preferences.provider === "auto"
      ? modelUsesGoogle
        ? ["google"]
        : ["openrouter", "openai"]
      : [preferences.provider];
  const credentials = await Promise.all(
    providers.map((provider) =>
      userId
        ? getUserProviderCredential(userId, provider)
        : Promise.resolve(null),
    ),
  );

  // Prefer a user's explicitly connected provider before using server-level
  // credentials. Automatic mode preserves the OpenRouter → OpenAI fallback.
  let selectedIndex = credentials.findIndex((credential) =>
    Boolean(credential?.apiKey),
  );
  let useServerCredential = false;
  if (selectedIndex < 0) {
    selectedIndex = providers.findIndex((provider) =>
      Boolean(serverCredential(provider)?.apiKey),
    );
    useServerCredential = selectedIndex >= 0;
  }
  if (selectedIndex < 0) return null;

  const provider = providers[selectedIndex]!;
  const credential = useServerCredential ? null : credentials[selectedIndex];
  const server = useServerCredential ? serverCredential(provider) : null;
  const apiKey = credential?.apiKey ?? server?.apiKey;
  if (!apiKey) return null;

  const baseUrl = (
    credential?.baseUrl ??
    server?.baseUrl ??
    DEFAULT_PROVIDER_BASE_URL[provider]
  ).replace(/\/$/, "");
  const model =
    provider === "openrouter"
      ? `openai/${preferences.model}`
      : preferences.model;
  const identity = `${provider}:${model}:1536:${createHash("sha256").update(baseUrl).digest("hex").slice(0, 12)}`;
  return { provider, apiKey, baseUrl, model, identity, preferences };
}
