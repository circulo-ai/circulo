import { chatAgentRepo } from "@/db/repositories/chat-agent-repo";
import { chatRepo } from "@/db/repositories/chat-repo";
import { api, Errors, success } from "@/lib/server";
import z from "zod";

export const GET = api(
  {
    auth: true,
    params: z.object({ id: z.string().min(1) }),
  },
  async (req, ctx) => {
    const chat = await chatRepo.findById(ctx.params.id);
    // Verify ownership
    if (!chat) {
      throw Errors.notFound("Chat not found");
    }
    // TODO: In future we may allow permitted members to access chats
    if (chat.creatorId !== ctx.user.id) {
      throw Errors.forbidden("You can only access your own chats");
    }
    const agents = await chatAgentRepo.findEnabledForChat(chat.id);
    if (!agents) {
      throw Errors.notFound("Agent not found");
    }
    return success({ agents });
  },
);
