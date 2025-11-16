import { chatRepo } from "@/db/repositories/chat-repo";
import { db } from "@/db";
import { api, Errors, success } from "@/lib/server";
import { z } from "zod";

// PATCH /api/chats/:id/agents/:agentId - Update agent settings in chat
export const PATCH = api(
  {
    auth: true,
    params: z.object({
      id: z.string(),
      agentId: z.uuid(),
    }),
    body: z.object({
      speakOrder: z.number().int().min(0).optional(),
      enabled: z.boolean().optional(),
      customSystemPrompt: z.string().optional().nullable(),
      customTemperature: z.number().min(0).max(2).optional().nullable(),
    }),
  },
  async (req, ctx) => {
    const chat = await chatRepo.findById(ctx.params.id);
    if (!chat) throw Errors.notFound("Chat not found");

    if (chat.creatorId !== ctx.user.id) {
      throw Errors.forbidden("You don't have access to this chat");
    }

    // Verify chat agent exists
    const chatAgent = await db.query.chatAgent.findFirst({
      where: (ca, { eq, and }) =>
        and(
          eq(ca.chatId, ctx.params.id),
          eq(ca.agentId, ctx.params.agentId),
        ),
    });

    if (!chatAgent) {
      throw Errors.notFound("Agent not found in this chat");
    }

    const updated = await chatRepo.updateAgent(
      ctx.params.id,
      ctx.params.agentId,
      ctx.body,
    );

    return success({ chatAgent: updated });
  },
);

// DELETE /api/chats/:id/agents/:agentId - Remove agent from chat
export const DELETE = api(
  {
    auth: true,
    params: z.object({
      id: z.string(),
      agentId: z.uuid(),
    }),
  },
  async (req, ctx) => {
    const chat = await chatRepo.findById(ctx.params.id);
    if (!chat) throw Errors.notFound("Chat not found");

    if (chat.creatorId !== ctx.user.id) {
      throw Errors.forbidden("You don't have access to this chat");
    }

    // Verify chat agent exists
    const chatAgent = await db.query.chatAgent.findFirst({
      where: (ca, { eq, and }) =>
        and(
          eq(ca.chatId, ctx.params.id),
          eq(ca.agentId, ctx.params.agentId),
        ),
    });

    if (!chatAgent) {
      throw Errors.notFound("Agent not found in this chat");
    }

    await chatRepo.removeAgent(ctx.params.id, ctx.params.agentId);

    return success({ deleted: true });
  },
);