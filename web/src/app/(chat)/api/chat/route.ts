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
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { SubscriptionManager } from "@/lib/billing/subscription-manager";
import { UsageTracker } from "@/lib/billing/usage-tracker";
import { ChatSDKError } from "@/lib/errors";
import { calculateCostFromUsage } from "@/lib/server-utils";
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
import { unstable_cache as cache } from "next/cache";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream/ioredis";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { postRequestBodySchema, type PostRequestBody } from "./schema";

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

const getTokenlensCatalog = cache(
  async (): Promise<ModelCatalog | undefined> => {
    try {
      return await fetchModels();
    } catch (err) {
      console.warn(
        "TokenLens: catalog fetch failed, using default catalog",
        err,
      );
      return; // tokenlens helpers will fall back to defaultCatalog
    }
  },
  ["tokenlens-catalog"],
  { revalidate: 24 * 60 * 60 }, // 24 hours
);

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

    // Check subscription limits
    const subscription = await SubscriptionManager.getActiveSubscription(
      session.user.id,
    );
    if (subscription) {
      const dailyLimit = subscription.features.maxMessagesPerDay;
      if (dailyLimit != null) {
        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const chatMessagesToday = await UsageTracker.getUsage(
          session.user.id,
          "chat_messages",
          dayStart,
          now,
        );
        if (chatMessagesToday >= dailyLimit) {
          return new ChatSDKError("rate_limit:chat").toResponse();
        }
      }
    }

    // TODO: Rate limiting
    // try {
    //   await UsageRateLimiter.enforce(session.user.id, "api_calls", 1);
    // } catch (err: any) {
    //   const msg = String(err?.message || "");
    //   if (msg.includes("Rate limit exceeded")) {
    //     return new ChatSDKError("rate_limit:api").toResponse();
    //   }
    //   if (msg.includes("No active subscription")) {
    //     // Gracefully proceed without enforcing per-minute rate limit when no subscription exists
    //   } else {
    //     return new ChatSDKError("bad_request:api", msg).toResponse();
    //   }
    // }

    const existingChat = await getChatById({ id });
    let messagesFromDb: any[] = [];
    let createdNewChat = false;

    if (existingChat) {
      if (existingChat.creatorId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      messagesFromDb = await getMessagesByChatId({ id });
    } else {
      const title = await generateTitleFromUserMessage({ message });
      const activeOrganizationId =
        (session as any)?.session?.activeOrganizationId ||
        (session as any)?.activeOrganizationId;
      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType as any,
        organizationId: activeOrganizationId,
      });
      createdNewChat = true;
      await UsageTracker.track(session.user.id, "chats_created", 1);
    }

    // Check agent limits for new chats
    if (createdNewChat && agentIds && agentIds.length > 0) {
      for (const aId of agentIds) {
        const { allowed } = await UsageRateLimiter.canPerformAction(
          session.user.id,
          "add_chat_agent",
          { chatId: id },
        );
        if (!allowed) {
          break;
        }
      }
    }

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
          authorId: session.user.id,
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

    await UsageTracker.track(session.user.id, "chat_messages", 1);

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    let finalUsage: any | undefined;

    // 1. specific agent requested
    let firstAgentId = Array.isArray(agentIds)
      ? agentIds.find((v) => typeof v === "string" && v.length > 0)
      : undefined;

    let agent: any = null;

    if (firstAgentId) {
      // Fetch directly from DB
      agent = await agentRepo.findById(firstAgentId);
    }

    // 2. Fallback: If no specific agent, find the first enabled agent for this chat
    if (!agent) {
      // Use chatRepo to find agents linked to this chat
      // TODO: Implement agent orchestration
      const chatAgents = await chatRepo.findAgentsForChat(id);

      if (chatAgents && chatAgents.length > 0) {
        // Default to the first agent attached to the chat
        agent = chatAgents[0];
        firstAgentId = agent.id;
      }
    }

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        if (agent && firstAgentId) {
          const activeOrganizationId =
            (session as any)?.session?.activeOrganizationId ||
            (session as any)?.activeOrganizationId ||
            "";
          const result = await streamAgent({
            agentId: firstAgentId,
            chatId: id,
            userId: session.user.id,
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

        if (assistantMessages.length === 0) {
          return;
        }

        // Ensure we have a valid authorId.
        // If logic permits 'system' or non-agent responses, handle fallback here.
        const authorId = firstAgentId ?? "system_fallback";

        // Map to DB Schema
        const toSave = assistantMessages.map((m) => ({
          id: m.id,
          chatId: id,
          role: m.role,
          content: getTextFromMessage(m),
          // Ensure parts is treated as a JSON-compatible array
          parts: m.parts as unknown as any[],
          attachments: [],
          authorType: "agent" as const,
          authorId: authorId,
          createdAt: new Date(),

          // Token/Cost default initialization
          tokenCount: 0,
          cost: "0.000000",

          quotedMessageId: null,
          isEdited: false,
          editedAt: null,

          isDeleted: false,
          deletedAt: null,
        }));

        // Calculate cost if usage data is available
        if (finalUsage) {
          const inputTokens = Number(finalUsage.inputTokens || 0);
          const outputTokens = Number(finalUsage.outputTokens || 0);
          const totalTokens = inputTokens + outputTokens;
          const modelId =
            agent?.model ?? agent?.config?.model ?? "gemini-2.5-flash";

          const costNum = calculateCostFromUsage(
            String(modelId),
            inputTokens,
            outputTokens,
          );

          for (const msg of toSave) {
            msg.tokenCount = totalTokens;
            msg.cost = String(costNum.toFixed ? costNum.toFixed(6) : costNum);
          }
        }

        // Save to DB
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
