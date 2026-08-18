import { db, knowledgeBase, knowledgeDocument } from "@/db";
import type { Tool } from "ai";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

export function searchKnowledge(params: {
	organizationId: string;
	allowedKnowledgeBaseIds: string[];
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
			const rank = sql<number>`ts_rank(to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}), plainto_tsquery('simple', ${query}))`;
			const documents = await db.query.knowledgeDocument.findMany({
				where: and(
					eq(knowledgeDocument.organizationId, params.organizationId),
					eq(knowledgeDocument.status, "ready"),
					inArray(knowledgeDocument.knowledgeBaseId, baseIds),
					sql`to_tsvector('simple', ${knowledgeDocument.title} || ' ' || ${knowledgeDocument.content}) @@ plainto_tsquery('simple', ${query})`,
				),
				with: { knowledgeBase: true },
				orderBy: desc(rank),
				limit,
			});
			return {
				results: documents.map((document) => ({
					id: document.id,
					knowledgeBase: document.knowledgeBase.name,
					title: document.title,
					content: document.content,
					sourceKey: document.sourceKey,
				})),
			};
		},
	};
}
