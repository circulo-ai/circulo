import { api, notFound, noContent, success } from "@/lib/server";
import { chat as chatWorkflow } from "@/workflows/chat";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { start } from "workflow/api";
import { z } from "zod";
import { messageRepo } from "@/db/repositories/message-repo";
import { chatRepo } from "@/db/repositories/chat-repo";
import { nanoid } from "nanoid";
import { chat } from "@/db";
import { createLogger } from "@/lib/logs/console/logger";

const logger = createLogger("CHAT");

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export const GET = api(
  { auth: true, params: z.object({ chatId: z.string() }) },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const item = await chatRepo.findById(chatId);
    if (!item || item.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }
    const messages = await messageRepo.findForChat(chatId);
    return success({ chat: item, messages });
  },
);

export const POST = api(
  {
    auth: true,
    params: z.object({ chatId: z.string() }),
    body: z.object({
      messages: z.array(z.custom<UIMessage>()),
    }),
  },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const messages = ctx.body.messages;

    // Ensure the chat exists and belongs to the current user before persisting
    const existingChat = await chatRepo.findById(chatId);
    if (!existingChat || existingChat.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    logger.info(JSON.stringify(messages));

    // Type guard for text parts
    const isTextPart = (
      part: unknown
    ): part is { type: "text"; text: string } => {
      return (part as any)?.type === "text" && typeof (part as any)?.text === "string";
    };

    // Persist the latest user message before starting streaming
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      const text = lastUser.parts?.find(isTextPart)?.text ?? "";
      await messageRepo.create({
        id: nanoid(),
        chatId,
        userId: ctx.user.id,
        agentId: null,
        content: text,
        tokenCount: 0,
        cost: "0.000000",
        toolCalls: [],
        uiMessage: lastUser,
        mentionedAgentIds: [],
        createdAt: new Date(),
      });
    }

    const workflowHandle = await start(chatWorkflow, [messages, chatId, ctx.user.id]);
    const runId = workflowHandle.runId;
    const stream = workflowHandle.readable;

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "x-workflow-run-id": runId,
        "x-chat-id": chatId,
      },
    });
  },
);

export const PATCH = api(
  {
    auth: true,
    params: z.object({ chatId: z.string() }),
    body: z.object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      style: z.enum(chat.style.enumValues as [string, ...string[]]).optional(),
      visibility: z
        .enum(chat.visibility.enumValues as [string, ...string[]])
        .optional(),
      linkEnabled: z.boolean().optional(),
      instructions: z.string().optional(),
    }),
  },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const existing = await chatRepo.findById(chatId);
    if (!existing || existing.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }
    const updated = await chatRepo.update(chatId, {
      title: ctx.body.title ?? undefined,
      description: ctx.body.description ?? undefined,
      style: (ctx.body.style as any) ?? undefined,
      visibility: (ctx.body.visibility as any) ?? undefined,
      linkEnabled: ctx.body.linkEnabled ?? undefined,
      instructions: ctx.body.instructions ?? undefined,
      updatedAt: new Date(),
    } as any);
    return success({ chat: updated });
  },
);

export const DELETE = api(
  { auth: true, params: z.object({ chatId: z.string() }) },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const existing = await chatRepo.findById(chatId);
    if (!existing || existing.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }
    await chatRepo.delete(chatId);
    return noContent();
  },
);
