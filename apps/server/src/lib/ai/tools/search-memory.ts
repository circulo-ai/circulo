import { db, memory } from "@/db";
import type { Tool } from "ai";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";

export function searchMemory(params: {
  organizationId: string;
  userId: string;
  chatId: string;
  canReadUserMemory: boolean;
  canReadOrganizationMemory: boolean;
  canReadChatMemory: boolean;
  readableAgentIds: string[];
}): Tool {
  return {
    description:
      "Search the memories this chat is authorized to use. Results are limited by workspace, chat, and enabled-agent policy.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(500),
      limit: z.number().int().min(1).max(20).default(8),
    }),
    execute: async ({ query, limit }) => {
      const scopes = [
        ...(params.canReadUserMemory
          ? [and(eq(memory.scope, "user"), eq(memory.userId, params.userId))]
          : []),
        ...(params.canReadOrganizationMemory
          ? [eq(memory.scope, "organization")]
          : []),
        ...(params.canReadChatMemory
          ? [and(eq(memory.scope, "chat"), eq(memory.chatId, params.chatId))]
          : []),
        ...(params.readableAgentIds.length
          ? [
              and(
                eq(memory.scope, "agent"),
                or(
                  ...params.readableAgentIds.map((id) =>
                    eq(memory.agentId, id),
                  ),
                ),
              ),
            ]
          : []),
      ];
      if (!scopes.length) return { results: [] };
      const results = await db.query.memory.findMany({
        where: and(
          eq(memory.organizationId, params.organizationId),
          or(...scopes),
          or(
            ilike(memory.key, `%${query}%`),
            ilike(memory.content, `%${query}%`),
          ),
        ),
        orderBy: [desc(memory.importance), desc(memory.updatedAt)],
        limit,
      });
      return {
        results: results.map((item) => ({
          id: item.id,
          scope: item.scope,
          key: item.key,
          content: item.content,
        })),
      };
    },
  };
}
