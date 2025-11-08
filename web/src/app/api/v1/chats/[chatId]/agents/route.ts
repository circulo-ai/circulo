import { chatRepo } from "@/db/repositories/chat-repo";
import { api, notFound, success } from "@/lib/server";
import { z } from "zod";

export const GET = api(
  { auth: true, params: z.object({ chatId: z.string() }) },
  async (req, ctx) => {
    const { chatId } = ctx.params;

    // Ensure the chat exists and belongs to the current user
    const item = await chatRepo.findById(chatId);
    if (!item || item.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    const agents = await chatRepo.findAgentsForChat(chatId);
    return success({ agents });
  }
);