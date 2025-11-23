import { chatRepo, voteRepo } from "@/db/repositories";
import { ChatSDKError } from "@/lib/errors";
import { createSafeRoute } from "@/lib/server";
import { authMiddleware } from "@/lib/server/middlewares";
import { z } from "zod";

const getQuerySchema = z.object({
  chatId: z.string().min(1, "Parameter chatId is required."),
});

const patchBodySchema = z.object({
  chatId: z.string().min(1),
  messageId: z.string().min(1),
  type: z.enum(["up", "down"]),
});

export const GET = createSafeRoute()
  .methods("GET")
  .query(getQuerySchema)
  .use(authMiddleware())
  .handler(async (req, ctx) => {
    const { chatId } = ctx.query;
    const { user } = ctx.data;

    const chat = await chatRepo.findById(chatId);

    if (!chat) {
      throw new ChatSDKError("not_found:chat");
    }

    if (chat.creatorId !== user.id) {
      throw new ChatSDKError("forbidden:vote");
    }

    const votes = await voteRepo.findForChat(chatId);
    return Response.json(votes, { status: 200 });
  });

export const PATCH = createSafeRoute()
  .methods("PATCH")
  .body(patchBodySchema)
  .use(authMiddleware())
  .handler(async (req, ctx) => {
    const { chatId, messageId, type } = ctx.body;
    const { user } = ctx.data;

    const chat = await chatRepo.findById(chatId);

    if (!chat) {
      throw new ChatSDKError("not_found:vote");
    }

    if (chat.creatorId !== user.id) {
      throw new ChatSDKError("forbidden:vote");
    }

    await voteRepo.vote(user.id, chatId, messageId, type);

    return new Response("Message voted", { status: 200 });
  });
