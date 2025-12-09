import { chatRepo, voteRepo } from "@/db/repositories";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { ForbiddenError, NotFoundError } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const getQuerySchema = z.object({
  chatId: z.string().min(1, "Parameter chatId is required."),
});

const patchBodySchema = z.object({
  chatId: z.string().min(1),
  messageId: z.string().min(1),
  type: z.enum(["up", "down"]),
});

const router = createRouter();

router.get(
  "/vote",
  requireAuth,
  zValidator("query", getQuerySchema),
  async (c) => {
    const { chatId } = c.req.valid("query");
    const user = c.var.user!;

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
    return c.json(votes, 200);
  },
);

router.patch(
  "/vote",
  requireAuth,
  zValidator("json", patchBodySchema),
  async (c) => {
    const { chatId, messageId, type } = c.req.valid("json");
    const user = c.var.user!;

    const chat = await chatRepo.findById(chatId);

    if (!chat) {
      throw new NotFoundError("Chat not found");
    }

    if (chat.creatorId !== user.id) {
      throw new ForbiddenError("You are not allowed to vote on this chat");
    }

    await voteRepo.vote(user.id, chatId, messageId, type);

    return c.json({ message: "Message voted" }, 200);
  },
);

export default router;
