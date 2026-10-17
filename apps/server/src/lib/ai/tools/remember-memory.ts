import { db, memory, memoryHistory, memoryPreference } from "@/db";
import {
  createMemoryEmbedding,
  writeMemoryWithEmbedding,
} from "@/lib/memory/retrieval";
import type { ActorContext, ChatMessage } from "@/lib/types";
import type { Tool, UIMessageStreamWriter } from "ai";
import { tool } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

export function rememberMemory(params: {
  session: ActorContext;
  chatId: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}): Tool {
  return tool({
    description:
      "Save a useful, durable personal fact or preference for the user. Only use this when the user explicitly asks you to remember something or clearly provides a stable preference that will improve future conversations.",
    inputSchema: z.object({
      key: z.string().trim().min(1).max(200),
      content: z.string().trim().min(1).max(20_000),
      importance: z.number().int().min(0).max(100).default(60),
    }),
    execute: async (input) => {
      const organizationId = params.session.organizationId;
      if (!organizationId)
        throw new Error("An organization is required for personal memory");
      const preference = await db.query.memoryPreference.findFirst({
        where: and(
          eq(memoryPreference.organizationId, organizationId),
          eq(memoryPreference.userId, params.session.userId),
        ),
      });
      if (preference && !preference.savedMemoryEnabled) {
        return {
          status: "disabled",
          message: "Saved memory is disabled for this user.",
        };
      }

      const embedding = await createMemoryEmbedding({
        key: input.key,
        content: input.content,
        userId: params.session.userId,
        organizationId: organizationId,
      });
      const { row: saved } = await writeMemoryWithEmbedding(
        organizationId,
        embedding,
        async (tx, embeddingFields) => {
          const current = await tx.query.memory.findFirst({
            where: and(
              eq(memory.organizationId, organizationId!),
              eq(memory.scope, "user"),
              eq(memory.userId, params.session.userId),
              eq(memory.key, input.key),
            ),
          });
          if (current)
            await tx.insert(memoryHistory).values({
              memoryId: current.id,
              organizationId: current.organizationId,
              userId: current.userId ?? current.createdBy,
              key: current.key,
              content: current.content,
              metadata: current.metadata,
              importance: current.importance,
            });
          const [saved] = current
            ? await tx
                .update(memory)
                .set({
                  content: input.content,
                  importance: input.importance,
                  ...embeddingFields,
                  sourceType: "chat",
                  sourceId: params.chatId,
                  updatedAt: new Date(),
                })
                .where(eq(memory.id, current.id))
                .returning()
            : await tx
                .insert(memory)
                .values({
                  organizationId: organizationId,
                  userId: params.session.userId,
                  chatId: null,
                  agentId: null,
                  createdBy: params.session.userId,
                  scope: "user",
                  key: input.key,
                  content: input.content,
                  ...embeddingFields,
                  importance: input.importance,
                  sourceType: "chat",
                  sourceId: params.chatId,
                })
                .returning();
          return saved;
        },
      );
      if (!saved) throw new Error("Unable to save personal memory");
      if (preference?.automaticManagementEnabled !== false) {
        await db
          .insert(memoryPreference)
          .values({
            organizationId: organizationId,
            userId: params.session.userId,
          })
          .onConflictDoNothing();
        const memories = await db.query.memory.findMany({
          where: and(
            eq(memory.organizationId, organizationId),
            eq(memory.scope, "user"),
            eq(memory.userId, params.session.userId),
          ),
          orderBy: desc(memory.importance),
          limit: 100,
        });
        await db
          .update(memoryPreference)
          .set({
            summary:
              memories
                .map((entry) => `- ${entry.key}: ${entry.content}`)
                .join("\n") || null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(memoryPreference.organizationId, organizationId),
              eq(memoryPreference.userId, params.session.userId),
            ),
          );
      }
      params.dataStream.write({
        type: "data-memoryUpdated",
        data: { id: saved.id, key: saved.key },
        transient: false,
      });
      return {
        status: "saved",
        memoryId: saved.id,
        message: "Saved as a personal memory for future conversations.",
      };
    },
  });
}
