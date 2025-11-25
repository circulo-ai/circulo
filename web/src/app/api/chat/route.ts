import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import { chatRepo } from "@/db/repositories/chat-repo";
import { messageRepo } from "@/db/repositories/message-repo";
import { ChatSDKError } from "@/lib/errors";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import {
  createSafeRoute,
  MethodNotAllowedError,
  ValidationError,
} from "@/lib/server";
import { authMiddleware } from "@/lib/server/middlewares";
import { RateLimitError } from "@/lib/server/middlewares/rateLimit";
import { getTextFromMessage } from "@/lib/utils";
import { orchestrateWorkflow } from "@/workflows/orchestrate/orchestrate";
import { OrchestrationInput } from "@/workflows/orchestrate/types";
import { start } from "workflow/api";
import { deleteQuerySchema, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function handleChatError(error: Error): Response {
  if (error instanceof ValidationError) {
    return new ChatSDKError("bad_request:api", error.message).toResponse();
  }

  if (error instanceof MethodNotAllowedError) {
    return new ChatSDKError("bad_request:api", error.message).toResponse();
  }

  if (error instanceof ChatSDKError) {
    return error.toResponse();
  }

  if (error instanceof RateLimitError) {
    return new ChatSDKError(
      "rate_limit:api",
      `Rate limited. Retry after ${error.retryAfter} seconds.`,
    ).toResponse();
  }

  if (error.message?.includes("AI Gateway requires a valid credit card")) {
    return new ChatSDKError("bad_request:activate_gateway").toResponse();
  }

  console.error("Unhandled error in chat API:", error);
  return new ChatSDKError("offline:chat").toResponse();
}

export const POST = createSafeRoute({ handleServerError: handleChatError })
  .methods("POST")
  .body(postRequestBodySchema)
  .use(authMiddleware())
  .handler(async (request, ctx) => {
    const { id, message, selectedVisibilityType, agentIds } = ctx.body;
    const {
      user: { id: userId },
      activeOrganizationId,
    } = ctx.data;

    if (!activeOrganizationId) {
      throw new ChatSDKError("forbidden:chat", "No active organization");
    }

    // Verify user is member of the organization
    const isOrgMember = await isMemberOf(userId, activeOrganizationId);
    if (!isOrgMember) {
      throw new ChatSDKError(
        "forbidden:chat",
        "You are not a member of this organization",
      );
    }

    const existingChat = await chatRepo.findById(id);
    let createdNewChat = false;

    if (existingChat) {
      // Existing chat - verify access
      if (existingChat.creatorId !== userId) {
        if (existingChat.organizationId !== activeOrganizationId) {
          throw new ChatSDKError(
            "forbidden:chat",
            "You don't have access to this chat",
          );
        }

        const canUpdate = await hasPermission(
          "chat",
          "update",
          activeOrganizationId,
        );
        if (!canUpdate) {
          throw new ChatSDKError(
            "forbidden:chat",
            "You don't have permission to update chats in this organization",
          );
        }
      }

      // Pre-execution checks (rate limits, etc.)
      const executionCheck = await preExecutionCheck({
        chatId: id,
        organizationId: activeOrganizationId,
        userId,
        requestType: "syncApi",
      });

      if (!executionCheck.allowed) {
        if (
          executionCheck.rateLimitInfo &&
          !executionCheck.rateLimitInfo.allowed
        ) {
          throw new ChatSDKError(
            "rate_limit:chat",
            `Rate limit exceeded. Try again in ${executionCheck.rateLimitInfo.retryAfter} seconds.`,
          );
        }
        throw new ChatSDKError(
          "rate_limit:chat",
          executionCheck.reason || "Usage limit exceeded",
        );
      }
    } else {
      // New chat - check permission to create
      const canCreate = await hasPermission(
        "chat",
        "create",
        activeOrganizationId,
      );
      if (!canCreate) {
        throw new ChatSDKError(
          "forbidden:chat",
          "You don't have permission to create chats in this organization",
        );
      }

      // Check resource limits
      const chatLimitCheck = await checkResourceLimit(
        activeOrganizationId,
        "chats",
      );
      if (!chatLimitCheck.allowed) {
        throw new ChatSDKError(
          "rate_limit:chat",
          chatLimitCheck.reason || "Chat limit reached",
        );
      }

      const executionCheck = await preExecutionCheck({
        organizationId: activeOrganizationId,
        userId,
        requestType: "syncApi",
      });

      if (!executionCheck.allowed) {
        if (
          executionCheck.rateLimitInfo &&
          !executionCheck.rateLimitInfo.allowed
        ) {
          throw new ChatSDKError(
            "rate_limit:chat",
            `Rate limit exceeded. Try again in ${executionCheck.rateLimitInfo.retryAfter} seconds.`,
          );
        }
        throw new ChatSDKError(
          "rate_limit:chat",
          executionCheck.reason || "Usage limit exceeded",
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
      createdNewChat = true;
    }

    // Check agent limits for new chats
    if (createdNewChat && agentIds?.length) {
      const agentLimitCheck = await checkResourceLimit(
        activeOrganizationId,
        "chatAgents",
        {
          chatId: id,
          additionalCount: agentIds.length,
        },
      );
      if (!agentLimitCheck.allowed) {
        console.warn(
          "Cannot add all requested agents:",
          agentLimitCheck.reason,
        );
      }
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

    // Start the workflow - IT HANDLES STREAMING AUTOMATICALLY!
    const orchestrationInput: OrchestrationInput = {
      chatId: id,
      messageId: message.id,
      triggerType: "user_message",
    };

    const run = await start(orchestrateWorkflow, [orchestrationInput]);

    // CRITICAL: Return the workflow stream with the x-workflow-run-id header
    // This enables WorkflowChatTransport to automatically reconnect
    return new Response(run.getReadable({ namespace: id }), {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "x-workflow-run-id": run.runId,
      },
    });
  });

export const DELETE = createSafeRoute({ handleServerError: handleChatError })
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
      throw new ChatSDKError("forbidden:chat", "No active organization");
    }

    const chat = await chatRepo.findById(id);

    if (!chat) {
      throw new ChatSDKError("not_found:chat", "Chat not found");
    }

    if (chat.organizationId !== activeOrganizationId) {
      throw new ChatSDKError(
        "forbidden:chat",
        "Chat does not belong to your organization",
      );
    }

    if (chat.creatorId !== userId) {
      const canDelete = await hasPermission(
        "chat",
        "delete",
        activeOrganizationId,
      );
      if (!canDelete) {
        throw new ChatSDKError(
          "forbidden:chat",
          "You don't have permission to delete this chat",
        );
      }
    }

    const deletedChat = await chatRepo.softDelete(id);
    return Response.json(deletedChat, { status: 200 });
  });

// Placeholder functions
async function preExecutionCheck(params: any): Promise<any> {
  return { allowed: true };
}

async function checkResourceLimit(
  organizationId: string,
  resourceType: string,
  options?: any,
): Promise<any> {
  return { allowed: true };
}
