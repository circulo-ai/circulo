import { chatRepo } from "@/db/repositories/chat-repo";
import { chatAgent, db } from "@/db";
import { api, Errors, success } from "@/lib/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

// POST /api/chats/:id/agents/reorder - Reorder agents in chat
export const POST = api(
  {
    auth: true,
    params: z.object({ id: z.string() }),
    body: z.object({
      agentOrder: z.array(
        z.object({
          agentId: z.uuid(),
          speakOrder: z.number().int().min(0),
        }),
      ),
    }),
  },
  async (req, ctx) => {
    const chat = await chatRepo.findById(ctx.params.id);
    if (!chat) throw Errors.notFound("Chat not found");

    if (chat.creatorId !== ctx.user.id) {
      throw Errors.forbidden("You don't have access to this chat");
    }

    // Update speak order for each agent
    for (const { agentId, speakOrder } of ctx.body.agentOrder) {
      await chatRepo.updateAgent(ctx.params.id, agentId, { speakOrder });
    }

    // Return updated agents list
    const agents = await chatRepo.findAgentsForChat(ctx.params.id, {
      includeDisabled: true,
    });

    return success({ agents });
  },
);