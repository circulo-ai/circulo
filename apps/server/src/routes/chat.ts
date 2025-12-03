import { chatRepo } from "@/db/repositories/chat-repo";
import { messageRepo } from "@/db/repositories/message-repo";
import { getActiveOrganizationId } from "@/lib/auth";
import { titlePrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { getTextFromMessage, getTextFromMessages } from "@/lib/utils";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import { createRouter } from "@/lib/create-app";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  HttpError,
} from "@/lib/server/errors";
import { requireAuth } from "@/middleware/auth";
import { type ChatMessage } from "@/lib/types";
import {
  createUIMessageStreamResponse,
  generateText,
  safeValidateUIMessages,
} from "ai";
import { zValidator } from "@hono/zod-validator";
import { start } from "workflow/api";
import { orchestrateWorkflow } from "@/workflows/orchestrate/orchestrate";
import { type OrchestrationInput } from "@/workflows/orchestrate/types";
import { z } from "zod";

const deleteQuerySchema = z.object({
  id: z.string().uuid(),
});

const createChatSchema = z.object({
  id: z.string().uuid(),
  visibility: z.enum(["private", "public"]).default("private"),
  message: z.unknown().refine(async (value) => {
    const { success } = await safeValidateUIMessages<ChatMessage>({
      messages: [value],
    });
    return success;
  }),
});

const router = createRouter();

async function generateTitleFromUserMessages({
  messages,
}: {
  messages: ChatMessage[];
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel("title-model"),
    system: titlePrompt,
    prompt: getTextFromMessages(messages),
  });

  return title;
}

router.post(
  "/chat",
  requireAuth,
  zValidator("json", createChatSchema),
  async (c) => {
    try {
      const { id, message, visibility: selectedVisibilityType } =
        c.req.valid("json");
      const { user, session, activeOrgId } = c.var;

      const messages: ChatMessage[] = [message as ChatMessage];

      const activeOrganizationId =
        activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

      const isOrgMember = await isMemberOf(user!.id, activeOrganizationId);
      if (!isOrgMember) {
        throw new ForbiddenError(
          "You are not a member of this organization",
        );
      }

      const existingChat = await chatRepo.findById(id);

      if (existingChat) {
        if (existingChat.creatorId !== user!.id) {
          if (existingChat.organizationId !== activeOrganizationId) {
            throw new ForbiddenError("You don't have access to this chat");
          }

          const canUpdate = await hasPermission(
            "chat",
            "update",
            activeOrganizationId,
            session as any,
          );
          if (!canUpdate) {
            throw new ForbiddenError(
              "You don't have permission to update chats in this organization",
            );
          }
        }
      } else {
        const canCreate = await hasPermission(
          "chat",
          "create",
          activeOrganizationId,
          session as any,
        );
        if (!canCreate) {
          throw new ForbiddenError(
            "You don't have permission to create chats in this organization",
          );
        }

        const title = await generateTitleFromUserMessages({ messages });
        await chatRepo.create({
          id,
          creatorId: user!.id,
          title,
          visibility: selectedVisibilityType,
          organizationId: activeOrganizationId,
        });
      }

      await messageRepo.createMany(
        messages.map((msg) => {
          return {
            chatId: id,
            id: msg.id,
            role: "user",
            parts: msg.parts,
            attachments: [],
            content: getTextFromMessage(msg),
            createdAt: new Date(),
            authorType: "user",
            authorId: user!.id,
            tokenCount: 0,
            cost: "0.000000",
            quotedMessageId: null,
            isEdited: false,
            editedAt: null,
            isDeleted: false,
            deletedAt: null,
          };
        }),
      );

      const orchestrationInput: OrchestrationInput = {
        chatId: id,
        messages: messages,
        triggerType: "user_message",
        session: session as any,
      };

      const run = await start(orchestrateWorkflow, [orchestrationInput]);
      const workflowStream = run.readable;

      return createUIMessageStreamResponse({
        stream: workflowStream,
        headers: {
          "x-workflow-run-id": run.runId,
        },
      });
    } catch (error) {
      if (error instanceof RateLimitError) return error.toResponse();
      if (
        error instanceof Error &&
        error.message?.includes("AI Gateway requires a valid credit card")
      ) {
        return new BadRequestError(
          "AI Gateway requires a valid credit card",
        ).toResponse();
      }
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
    const { user, activeOrgId } = c.var;

    const activeOrganizationId =
      activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

    if (!activeOrganizationId) {
      throw new ForbiddenError("No active organization");
    }

    const chat = await chatRepo.findById(id);

    if (!chat) {
      throw new NotFoundError("Chat not found");
    }

    if (chat.organizationId !== activeOrganizationId) {
      throw new ForbiddenError("Chat does not belong to your organization");
    }

    if (chat.creatorId !== user!.id) {
      const canDelete = await hasPermission(
        "chat",
        "delete",
        activeOrganizationId,
        c.var.session as any,
      );
      if (!canDelete) {
        throw new ForbiddenError(
          "You don't have permission to delete this chat",
        );
      }
    }

    const deletedChat = await chatRepo.softDelete(id);
    return c.json(deletedChat, 200);
  },
);

export default router;
