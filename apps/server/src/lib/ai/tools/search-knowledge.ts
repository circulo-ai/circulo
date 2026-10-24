import { db, knowledgeBase, knowledgeDocument } from "@/db";
import { createKnowledgeEmbeddingWithMetadata } from "@/lib/knowledge/embeddings";
import {
  knowledgeSemanticDistance,
  relevantKnowledgeContent,
} from "@/lib/knowledge/semantic-distance";
import type { Tool } from "ai";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

export function searchKnowledge(params: {
  organizationId: string;
  allowedKnowledgeBaseIds: string[];
  userId: string;
}): Tool {
  return {
    description:
      "Search the active knowledge bases assigned to this chat and its enabled agents. Archived or unassigned sources are never searched.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(500),
      limit: z.number().int().min(1).max(20).default(8),
    }),
    execute: async ({ query, limit }) => {
      if (!params.allowedKnowledgeBaseIds.length) return { results: [] };
      const activeBases = await db
        .select({ id: knowledgeBase.id })
        .from(knowledgeBase)
        .where(
          and(
            eq(knowledgeBase.organizationId, params.organizationId),
            eq(knowledgeBase.isArchived, false),
            inArray(knowledgeBase.id, params.allowedKnowledgeBaseIds),
          ),
        );
      const baseIds = activeBases.map((base) => base.id);
      if (!baseIds.length) return { results: [] };
      const queryEmbedding = await createKnowledgeEmbeddingWithMetadata(
        query,
        "",
        {
          userId: params.userId,
          organizationId: params.organizationId,
          purpose: "query",
        },
      ).catch(() => null);
      const rank = sql<number>`ts_rank(to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}), plainto_tsquery('simple', ${query}))`;
      const vectorDistance = queryEmbedding
        ? knowledgeSemanticDistance(queryEmbedding)
        : null;
      const lexicalMatch = sql`to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}) @@ plainto_tsquery('simple', ${query})`;
      const documents = await db.query.knowledgeDocument.findMany({
        where: and(
          eq(knowledgeDocument.organizationId, params.organizationId),
          eq(knowledgeDocument.status, "ready"),
          inArray(knowledgeDocument.knowledgeBaseId, baseIds),
          queryEmbedding
            ? or(
                sql`${knowledgeSemanticDistance(queryEmbedding)} IS NOT NULL`,
                lexicalMatch,
                sql`${knowledgeDocument.contentType} LIKE 'image/%'`,
              )
            : or(
                lexicalMatch,
                sql`${knowledgeDocument.contentType} LIKE 'image/%'`,
              ),
        ),
        with: { knowledgeBase: true },
        orderBy: queryEmbedding
          ? [
              asc(
                sql`CASE WHEN ${knowledgeSemanticDistance(queryEmbedding)} IS NULL THEN 1 ELSE 0 END`,
              ),
              asc(vectorDistance!),
              desc(rank),
            ]
          : desc(rank),
        limit,
      });
      return {
        results: await Promise.all(
          documents.map(async (document) => ({
            id: document.id,
            knowledgeBase: document.knowledgeBase.name,
            title: document.title,
            content: await relevantKnowledgeContent(document, queryEmbedding),
            sourceKey: document.sourceKey,
            contentType: document.contentType,
            isImage: document.contentType.startsWith("image/"),
          })),
        ),
      };
    },
  };
}
