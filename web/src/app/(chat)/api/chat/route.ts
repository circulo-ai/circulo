import { streamAgent } from "@/ai/agent/runner";
import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from "@/db/queries";
import { agentRepo } from "@/db/repositories/agent-repo";
import { chatRepo } from "@/db/repositories/chat-repo";
import { getSession } from "@/lib/auth";
import { ChatSDKError } from "@/lib/errors";
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

import {
  checkResourceLimit,
  preExecutionCheck,
  RateLimitError,
  trackChatUsage,
  UsageLimitError,
} from "@/lib/billing/circulo";

import { postRequestBodySchema, type PostRequestBody } from "./schema";

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
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

export async function POST(request: Request) {
  let requestBody: PostRequestBody;
  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (e) {
    console.log(e);
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { id, message, selectedVisibilityType, agentIds } = requestBody;
    const session = await getSession();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userId = session.user.id;
    const activeOrganizationId =
      (session as any)?.session?.activeOrganizationId ||
      (session as any)?.activeOrganizationId;

    if (!activeOrganizationId) {
      return new ChatSDKError(
        "bad_request:api",
        "No active organization",
      ).toResponse();
    }

    // ==================== NEW BILLING CHECKS ====================

    const existingChat = await getChatById({ id });
    let messagesFromDb: any[] = [];
    let createdNewChat = false;

    if (existingChat) {
      // Existing chat - check execution permissions
      if (existingChat.creatorId !== userId) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }

      // Pre-execution check (rate limits + usage limits)
      const executionCheck = await preExecutionCheck({
        chatId: id,
        organizationId: activeOrganizationId,
        userId,
        requestType: "syncApi",
      });

      if (!executionCheck.allowed) {
        // Determine error type for appropriate response
        if (
          executionCheck.rateLimitInfo &&
          !executionCheck.rateLimitInfo.allowed
        ) {
          return new ChatSDKError(
            "rate_limit:chat",
            `Rate limit exceeded. Try again in ${executionCheck.rateLimitInfo.retryAfter} seconds.`,
          ).toResponse();
        }
        return new ChatSDKError(
          "rate_limit:chat",
          executionCheck.reason || "Usage limit exceeded",
        ).toResponse();
      }

      messagesFromDb = await getMessagesByChatId({ id });
    } else {
      // New chat - check resource limit first
      const chatLimitCheck = await checkResourceLimit(
        activeOrganizationId,
        "chats",
      );
      if (!chatLimitCheck.allowed) {
        return new ChatSDKError(
          "rate_limit:chat",
          chatLimitCheck.reason || "Chat limit reached",
        ).toResponse();
      }

      // Then check execution permissions
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
          return new ChatSDKError(
            "rate_limit:chat",
            `Rate limit exceeded. Try again in ${executionCheck.rateLimitInfo.retryAfter} seconds.`,
          ).toResponse();
        }
        return new ChatSDKError(
          "rate_limit:chat",
          executionCheck.reason || "Usage limit exceeded",
        ).toResponse();
      }

      // Create the chat
      const title = await generateTitleFromUserMessage({ message });
      await saveChat({
        id,
        userId,
        title,
        visibility: selectedVisibilityType as any,
        organizationId: activeOrganizationId,
      });
      createdNewChat = true;
    }

    // Check agent limits for new chats with agents
    if (createdNewChat && agentIds && agentIds.length > 0) {
      const agentLimitCheck = await checkResourceLimit(
        activeOrganizationId,
        "chatAgents",
        { chatId: id, additionalCount: agentIds.length },
      );
      if (!agentLimitCheck.allowed) {
        // Chat was created but can't add all agents - proceed with available slots
        console.warn(
          "Cannot add all requested agents:",
          agentLimitCheck.reason,
        );
      }
    }

    // ==================== END BILLING CHECKS ====================

    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    // Save user message
    await saveMessages({
      messages: [
        {
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
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // Resolve agent
    let firstAgentId = Array.isArray(agentIds)
      ? agentIds.find((v) => typeof v === "string" && v.length > 0)
      : undefined;

    let agent: any = null;

    if (firstAgentId) {
      agent = await agentRepo.findById(firstAgentId);
    }

    if (!agent) {
      const chatAgents = await chatRepo.findAgentsForChat(id);
      if (chatAgents && chatAgents.length > 0) {
        agent = chatAgents[0];
        firstAgentId = agent.id;
      }
    }

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

          // Capture usage from the result if available
          result.consumeStream();

          // If your streamAgent returns usage, capture it here
          // This depends on your AI SDK implementation
          // result.usage would contain { promptTokens, completionTokens }

          dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        const assistantMessages = messages.filter(
          (m) => m.role === "assistant",
        );

        if (assistantMessages.length === 0) {
          return;
        }

        const authorId = firstAgentId ?? "system_fallback";
        const modelId =
          agent?.model ?? agent?.config?.model ?? "gemini-2.5-flash";

        // Calculate cost from usage
        const inputTokens = usage?.promptTokens ?? 0;
        const outputTokens = usage?.completionTokens ?? 0;
        const cost = calculateModelCost(modelId, inputTokens, outputTokens);

        // ==================== TRACK USAGE ====================
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
        // ==================== END TRACK USAGE ====================

        // Map to DB Schema
        const toSave = assistantMessages.map((m) => ({
          id: m.id,
          chatId: id,
          role: m.role,
          content: getTextFromMessage(m),
          parts: m.parts as unknown as any[],
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

        await saveMessages({ messages: toSave });
      },
      onError: () => {
        return "Oops, an error occurred!";
      },
    });

    // Use resumable stream if available
    const streamContext = getStreamContext();
    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () =>
          stream.pipeThrough(new JsonToSseTransformStream()),
        ),
      );
    }

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    // Handle billing-specific errors
    if (error instanceof RateLimitError) {
      return new ChatSDKError(
        "rate_limit:api",
        `Rate limited. Retry after ${error.retryAfter} seconds.`,
      ).toResponse();
    }

    if (error instanceof UsageLimitError) {
      return new ChatSDKError(
        "rate_limit:chat",
        `Usage limit exceeded: $${error.currentUsage.toFixed(2)} of $${error.limit.toFixed(2)}`,
      ).toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests",
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await getSession();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (!chat) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  if (chat.creatorId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
