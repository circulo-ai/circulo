import { getActiveOrganizationId } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { hasPermission } from "@/lib/permissions";
import { requireAuth } from "@/middleware/auth";
import { ForbiddenError, NotFoundError } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";
import type { DrizzleMessageRepository } from "@/infrastructure/drizzle/message-repository";
import type { RequestServices } from "@/di/di-context";

const paramsSchema = z.object({
  id: z.uuid(),
});

const router = createRouter();

router.delete(
  "/messages/:id/trailing",
  requireAuth,
  zValidator("param", paramsSchema),
  async (c) => {
    const di: RequestServices = c.di;
    const chatRepository: DrizzleChatRepository = di.ChatRepository;
    const messageRepository: DrizzleMessageRepository = di.MessageRepository;

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
        throw new ForbiddenError("You don't have permission to edit this chat");
      }
    }

    await messageRepository.deleteByChatIdAfterTimestamp({
      chatId: chat.aggregateId.toString(),
      timestamp: message.snapshot.createdAt,
    });

    return c.json({ success: true });
  },
);

export default router;
