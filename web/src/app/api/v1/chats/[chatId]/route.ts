import { api, notFound, noContent, success } from "@/lib/server";
import { chatOrchestrationWorkflow } from "@/workflows/chat";
import { convertToModelMessages, createUIMessageStreamResponse, type UIMessage } from "ai";
import { start } from "workflow/api";
import { z } from "zod";
import { messageRepo } from "@/db/repositories/message-repo";
import { chatRepo } from "@/db/repositories/chat-repo";
import { chat } from "@/db";
import { createLogger } from "@/lib/logs/console/logger";

function isNotNullOrUndefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

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
    // Ensure the chat exists and belongs to the current user
    const existingChat = await chatRepo.findById(chatId);
    if (!existingChat || existingChat.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    const previousMessages = await messageRepo.findForChat(chatId);
    const messages: UIMessage[] = [
      ...previousMessages.map((e) => e.uiMessage).filter(isNotNullOrUndefined),
      ...(ctx.body.messages || [])
    ];

    // Note: The workflow will persist the user message internally
    // so we don't need to persist it here to avoid duplication

    // Start the workflow with the correct parameters
    // Workflow signature: chatOrchestrationWorkflow(chatId, userId, userMessage, writable)
    // Start the workflow with all required parameters
    const workflowHandle = await start(chatOrchestrationWorkflow, [
      chatId,
      ctx.user.id,
      convertToModelMessages(messages),
    ]);
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
