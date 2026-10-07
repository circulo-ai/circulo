import type { RequestServices } from "@/di/di-context";
import type { DrizzleChatRepository } from "@/infrastructure/drizzle/chat-repository";
import type { DrizzleMessageRepository } from "@/infrastructure/drizzle/message-repository";
import { getActiveOrganizationId } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { isSafeMessageUrl } from "@/lib/security/message-url";
import { requireAuth } from "@/middleware/auth";
import { ForbiddenError, NotFoundError } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.uuid(),
});

const safePartsSchema = z
  .array(z.record(z.string(), z.unknown()))
  .superRefine((parts, ctx) => {
    for (const [index, part] of parts.entries()) {
      for (const field of ["url", "downloadUrl"] as const) {
        const value = part[field];
        if (
          value !== undefined &&
          (typeof value !== "string" || !isSafeMessageUrl(value))
        ) {
          ctx.addIssue({
            code: "custom",
            path: [index, field],
            message: "URL scheme is not allowed",
          });
        }
      }
    }
  });

const editMessageSchema = z.object({
  replacementId: z.uuid(),
  content: z
    .string()
    .min(1)
    .max(100_000)
    .refine((value) => value.trim().length > 0, "Message cannot be blank"),
  parts: safePartsSchema.optional(),
  attachments: safePartsSchema.optional(),
});

const router = createRouter();

router.post(
  "/messages/:id/edit",
  requireAuth,
  zValidator("param", paramsSchema),
  zValidator("json", editMessageSchema),
  async (c) => {
    const di: RequestServices = c.di;
    const chatRepository: DrizzleChatRepository = di.ChatRepository;
    const messageRepository: DrizzleMessageRepository = di.MessageRepository;
    const { user, activeOrgId } = c.var;
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const message = await messageRepository.findById(id);
    if (!message) throw new NotFoundError("Message not found");
    const chatId = message.snapshot.chatId.toString();
    const chat = await chatRepository.findById(chatId);
    if (!chat) throw new NotFoundError("Chat not found");

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

    const replacement = await messageRepository.replaceTrailingWithMessage({
      chatId: chat.aggregateId.toString(),
      messageId: id,
      replacement: {
        id: body.replacementId,
        authorId: user!.id,
        content: body.content,
        parts: body.parts ?? [{ type: "text", text: body.content }],
        attachments: body.attachments ?? [],
      },
    });
    if (!replacement) throw new NotFoundError("Message not found");

    return c.json({
      success: true,
      message: {
        id: replacement.id,
        role: replacement.role,
        content: replacement.content,
        parts: replacement.parts,
        createdAt: replacement.createdAt,
      },
    });
  },
);

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
      anchorId: id,
    });

    return c.json({ success: true });
  },
);

export default router;
