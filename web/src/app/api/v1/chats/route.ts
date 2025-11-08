import { chatRepo } from "@/db/repositories/chat-repo";
import { messageRepo } from "@/db/repositories/message-repo";
import { api, created, success } from "@/lib/server";
import { createUIMessageStreamResponse, type UIMessage } from "ai";
import { nanoid } from "nanoid";
import { start } from "workflow/api";
import { z } from "zod";
import { chat as chatWorkflow } from "@/workflows/chat";

// List chats for the current user
export const GET = api({ auth: true }, async (req, ctx) => {
  const chats = await chatRepo.findForUser(ctx.user.id);
  return success({ chats });
});

// Optional: stream a new conversation while auto-creating a chat
export const POST = api(
  {
    auth: true,
    body: z.object({
      messages: z.array(z.custom<UIMessage>()),
      title: z.string().min(1).max(200).optional(),
    }),
  },
  async (req, ctx) => {
    const id = nanoid();
    const now = new Date();
    const newChat = await chatRepo.create({
      id,
      userId: ctx.user.id,
      title: ctx.body.title ?? "New Chat",
      createdAt: now,
      updatedAt: now,
      description: null,
      style: "brainstorm",
      visibility: "private",
      shareLink: null,
      linkEnabled: false,
      instructions: null,
      messageCount: 0,
      totalTokens: 0,
      totalCost: "0.0000",
    } as any);

    // Persist the latest user message before starting streaming
    const messages = ctx.body.messages;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    // Type guard for text parts
    const isTextPart = (
      part: unknown
    ): part is { type: "text"; text: string } => {
      return (part as any)?.type === "text" && typeof (part as any)?.text === "string";
    };
    if (lastUser) {
      const text = lastUser.parts?.find(isTextPart)?.text ?? "";
      await messageRepo.create({
        id: nanoid(),
        chatId: id,
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

    const workflowHandle = await start(chatWorkflow, [messages]);

    const runId = workflowHandle.runId;
    const stream = workflowHandle.readable;

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "x-workflow-run-id": runId,
        "x-chat-id": id,
      },
    });
  },
);
