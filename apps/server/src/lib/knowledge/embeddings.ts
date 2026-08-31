import { db, knowledgeDocument } from "@/db";
import { getUserProviderCredential } from "@/lib/ai/provider-registry";
import { env } from "@/lib/env";
import { eq } from "drizzle-orm";
import {
  averageKnowledgeEmbeddings,
  chunkKnowledgeText,
  isKnowledgeEmbedding,
} from "./embedding-utils";

export {
  averageKnowledgeEmbeddings,
  chunkKnowledgeText,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
} from "./embedding-utils";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
const DEFAULT_OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

function getBaseUrl() {
  return (env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL).replace(
    /\/$/,
    "",
  );
}

async function getEmbeddingConfig(userId?: string) {
  if (userId) {
    const credential =
      (await getUserProviderCredential(userId, "openrouter")) ??
      (await getUserProviderCredential(userId, "openai"));
    if (!credential) return null;
    return {
      apiKey: credential.apiKey,
      baseUrl:
        credential.baseUrl ??
        (credential.providerId === "openai"
          ? "https://api.openai.com/v1"
          : DEFAULT_OPENROUTER_BASE_URL),
      model:
        credential.providerId === "openai"
          ? DEFAULT_OPENAI_EMBEDDING_MODEL
          : getEmbeddingModel(),
    };
  }

  if (!env.OPENROUTER_API_KEY) return null;
  return {
    apiKey: env.OPENROUTER_API_KEY,
    baseUrl: getBaseUrl(),
    model: getEmbeddingModel(),
  };
}

function getEmbeddingModel() {
  return env.CIRCULO_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
}

export async function createKnowledgeEmbedding(
  title: string,
  content: string,
  options?: { userId?: string },
): Promise<number[] | null> {
  const config = await getEmbeddingConfig(options?.userId);
  if (!config) return null;

  const chunks = chunkKnowledgeText(`${title}\n\n${content}`);
  if (!chunks.length) return null;

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(env.OPENROUTER_HTTP_REFERER
        ? { "HTTP-Referer": env.OPENROUTER_HTTP_REFERER }
        : {}),
      ...(env.OPENROUTER_APP_TITLE
        ? { "X-Title": env.OPENROUTER_APP_TITLE }
        : {}),
    },
    body: JSON.stringify({
      model: config.model,
      input: chunks,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const providerMessage = (await response.text()).slice(0, 500);
    throw new Error(
      `Embedding request failed (${response.status})${providerMessage ? `: ${providerMessage}` : ""}`,
    );
  }

  const payload = (await response.json()) as EmbeddingResponse;
  const vectors = (payload.data ?? [])
    .map((item) => item.embedding)
    .filter((item): item is number[] => isKnowledgeEmbedding(item));
  if (vectors.length !== chunks.length) {
    throw new Error(
      `Embedding provider returned ${vectors.length} valid vectors for ${chunks.length} chunks`,
    );
  }
  return averageKnowledgeEmbeddings(vectors);
}

export async function refreshKnowledgeDocumentEmbedding(params: {
  documentId: string;
  title: string;
  content: string;
  userId?: string;
}): Promise<boolean> {
  const config = await getEmbeddingConfig(params.userId);
  if (!config) return false;

  const embedding = await createKnowledgeEmbedding(
    params.title,
    params.content,
    params.userId ? { userId: params.userId } : undefined,
  );
  if (!embedding) return false;

  await db
    .update(knowledgeDocument)
    .set({
      embedding,
      embeddingModel: config.model,
      embeddingUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocument.id, params.documentId));
  return true;
}
