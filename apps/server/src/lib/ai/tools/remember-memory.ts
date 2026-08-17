import { db, memory, memoryPreference } from "@/db";
import type { ActorContext, ChatMessage } from "@/lib/types";
import type { Tool, UIMessageStreamWriter } from "ai";
import { tool } from "ai";
import { and, eq } from "drizzle-orm";
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
			if (!params.session.organizationId)
				throw new Error("An organization is required for personal memory");
			const preference = await db.query.memoryPreference.findFirst({
				where: and(
					eq(memoryPreference.organizationId, params.session.organizationId),
					eq(memoryPreference.userId, params.session.userId),
				),
			});
			if (preference && !preference.savedMemoryEnabled) {
				return {
					status: "disabled",
					message: "Saved memory is disabled for this user.",
				};
			}

			const existing = await db.query.memory.findFirst({
				where: and(
					eq(memory.organizationId, params.session.organizationId),
					eq(memory.scope, "user"),
					eq(memory.userId, params.session.userId),
					eq(memory.key, input.key),
				),
			});
			const [saved] = existing
				? await db
						.update(memory)
						.set({
							content: input.content,
							importance: input.importance,
							sourceType: "chat",
							sourceId: params.chatId,
							updatedAt: new Date(),
						})
						.where(eq(memory.id, existing.id))
						.returning()
				: await db
						.insert(memory)
						.values({
							organizationId: params.session.organizationId,
							userId: params.session.userId,
							chatId: null,
							agentId: null,
							createdBy: params.session.userId,
							scope: "user",
							key: input.key,
							content: input.content,
							importance: input.importance,
							sourceType: "chat",
							sourceId: params.chatId,
						})
						.returning();
			if (!saved) throw new Error("Unable to save personal memory");
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
