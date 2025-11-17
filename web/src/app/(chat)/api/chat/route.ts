import { generateTitleFromUserMessage } from "@/app/(chat)/actions";
import { chat, chatAgent, db } from "@/db";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  saveChat,
  saveMessages,
} from "@/db/queries";
import { chatRepo } from "@/db/repositories/chat-repo";
import { systemPrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { executeAgentWithDynamicTools } from "@/lib/ai/tools/executor";
import { agentFactory } from "@/lib/ai/tools/factory";
import { getSession } from "@/lib/auth";
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { SubscriptionManager } from "@/lib/billing/subscription-manager";
import { UsageTracker } from "@/lib/billing/usage-tracker";
import { getAssistantAgentId } from "@/lib/chat/assistant-agent";
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
  streamText,
} from "ai";
import { eq, sql } from "drizzle-orm";
import { unstable_cache as cache } from "next/cache";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
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
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { id, message, selectedVisibilityType, agentIds } =
      requestBody as any;
    const session = await getSession();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

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

    try {
      await UsageRateLimiter.enforce(session.user.id, "api_calls", 1, 60_000);
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (msg.includes("Rate limit exceeded")) {
        return new ChatSDKError("rate_limit:api").toResponse();
      }
      if (msg.includes("No active subscription")) {
        // Gracefully proceed without enforcing per-minute rate limit when no subscription exists
      } else {
        return new ChatSDKError("bad_request:api", msg).toResponse();
      }
    }

    const existingChat = await getChatById({ id });
    let messagesFromDb: any[] = [];
    let createdNewChat = false;

    if (existingChat) {
      if (existingChat.creatorId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      messagesFromDb = await getMessagesByChatId({ id });
    } else {
      if (!agentIds || agentIds.length === 0) {
        return new ChatSDKError("bad_request:chat").toResponse();
      }
      const title = await generateTitleFromUserMessage({ message });
      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
      createdNewChat = true;
      await UsageRateLimiter.trackOnly(session.user.id, "chats_created", 1);
    }

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
        const speakOrder = await chatRepo.getNextSpeakOrder(id);
        await db.insert(chatAgent).values({
          id: generateUUID(),
          chatId: id,
          agentId: aId,
          speakOrder,
          enabled: true,
          addedBy: session.user.id,
        });
      }
    }

    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

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
          userId: session.user.id,
          agentId: null,
          tokenCount: 0,
          cost: "0.000000",
          quotedMessageId: null,
          isEdited: false,
          editedAt: null,
          deleted: false,
          deletedAt: null,
        },
      ],
    });

    await UsageRateLimiter.trackOnly(session.user.id, "chat_messages", 1);

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    let finalUsage: any | undefined;
    let firstAgentId = Array.isArray(agentIds)
      ? agentIds.find((v) => typeof v === "string" && v.length > 0)
      : undefined;
    let agent =
      typeof firstAgentId === "string" && firstAgentId.length > 0
        ? await agentFactory.get(firstAgentId, session.user.id)
        : null;

    if (!agent) {
      firstAgentId = await getAssistantAgentId(id, session.user.id);
      agent = await agentFactory.get(firstAgentId, session.user.id);
    }

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        if (agent && firstAgentId) {
          const { result } = await executeAgentWithDynamicTools({
            userId: session.user.id,
            chatId: id,
            agentId: firstAgentId,
            messages: convertToModelMessages(uiMessages),
            dataStream,
          });
          result.consumeStream();
          dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));
        } else {
          const headers = request.headers;
          const requestHints = {
            latitude: headers.get("x-vercel-ip-latitude") || "0",
            longitude: headers.get("x-vercel-ip-longitude") || "0",
            city: headers.get("x-vercel-ip-city") || "",
            country: headers.get("x-vercel-ip-country") || "",
          } as any;
          const result = streamText({
            model: myProvider.languageModel("chat-model"),
            system: systemPrompt({
              selectedChatModel: "chat-model",
              requestHints,
            }),
            messages: convertToModelMessages(uiMessages),
            onFinish: async ({ usage }) => {
              finalUsage = usage;
              dataStream.write({
                type: "data-usage",
                data: usage as any,
                transient: true,
              });
            },
          });
          result.consumeStream();
          dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        const toSave = messages
          .filter((m) => m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role,
            parts: m.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
            userId: null,
            agentId: firstAgentId!,
            content: getTextFromMessage(m),
            tokenCount: 0,
            cost: "0.000000",
            quotedMessageId: null,
            isEdited: false,
            editedAt: null,
            deleted: false,
            deletedAt: null,
          }));
        if (finalUsage) {
          const inputTokens = Number(finalUsage.inputTokens || 0);
          const outputTokens = Number(finalUsage.outputTokens || 0);
          const totalTokens = inputTokens + outputTokens;
          const modelId = agent?.config?.model ?? "gemini-2.5-flash";
          const costNum = calculateCostFromUsage(
            String(modelId),
            inputTokens,
            outputTokens,
          );
          for (const msg of toSave) {
            if (msg.role === "assistant") {
              msg.tokenCount = totalTokens;
              msg.cost = String(costNum.toFixed ? costNum.toFixed(6) : costNum);
            }
          }
          await db
            .update(chat)
            .set({
              messageCount: sql`message_count + ${toSave.length}`,
              totalTokens: sql`total_tokens + ${totalTokens}`,
              totalCost: sql`total_cost + ${costNum}`,
            })
            .where(eq(chat.id, id));
        }
        await saveMessages({ messages: toSave as any });
      },
      onError: () => {
        return "Oops, an error occurred!";
      },
    });

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

  if (chat?.creatorId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
