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

export async function getEmbeddingPreferences(
  organizationId?: string,
): Promise<EmbeddingPreferences> {
  const seed = embeddingPreferencesSchema.safeParse({
    model:
      env.CIRCULO_EMBEDDING_MODEL?.replace(/^openai\//, "") ??
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

export async function resolveEmbeddingConfig(
  userId: string | undefined,
  preferences: EmbeddingPreferences,
) {
  if (!preferences.enabled) return null;
  const providers =
    preferences.provider === "auto"
      ? (["openrouter", "openai"] as const)
      : [preferences.provider];
  const credentials = await Promise.all(
    providers.map((provider) =>
      userId
        ? getUserProviderCredential(userId, provider)
        : Promise.resolve(null),
    ),
  );
  const selectedIndex = credentials.findIndex((credential) =>
    Boolean(credential?.apiKey),
  );
  const selectedProvider =
    selectedIndex >= 0
      ? providers[selectedIndex]
      : providers.includes("openrouter") && env.OPENROUTER_API_KEY
        ? "openrouter"
        : null;
  if (selectedProvider) {
    const provider = selectedProvider;
    const credential = selectedIndex >= 0 ? credentials[selectedIndex] : null;
    const apiKey =
      credential?.apiKey ??
      (provider === "openrouter" ? env.OPENROUTER_API_KEY : undefined);
    if (!apiKey) return null;
    const baseUrl = (
      credential?.baseUrl ??
      (provider === "openai"
        ? "https://api.openai.com/v1"
        : (env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1"))
    ).replace(/\/$/, "");
    const model =
      provider === "openrouter"
        ? `openai/${preferences.model}`
        : preferences.model;
    const identity = `${provider}:${model}:1536:${createHash("sha256").update(baseUrl).digest("hex").slice(0, 12)}`;
    return { apiKey, baseUrl, model, identity, preferences };
  }
  return null;
}
