import {
  db,
  embeddingChunk,
  embeddingPreference,
  knowledgeDocument,
} from "@/db";
import { and, eq } from "drizzle-orm";
import {
  embeddingPreferencesSchema,
  type EmbeddingPreferences,
} from "@circulo-ai/types";
import {
  averageKnowledgeEmbeddings,
  chunkKnowledgeText,
} from "./embedding-utils";
import {
  getEmbeddingPreferences,
  resolveEmbeddingConfig,
} from "./embedding-settings";
import { requestEmbeddingVectors } from "./embedding-provider";
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
    signal?: AbortSignal;
  },
): Promise<EmbeddingResult | null> {
  const preferences =
    options?.preferences ??
    (await getEmbeddingPreferences(options?.organizationId));
  const config = await resolveEmbeddingConfig(options?.userId, preferences);
  if (!config) return null;
  const chunks = chunkKnowledgeText(`${title}\n\n${content}`, preferences);
  if (!chunks.length) return null;
  const vectors = await requestEmbeddingVectors(
    config,
    chunks,
    options?.signal,
  );
  return {
    embedding: averageKnowledgeEmbeddings(vectors),
    model: config.identity,
    chunks: chunks.map((content, ordinal) => ({
      content,
      ordinal,
      embedding: vectors[ordinal]!,
    })),
    preferences,
    sourceText: `${title}\n\n${content}`,
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
