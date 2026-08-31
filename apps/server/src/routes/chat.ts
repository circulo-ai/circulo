import { db } from "@/db";
import { messageRepo } from "@/db/repositories";
import { chat as chatTable, message as messageTable } from "@/db/schema";
import type { RequestServices } from "@/di/di-context";
import { getActiveOrganizationId, getSession } from "@/lib/auth";
import { enforceOrganizationFeatureLimit } from "@/lib/billing/limits";
import { createRouter } from "@/lib/create-app";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import { type ChatMessage } from "@/lib/types";
import {
  convertToUIMessages,
  getTextFromMessage,
  getTextFromMessages,
} from "@/lib/utils";
import { requireAuth } from "@/middleware/auth";
import { workflowRunService } from "@/workflows/runtime/workflow-run-service";
import {
  BadRequestError,
  ForbiddenError,
  HttpError,
  RateLimitError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { createUIMessageStreamResponse } from "ai";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";

const promptMentionSchema = z.object({
  kind: z.enum(["agent", "tool"]),
  key: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200).optional(),
});

const deleteQuerySchema = z.object({
  id: z.uuid(),
});

const archiveSchema = z.object({
  id: z.uuid(),
  archived: z.boolean(),
});

const chatIdParamsSchema = z.object({
  id: z.uuid(),
});

