import { chatRepo, voteRepo } from "@/db/repositories";
import { ForbiddenError, NotFoundError, createSafeRoute } from "@/lib/server";
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
      throw new NotFoundError("Chat not found");
    }

    if (chat.creatorId !== user.id) {
      throw new ForbiddenError(
        "You are not allowed to view votes for this chat",
      );
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
      throw new NotFoundError("Chat not found");
    }

    if (chat.creatorId !== user.id) {
      throw new ForbiddenError("You are not allowed to vote on this chat");
    }

    await voteRepo.vote(user.id, chatId, messageId, type);

    return new Response("Message voted", { status: 200 });
  });
