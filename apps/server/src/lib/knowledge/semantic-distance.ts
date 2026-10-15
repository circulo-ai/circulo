import { db, embeddingChunk, knowledgeDocument, memory } from "@/db";
import { and, asc, eq, sql } from "drizzle-orm";

export type QueryEmbedding = { embedding: number[]; model: string };
export function knowledgeSemanticDistance(query: QueryEmbedding | null) {
  if (!query) return sql<number | null>`NULL`;
  return sql<
    number | null
  >`(SELECT min(c.embedding <=> ${JSON.stringify(query.embedding)}::vector)
    FROM embedding_chunks c WHERE c.document_id = ${knowledgeDocument.id} AND c.model = ${query.model})`;
}
export function memorySemanticDistance(query: QueryEmbedding) {
  return sql<
    number | null
  >`coalesce((SELECT min(c.embedding <=> ${JSON.stringify(query.embedding)}::vector)
    FROM embedding_chunks c WHERE c.memory_id = ${memory.id} AND c.model = ${query.model}),
    CASE WHEN ${memory.embeddingModel} = ${query.model} THEN ${memory.embedding} <=> ${JSON.stringify(query.embedding)}::vector ELSE NULL END)`;
}

export async function relevantKnowledgeContent(
  document: { id: string; content: string },
  query: QueryEmbedding | null,
) {
  if (!query) return document.content;
  const chunks = await db
    .select({
      content: embeddingChunk.content,
      ordinal: embeddingChunk.ordinal,
    })
    .from(embeddingChunk)
    .where(
      and(
        eq(embeddingChunk.documentId, document.id),
        eq(embeddingChunk.model, query.model),
      ),
    )
    .orderBy(
      asc(
        sql`${embeddingChunk.embedding} <=> ${JSON.stringify(query.embedding)}::vector`,
      ),
    )
    .limit(3);
  if (!chunks.length) return document.content;
  return chunks
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((chunk) => `[Passage ${chunk.ordinal + 1}]\n${chunk.content}`)
    .join("\n\n");
}
