import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import { chatRepo } from "@/db/repositories/chat-repo";
import { messageRepo } from "@/db/repositories/message-repo";
import { getActiveOrganizationId } from "@/lib/auth";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import { ForbiddenError, NotFoundError, createSafeRoute } from "@/lib/server";
import { authMiddleware } from "@/lib/server/middlewares";
import { getTextFromMessage } from "@/lib/utils";
import { orchestrateWorkflow } from "@/workflows/orchestrate/orchestrate";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { createUIMessageStreamResponse } from "ai";
import { start } from "workflow/api";
import { deleteQuerySchema } from "./schema";

export const maxDuration = 60;

export const POST = createSafeRoute({})
  .methods("POST")
  .use(authMiddleware())
  .handler(async (request, ctx) => {
    console.log(ctx.body);
    const { id, message, selectedVisibilityType } = ctx.body as any;
    const {
      user: { id: userId },
    } = ctx.data;

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
      const title = await generateTitleFromUserMessage({ message });
      await chatRepo.create({
        id,
        creatorId: userId,
        title,
        visibility: selectedVisibilityType as any,
        organizationId: activeOrganizationId,
      });
    }

    // Save user message
    await messageRepo.create({
      chatId: id,
      id: message.id,
      role: "user",
      parts: message.parts,
      attachments: [],
      content: getTextFromMessage(message),
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
    });

    // Start the workflow
    const orchestrationInput: OrchestrationInput = {
      chatId: id,
      messageId: message.id,
      triggerType: "user_message",
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

export const DELETE = createSafeRoute({})
  .methods("DELETE")
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