const olderMessagesQuerySchema = z.object({
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const messagePartSchema = z
  .object({
    type: z.enum([
      "text",
      "file",
      "reasoning",
      "tool-call",
      "tool-result",
      "source",
    ]),
    text: z.string().optional(),
    reasoning: z.string().optional(),
    url: z.string().optional(),
    name: z.string().optional(),
    filename: z.string().optional(),
    downloadUrl: z.string().url().optional(),
    mediaType: z.string().optional(),
    contentType: z.string().optional(),
    size: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const messageSchema = z
  .object({
    id: z.uuid(),
    role: z.enum(["user", "assistant", "system", "data"]),
    content: z.string().optional().default(""),
    parts: z.array(messagePartSchema).optional(),
    createdAt: z.union([z.string(), z.date(), z.number()]).optional(),
  })
  .passthrough();

const createChatSchema = z.object({
  id: z.uuid(),
  visibility: z.enum(["private", "public"]).default("private"),
  agentIds: z
    .array(z.uuid())
    .max(10)
    .optional()
    .default([])
    .superRefine((ids, ctx) => {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", message: "agentIds must be unique" });
      }
    }),
  message: messageSchema,
  mentions: z.array(promptMentionSchema).max(20).optional().default([]),
});

const router = createRouter();

router.patch(
  "/chat/archive",
  requireAuth,
  zValidator("json", archiveSchema),
  async (c) => {
    const { id, archived } = c.req.valid("json");
    const activeOrganizationId =
      c.get("activeOrgId") ?? (await getActiveOrganizationId(c.req.raw));
    const { user } = c.var;
    if (!activeOrganizationId)
      throw new ForbiddenError("No active organization");

    const existingChat = await db.query.chat.findFirst({
      where: and(eq(chatTable.id, id), eq(chatTable.isDeleted, false)),
    });
    if (!existingChat) throw new BadRequestError("Chat not found");
    if (existingChat.organizationId !== activeOrganizationId) {
      throw new ForbiddenError("Chat does not belong to your organization");
    }
    if (!(await c.di.ChatMemberRepository.isMember(user!.id, id))) {
      throw new ForbiddenError("You are not a member of this chat");
    }

    const updated = await db
      .update(chatTable)
      .set({
        isArchived: archived,
        archivedAt: archived ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(chatTable.id, id))
      .returning({ id: chatTable.id, isArchived: chatTable.isArchived });
    return c.json({ success: true, chat: updated[0] }, 200);
  },
);

function generateTitleFromUserMessages(messages: ChatMessage[]) {
  const fallback = getTextFromMessages(messages).trim().replace(/\s+/g, " ");
  return fallback.slice(0, 80) || "New chat";
}

router.get(
  "/chat/:id/messages",
  requireAuth,
  zValidator("param", chatIdParamsSchema),
  zValidator("query", olderMessagesQuerySchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { before, limit } = c.req.valid("query");
    const { user } = c.var;
    const activeOrganizationId =
      c.get("activeOrgId") ?? (await getActiveOrganizationId(c.req.raw));

    if (!activeOrganizationId) {
      throw new ForbiddenError("No active organization");
    }

    const chat = await db.query.chat.findFirst({
      where: and(eq(chatTable.id, id), eq(chatTable.isDeleted, false)),
    });

    if (!chat || chat.organizationId !== activeOrganizationId) {
      throw new ForbiddenError("Chat not found");
    }

    if (!(await c.di.ChatMemberRepository.isMember(user!.id, id))) {
      throw new ForbiddenError("You are not a member of this chat");
    }

    const page = await messageRepo.findWithCursor(id, {
      cursor: before,
      direction: "before",
      limit,
    });

    return c.json({
      messages: convertToUIMessages(page.items),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    });
  },
);

router.post(
  "/chat",
  requireAuth,
  zValidator("json", createChatSchema),
  async (c) => {
    try {
      const {
        id,
        message,
        visibility: selectedVisibilityType,
        agentIds,
        mentions,
      } = c.req.valid("json");
      const { user } = c.var;
      const di: RequestServices = c.di;
      const activeOrgId = c.get("activeOrgId");

      const messages: ChatMessage[] = [message as ChatMessage];
      const hasText =
        getTextFromMessage(message as ChatMessage).trim().length > 0;
      const hasFile = message.parts?.some((part) => part.type === "file");
      if (message.role !== "user" || (!hasText && !hasFile)) {
        throw new BadRequestError("A non-empty user message is required");
      }

      const activeOrganizationId =
        activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

      const isOrgMember = await isMemberOf(user!.id, activeOrganizationId);
      if (!isOrgMember) {
        throw new ForbiddenError("You are not a member of this organization");
      }

      const existingChat = await db.query.chat.findFirst({
        where: eq(chatTable.id, id),
      });

      // Existing chats are append-only from this endpoint. Authorize the
      // member before evaluating usage limits so a user cannot probe chat
      // state or consume billing checks for a chat they cannot access.
      if (existingChat) {
        if (existingChat.isDeleted) {
          throw new BadRequestError("Chat not found");
        }
        if (existingChat.isArchived) {
          throw new BadRequestError(
            "This chat is archived. Restore it before sending a message.",
          );
        }
        if (existingChat.organizationId !== activeOrganizationId) {
          throw new ForbiddenError("Chat does not belong to your organization");
        }
        if (!(await di.ChatMemberRepository.isMember(user!.id, id))) {
          throw new ForbiddenError("You are not a member of this chat");
        }
      }

      const startOfUtcDay = new Date();
      startOfUtcDay.setUTCHours(0, 0, 0, 0);
      await enforceOrganizationFeatureLimit({
        organizationId: activeOrganizationId,
        feature: "max_messages_per_day",
        current: Number(
          (
            await db
              .select({ current: count() })
              .from(messageTable)
              .innerJoin(chatTable, eq(messageTable.chatId, chatTable.id))
              .where(
                and(
                  eq(chatTable.organizationId, activeOrganizationId),
                  eq(chatTable.isDeleted, false),
                  eq(messageTable.role, "user"),
                  eq(messageTable.isDeleted, false),
                  gte(messageTable.createdAt, startOfUtcDay),
                ),
              )
          )[0]?.current ?? 0,
        ),
        resourceName: "Daily message",
      });

      if (existingChat) {
        const messageResult = await di.PostMessageUseCase.execute({
          id: message.id,
          chatId: id,
          authorId: user!.id,
          content: hasText
            ? getTextFromMessage(message as ChatMessage)
            : "[Attachment]",
          parts: message.parts ?? [],
          attachments:
            message.parts?.filter((part) => part.type === "file") ?? [],
        });
        if (messageResult.isFailure) {
          throw new BadRequestError(
            messageResult.getError() ?? "Unable to post message",
          );
        }
      } else {
        // `c.var.session` is the Better Auth session row, not the complete
        // SessionResponse expected by the permission service. Resolve the full
        // request session here so valid members are not rejected as guests.
        const canCreate = await hasPermission(
          "chat",
          "create",
          activeOrganizationId,
          await getSession(c.req.raw),
        );
        if (!canCreate) {
          throw new ForbiddenError(
            "You don't have permission to create chats in this organization",
          );
        }

        await enforceOrganizationFeatureLimit({
          organizationId: activeOrganizationId,
          feature: "max_chats",
          current: Number(
            (
              await db
                .select({ current: count() })
                .from(chatTable)
                .where(
                  and(
                    eq(chatTable.organizationId, activeOrganizationId),
                    eq(chatTable.isDeleted, false),
                  ),
                )
            )[0]?.current ?? 0,
          ),
          resourceName: "Chat",
        });

        const title = generateTitleFromUserMessages(messages);
        const agents = await Promise.all(
          agentIds.map((agentId) => di.AgentRepository.findById(agentId)),
        );
        if (
          agents.some(
            (agent) =>
              !agent || agent.snapshot.organizationId !== activeOrganizationId,
          )
        ) {
          throw new ForbiddenError(
            "One or more selected agents are not available in this organization",
          );
        }

        const chatResult = await di.CreateChatWithMessageUseCase.execute({
          id,
          messageId: message.id,
          organizationId: activeOrganizationId,
          creatorId: user!.id,
          title,
          visibility: selectedVisibilityType,
          content: hasText
            ? getTextFromMessage(message as ChatMessage)
            : "[Attachment]",
          parts: message.parts ?? [],
          attachments:
            message.parts?.filter((part) => part.type === "file") ?? [],
          agentIds,
        });
        if (chatResult.isFailure) {
          throw new BadRequestError(
            chatResult.getError() ?? "Unable to create chat",
          );
        }
      }

      const run = await workflowRunService.start({
        chatId: id,
        messageId: message.id,
        messages,
        mentions,
        triggerType: "user_message",
        actor: {
          userId: user!.id,
          organizationId: activeOrganizationId,
        },
      });

      await di.WorkflowRunRepository.create({
        id: run.runId,
        chatId: id,
        userId: user!.id,
        organizationId: activeOrganizationId,
      });

      void workflowRunService.run(run.runId).catch((error: unknown) => {
        console.error("[Chat Workflow Error]", error);
      });

      const response = createUIMessageStreamResponse({
        stream: await workflowRunService.getReadable(run.runId),
        headers: {
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
      response.headers.set("x-workflow-run-id", run.runId);
      return response;
    } catch (error) {
      if (error instanceof RateLimitError) return error.toResponse();
      if (error instanceof HttpError) {
        throw error;
      }

      console.error("[Chat Error]", error);
      return c.json({ message: "Internal server error" }, 500);
    }
  },
);

router.delete(
  "/chat",
  requireAuth,
  zValidator("query", deleteQuerySchema),
  async (c) => {
    const { id } = c.req.valid("query");
    const di: RequestServices = c.di;
    const activeOrgId = c.get("activeOrgId");
    const { user } = c.var;

    const activeOrganizationId =
      activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

    if (!activeOrganizationId) {
      throw new ForbiddenError("No active organization");
    }

    const chat = await di.ChatRepository.findById(id);
    if (!chat) {
      throw new BadRequestError("Chat not found");
    }
    if (chat.organizationId !== activeOrganizationId) {
      throw new ForbiddenError("Chat does not belong to your organization");
    }

    const canDeleteAnyChat = await hasPermission(
      "chat",
      "delete",
      activeOrganizationId,
      await getSession(c.req.raw),
    );

    const result = await di.DeleteChatUseCase.execute({
      id,
      organizationId: activeOrganizationId,
      requesterId: user!.id,
      canDeleteAnyChat,
    });
    if (result.isFailure) {
      return new BadRequestError(
        result.getError() ?? "Unable to delete chat",
      ).toResponse();
    }
    return c.json({ success: true }, 200);
  },
);

export default router;
