import {
  db,
  embeddingChunk,
  embeddingPreference,
  knowledgeDocument,
} from "@/db";
import {
  embeddingPreferencesSchema,
  type EmbeddingPreferences,
} from "@circulo-ai/types";
import { and, eq } from "drizzle-orm";
import {
  requestEmbeddingVectors,
  type EmbeddingPurpose,
} from "./embedding-provider";
import {
  getEmbeddingPreferences,
  resolveEmbeddingConfig,
} from "./embedding-settings";
import {
  averageKnowledgeEmbeddings,
  chunkKnowledgeText,
  MAX_INPUT_BYTES_PER_CHUNK,
} from "./embedding-utils";
export {
  averageKnowledgeEmbeddings,
  chunkKnowledgeText,
  KNOWLEDGE_EMBEDDING_DIMENSIONS,
} from "./embedding-utils";

export type EmbeddingResult = {
  embedding: number[];
  model: string;
  chunks: Array<{ content: string; embedding: number[]; ordinal: number }>;
  preferences: EmbeddingPreferences;
  sourceText: string;
};
export async function createKnowledgeEmbedding(
  title: string,
  content: string,
  options?: { userId?: string; organizationId?: string },
) {
  return (
    (await createKnowledgeEmbeddingWithMetadata(title, content, options))
      ?.embedding ?? null
  );
}
export async function createKnowledgeEmbeddingWithMetadata(
  title: string,
  content: string,
  options?: {
    userId?: string;
    organizationId?: string;
    preferences?: EmbeddingPreferences;
    purpose?: EmbeddingPurpose;
    signal?: AbortSignal;
  },
): Promise<EmbeddingResult | null> {
  const preferences =
    options?.preferences ??
    (await getEmbeddingPreferences(options?.organizationId));
  const config = await resolveEmbeddingConfig(options?.userId, preferences);
  if (!config) return null;
  const purpose = options?.purpose ?? "document";
  const normalizedTitle = title.trim();
  const normalizedContent = content.trim();
  const sourceText = `${title}\n\n${content}`;
  const googleEmbedding001 =
    config.provider === "google" && config.model === "gemini-embedding-001";
  const googleEmbedding2 =
    config.provider === "google" && config.model === "gemini-embedding-2";
  const modelInputLimitBytes = googleEmbedding001
    ? 1800
    : MAX_INPUT_BYTES_PER_CHUNK;
  const titlePrefix = googleEmbedding2
    ? purpose === "document"
      ? `title: ${normalizedTitle || "none"} | text: `
      : "task: search result | query: "
    : purpose !== "document" || googleEmbedding001
      ? ""
      : `${normalizedTitle}\n\n`;
  const maxChunkBytes = Math.max(
    1,
    modelInputLimitBytes - Buffer.byteLength(titlePrefix, "utf8"),
  );
  const chunkSize = Math.min(preferences.chunkSize, maxChunkBytes);
  const chunkingPreferences = {
    ...preferences,
    chunkSize,
    overlap: Math.min(preferences.overlap, Math.floor((chunkSize - 1) / 2)),
    maxInputBytes: maxChunkBytes,
  };
  const chunks =
    purpose === "query"
      ? chunkKnowledgeText(sourceText, chunkingPreferences)
      : chunkKnowledgeText(
          normalizedContent || normalizedTitle,
          chunkingPreferences,
        );
  if (!chunks.length) return null;
  const storedChunks =
    purpose === "document" && normalizedTitle && normalizedContent
      ? chunks.map((chunk) => `${normalizedTitle}\n\n${chunk}`)
      : chunks;
  const modelInputs =
    purpose === "document" &&
    config.provider === "google" &&
    (googleEmbedding001 || googleEmbedding2)
      ? chunks
      : storedChunks;
  const vectors = await requestEmbeddingVectors(
    config,
    modelInputs,
    options?.signal,
    { purpose, documentTitle: normalizedTitle },
  );
  return {
    embedding: averageKnowledgeEmbeddings(vectors),
    model: config.identity,
    chunks: storedChunks.map((content, ordinal) => ({
      content,
      ordinal,
      embedding: vectors[ordinal]!,
    })),
    preferences,
    sourceText,
  };
}

export async function refreshKnowledgeDocumentEmbedding(params: {
  documentId: string;
  title: string;
  content: string;
  userId?: string;
  organizationId?: string;
  signal?: AbortSignal;
}): Promise<boolean> {
  const document = await db.query.knowledgeDocument.findFirst({
    where: eq(knowledgeDocument.id, params.documentId),
  });
  if (
    !document ||
    document.title !== params.title ||
    document.content !== params.content
  )
    return false;
  const result = await createKnowledgeEmbeddingWithMetadata(
    params.title,
    params.content,
    {
      userId: params.userId,
      organizationId: document.organizationId,
      signal: params.signal,
    },
  );
  if (!result) return false;
  return db.transaction(async (tx) => {
    const [settings] = await tx
      .select()
      .from(embeddingPreference)
      .where(eq(embeddingPreference.organizationId, document.organizationId))
      .for("update");
    if (
      JSON.stringify(embeddingPreferencesSchema.parse(settings?.config)) !==
      JSON.stringify(result.preferences)
    )
      return false;
    const [updated] = await tx
      .update(knowledgeDocument)
      .set({
        embedding: result.embedding,
        embeddingModel: result.model,
        embeddingUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(knowledgeDocument.id, params.documentId),
          eq(knowledgeDocument.title, params.title),
          eq(knowledgeDocument.content, params.content),
        ),
      )
      .returning({ id: knowledgeDocument.id });
    if (!updated) return false;
    await tx
      .delete(embeddingChunk)
      .where(eq(embeddingChunk.documentId, params.documentId));
    await tx.insert(embeddingChunk).values(
      result.chunks.map((chunk) => ({
        ...chunk,
        model: result.model,
        organizationId: document.organizationId,
        documentId: params.documentId,
      })),
    );
    return true;
  });
}
