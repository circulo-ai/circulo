import { getActiveOrganizationId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createRouter } from "@/lib/create-app";
import { ForbiddenError, NotFoundError } from "@/lib/server/errors";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const router = createRouter();

router.get("/messages/test", async (c) => {
  return c.json({ message: await c.di.ChatRepository.findMany({}) });
});

router.delete(
  "/messages/:id/trailing",
  requireAuth,
  zValidator("param", paramsSchema),
  async (c) => {
    const {
      ChatRepository: chatRepository,
      MessageRepository: messageRepository,
    } = c.di;

    const { user, activeOrgId, session } = c.var;
    const { id } = c.req.valid("param");

    const message = await messageRepository.findById(id);
    if (!message) {
      throw new NotFoundError("Message not found");
    }

    const chat = await chatRepository.findById(message.chatId);
    if (!chat) {
      throw new NotFoundError("Chat not found");
    }

    const organizationId =
      activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

    if (chat.organizationId !== organizationId) {
      throw new ForbiddenError("Chat does not belong to your organization");
    }

    if (chat.creatorId !== user!.id) {
      const canUpdate = await hasPermission(
        "chat",
        "update",
        chat.organizationId,
        session as any,
      );
      if (!canUpdate) {
        throw new ForbiddenError(
          "You don't have permission to edit this chat",
        );
      }
    }

    await messageRepository.deleteByChatIdAfterTimestamp({
      chatId: chat.id,
      timestamp: message.createdAt,
    });

    return c.json({ success: true });
  },
);

export default router;
