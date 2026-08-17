import type { RequestServices } from "@/di/di-context";
import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";
import type { DrizzleMessageRepository } from "@/infrastructure/drizzle/message-repository";
import { getActiveOrganizationId } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { ForbiddenError, NotFoundError } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

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

    const { user, activeOrgId } = c.var;
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

    if (
      !(await di.ChatMemberRepository.isMember(
        user!.id,
        chat.aggregateId.toString(),
      ))
    ) {
      throw new ForbiddenError("You are not a member of this chat");
    }

    if (message.authorId !== user!.id) {
      throw new ForbiddenError("You can only edit your own user messages");
    }

    const humanMemberCount = await di.ChatMemberRepository.countActiveForChat(
      chat.aggregateId.toString(),
    );
    if (humanMemberCount > 1) {
      throw new ForbiddenError(
        "Editing is disabled when a chat has more than one human member",
      );
    }

    await messageRepository.deleteByChatIdAfterTimestamp({
      chatId: chat.aggregateId.toString(),
      timestamp: message.snapshot.createdAt,
    });

    return c.json({ success: true });
  },
);

export default router;
