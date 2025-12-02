import { generateTitleFromUserMessages } from "@/app/(chat)/actions";
import { chatRepo } from "@/db/repositories/chat-repo";
import { messageRepo } from "@/db/repositories/message-repo";
import { getActiveOrganizationId } from "@/lib/auth";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import {
  BadRequestError,
  createErrorHandler,
  createSafeRoute,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
} from "@/lib/server";
import { authMiddleware } from "@/lib/server/middlewares";
import { ChatMessage } from "@/lib/types";
import { getTextFromMessage } from "@/lib/utils";
import { orchestrateWorkflow } from "@/workflows/orchestrate/orchestrate";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { createUIMessageStreamResponse, safeValidateUIMessages } from "ai";
import { start } from "workflow/api";
import z from "zod";
import { deleteQuerySchema } from "./schema";

export const maxDuration = 60;

const handleChatError = createErrorHandler((error) => {
  if (error instanceof RateLimitError) return error.toResponse();
  if (error.message?.includes("AI Gateway requires a valid credit card")) {
    return new BadRequestError(
      "AI Gateway requires a valid credit card",
    ).toResponse();
  }
  return null;
});

const createChatSchema = z.object({
  id: z.uuid(),
  visibility: z.enum(["private", "public"]).default("private"),
  message: z.unknown().refine(async (value) => {
    const { success } = await safeValidateUIMessages<ChatMessage>({
      messages: [value],
    });
    return success;
  }),
});

export const POST = createSafeRoute({ handleServerError: handleChatError })
  .use(authMiddleware())
  .body(createChatSchema)
  .handler(async (_, ctx) => {
    console.log(ctx.body);
    const { id, message, visibility: selectedVisibilityType } = ctx.body;
    const {
      user: { id: userId },
    } = ctx.data;

    const messages: ChatMessage[] = [message as ChatMessage];

    const activeOrganizationId = await getActiveOrganizationId();

    // Verify user is member of the organization
    const isOrgMember = await isMemberOf(userId, activeOrganizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You are not a member of this organization");
    }

    const existingChat = await chatRepo.findById(id);

    if (existingChat) {
      // Existing chat - verify access
      if (existingChat.creatorId !== userId) {
        if (existingChat.organizationId !== activeOrganizationId) {
          throw new ForbiddenError("You don't have access to this chat");
        }

        const canUpdate = await hasPermission(
          "chat",
          "update",
          activeOrganizationId,
        );
        if (!canUpdate) {
          throw new ForbiddenError(
            "You don't have permission to update chats in this organization",
          );
        }
      }
    } else {
      // New chat - check permission to create
      const canCreate = await hasPermission(
        "chat",
        "create",
        activeOrganizationId,
      );
      if (!canCreate) {
        throw new ForbiddenError(
          "You don't have permission to create chats in this organization",
        );
      }

      // Create the chat
      const title = await generateTitleFromUserMessages({ messages });
      await chatRepo.create({
        id,
        creatorId: userId,
        title,
        visibility: selectedVisibilityType,
        organizationId: activeOrganizationId,
      });
    }

    // Save user message
    await messageRepo.createMany(
      messages.map((e) => {
        return {
          chatId: id,
          id: e.id,
          role: "user",
          parts: e.parts,
          attachments: [],
          content: getTextFromMessage(e),
          createdAt: new Date(),
          authorType: "user",
          authorId: userId,
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

    // Start the workflow
    const orchestrationInput: OrchestrationInput = {
      chatId: id,
      messages: messages,
      triggerType: "user_message",
      session: ctx.data.session,
    };

    const run = await start(orchestrateWorkflow, [orchestrationInput]);
    const workflowStream = run.readable;

    return createUIMessageStreamResponse({
      stream: workflowStream,
      headers: {
        "x-workflow-run-id": run.runId,
      },
    });
  });

export const DELETE = createSafeRoute({ handleServerError: handleChatError })
  .query(deleteQuerySchema)
  .use(authMiddleware())
  .handler(async (request, ctx) => {
    const { id } = ctx.query;
    const {
      user: { id: userId },
      activeOrganizationId,
    } = ctx.data;

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

    if (chat.creatorId !== userId) {
      const canDelete = await hasPermission(
        "chat",
        "delete",
        activeOrganizationId,
      );
      if (!canDelete) {
        throw new ForbiddenError(
          "You don't have permission to delete this chat",
        );
      }
    }

    const deletedChat = await chatRepo.softDelete(id);
    return Response.json(deletedChat, { status: 200 });
  });
