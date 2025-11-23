import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import { agentRepo } from "@/db/repositories/agent-repo";
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
import {
  convertToUIMessages,
  generateUUID,
  getTextFromMessage,
} from "@/lib/utils";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
} from "ai";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream/ioredis";
import { deleteQuerySchema, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

// Resumable stream context singleton
let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({ waitUntil: after });
    } catch (error: any) {
      if (error.message.includes("REDIS_URL")) {
        console.log(
          " > Resumable streams are disabled due to missing REDIS_URL",
        );
      } else {
        console.error(error);
      }
    }
  }
  return globalStreamContext;
}

function handleChatError(error: Error): Response {
  // Validation errors
  if (error instanceof ValidationError) {
    return new ChatSDKError("bad_request:api", error.message).toResponse();
  }

  // Method not allowed
  if (error instanceof MethodNotAllowedError) {
    return new ChatSDKError("bad_request:api", error.message).toResponse();
  }

  // ChatSDK errors pass through
  if (error instanceof ChatSDKError) {
    return error.toResponse();
  }

  // Billing errors
  if (error instanceof RateLimitError) {
    return new ChatSDKError(
      "rate_limit:api",
      `Rate limited. Retry after ${error.retryAfter} seconds.`,
    ).toResponse();
  }

  // AI Gateway error
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
    let messagesFromDb: any[] = [];
    let createdNewChat = false;

    if (existingChat) {
      // Existing chat - verify access
      if (existingChat.creatorId !== userId) {
        // Check if user has access via organization membership
        if (existingChat.organizationId !== activeOrganizationId) {
          throw new ChatSDKError(
            "forbidden:chat",
            "You don't have access to this chat",
          );
        }

        // Check if user can update chats in this organization
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

      // Pre-execution check (rate limits + usage limits)
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

      messagesFromDb = await messageRepo.findForChat(id);
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

      // Check resource limit
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

      // Check execution permissions
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

    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

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

    const streamId = generateUUID();
    // Create stream ID if you have this functionality
    // await createStreamId({ streamId, chatId: id });

    // Resolve agent
    let firstAgentId = agentIds?.find(
      (v) => typeof v === "string" && v.length > 0,
    );
    let agent: any = null;

    if (firstAgentId) {
      agent = await agentRepo.findById(firstAgentId);

      // Verify agent belongs to the organization
      if (agent && agent.organizationId !== activeOrganizationId) {
        throw new ChatSDKError(
          "forbidden:chat",
          "Agent does not belong to your organization",
        );
      }
    }

    if (!agent) {
      const chatAgents = await chatRepo.findAgentsForChat(id);
      if (chatAgents?.length) {
        // Verify first agent belongs to organization
        const firstAgent = chatAgents[0];
        if (firstAgent.organizationId === activeOrganizationId) {
          agent = firstAgent;
          firstAgentId = agent.id;
        }
      }
    }

    // Capture usage for cost tracking
    let usage: { promptTokens?: number; completionTokens?: number } | undefined;

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        if (agent && firstAgentId) {
          const result = await streamAgent({
            agentId: firstAgentId,
            chatId: id,
            userId,
            organizationId: activeOrganizationId,
            messages: convertToModelMessages(uiMessages),
          });

          result.consumeStream();
          dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        const assistantMessages = messages.filter(
          (m) => m.role === "assistant",
        );
        if (!assistantMessages.length) return;

        const authorId = firstAgentId ?? "system_fallback";
        const modelId =
          agent?.model ?? agent?.config?.model ?? "gemini-2.5-flash";
        const inputTokens = usage?.promptTokens ?? 0;
        const outputTokens = usage?.completionTokens ?? 0;
        const cost = calculateModelCost(modelId, inputTokens, outputTokens);

        // Track usage
        await trackChatUsage({
          chatId: id,
          userId,
          cost,
          metadata: {
            agentId: firstAgentId,
            modelId,
            inputTokens,
            outputTokens,
          },
        });

        // Save messages
        const messagesToSave = assistantMessages.map((m) => ({
          id: m.id,
          chatId: id,
          role: m.role,
          content: getTextFromMessage(m),
          parts: m.parts as any[],
          attachments: [],
          authorType: "agent" as const,
          authorId,
          createdAt: new Date(),
          tokenCount: inputTokens + outputTokens,
          cost: cost.toFixed(6),
          quotedMessageId: null,
          isEdited: false,
          editedAt: null,
          isDeleted: false,
          deletedAt: null,
        }));

        for (const msg of messagesToSave) {
          await messageRepo.create(msg);
        }
      },
      onError: () => "Oops, an error occurred!",
    });

    // Return with resumable stream if available
    const streamContext = getStreamContext();
    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () =>
          stream.pipeThrough(new JsonToSseTransformStream()),
        ),
      );
    }

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
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

    // Verify chat belongs to the organization
    if (chat.organizationId !== activeOrganizationId) {
      throw new ChatSDKError(
        "forbidden:chat",
        "Chat does not belong to your organization",
      );
    }

    // Check if user owns the chat OR has delete permission
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

// Helper function (add your actual implementation)
function calculateModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Your cost calculation logic here
  return 0;
}

// Placeholder functions - implement based on your requirements
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

async function streamAgent(params: any): Promise<any> {
  // Your agent streaming implementation
  throw new Error("streamAgent not implemented");
}

async function trackChatUsage(params: any): Promise<void> {
  // Your usage tracking implementation
}
