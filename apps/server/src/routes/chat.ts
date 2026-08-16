import { titlePrompt } from "@/lib/ai/prompts";
import { myProvider } from "@/lib/ai/providers";
import { getActiveOrganizationId } from "@/lib/auth";
import type { RequestServices } from "@/di/di-context";
import { createRouter } from "@/lib/create-app";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import { type ChatMessage } from "@/lib/types";
import { getTextFromMessage, getTextFromMessages } from "@/lib/utils";
import { requireAuth } from "@/middleware/auth";
import { orchestrateWorkflow } from "@/workflows/orchestrate/orchestrate";
import {
  BadRequestError,
  ForbiddenError,
  HttpError,
  RateLimitError,
} from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { createUIMessageStreamResponse, generateText } from "ai";
import { start } from "workflow/api";
import { z } from "zod";

const deleteQuerySchema = z.object({
  id: z.uuid(),
});

const messagePartSchema = z.object({
  type: z.enum(["text", "reasoning", "tool-call", "tool-result", "source"]),
  text: z.string().optional(),
  reasoning: z.string().optional(),
}).passthrough();

const messageSchema = z.object({
  id: z.uuid(),
  role: z.enum(["user", "assistant", "system", "data"]),
  content: z.string().optional().default(""),
  parts: z.array(messagePartSchema).optional(),
  createdAt: z.union([z.string(), z.date(), z.number()]).optional(),
}).passthrough();

const createChatSchema = z.object({
  id: z.uuid(),
  visibility: z.enum(["private", "public"]).default("private"),
  agentIds: z.array(z.uuid()).max(10).optional().default([]).superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "agentIds must be unique" });
    }
  }),
  message: messageSchema,
});

const router = createRouter();

async function generateTitleFromUserMessages({
  messages,
}: {
  messages: ChatMessage[];
}) {
  const { text: title } = await generateText({
    model: myProvider.languageModel("title-model"),
    system: titlePrompt,
    prompt: getTextFromMessages(messages),
  });

  return title;
}

router.post(
  "/chat",
  requireAuth,
  zValidator("json", createChatSchema),
  async (c) => {
    try {
      const {
        id,
        message,
        visibility: selectedVisibilityType,
        agentIds,
      } = c.req.valid("json");
      const { user, session } = c.var;
      const di: RequestServices = c.di;
      const activeOrgId = c.get("activeOrgId");

      const messages: ChatMessage[] = [message as ChatMessage];
      if (message.role !== "user" || !getTextFromMessage(message as ChatMessage).trim()) {
        throw new BadRequestError("A non-empty user message is required");
      }

      const activeOrganizationId =
        activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

      const isOrgMember = await isMemberOf(user!.id, activeOrganizationId);
      if (!isOrgMember) {
        throw new ForbiddenError("You are not a member of this organization");
      }

      const canCreate = await hasPermission(
        "chat",
        "create",
        activeOrganizationId,
        session as any,
      );
      if (!canCreate) {
        throw new ForbiddenError(
          "You don't have permission to create chats in this organization",
        );
      }

      const title = await generateTitleFromUserMessages({ messages });
      const agentRepository = di.AgentRepository;
      const agents = await Promise.all(agentIds.map((agentId) => agentRepository.findById(agentId)));
      if (agents.some((agent) => !agent || agent.snapshot.organizationId !== activeOrganizationId)) {
        throw new ForbiddenError("One or more selected agents are not available in this organization");
      }

      const chatResult = await di.CreateChatWithMessageUseCase.execute({
        id,
        messageId: message.id,
        organizationId: activeOrganizationId,
        creatorId: user!.id,
        title,
        visibility: selectedVisibilityType,
        content: getTextFromMessage(message as ChatMessage),
        agentIds,
      });
      if (chatResult.isFailure) throw new BadRequestError(chatResult.getError() ?? "Unable to create chat");

      const run = await start(orchestrateWorkflow, [
        {
          chatId: id,
          messages,
          triggerType: "user_message",
          actor: {
            userId: user!.id,
            organizationId: activeOrganizationId,
          },
        },
      ]);

      await di.WorkflowRunRepository.create({
        id: run.runId,
        chatId: id,
        userId: user!.id,
        organizationId: activeOrganizationId,
      });

      const response = createUIMessageStreamResponse({
        stream: run.getReadable(),
      });
      response.headers.set("x-workflow-run-id", run.runId);
      return response;
    } catch (error) {
      if (error instanceof RateLimitError) return error.toResponse();
      if (
        error instanceof Error &&
        error.message?.includes("AI Gateway requires a valid credit card")
      ) {
        return new BadRequestError(
          "AI Gateway requires a valid credit card",
        ).toResponse();
      }
      if (error instanceof HttpError) {
        throw error;
      }

      console.error("[Chat Error]", error);
      return c.json({ message: "Internal server error" }, 500);
    }
  },
);

router.delete(
  "/chat",
  requireAuth,
  zValidator("query", deleteQuerySchema),
  async (c) => {
    const { id } = c.req.valid("query");
    const di: RequestServices = c.di;
    const activeOrgId = c.get("activeOrgId");
    const { user, session } = c.var;

    const activeOrganizationId =
      activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

    if (!activeOrganizationId) {
      throw new ForbiddenError("No active organization");
    }

    const chat = await di.ChatRepository.findById(id);
    if (!chat) {
      throw new BadRequestError("Chat not found");
    }
    if (chat.organizationId !== activeOrganizationId) {
      throw new ForbiddenError("Chat does not belong to your organization");
    }

    const canDeleteAnyChat = await hasPermission(
      "chat",
      "delete",
      activeOrganizationId,
      session as any,
    );

    const result = await di.DeleteChatUseCase.execute({
      id,
      organizationId: activeOrganizationId,
      requesterId: user!.id,
      canDeleteAnyChat,
    });
    if (result.isFailure) {
      return new BadRequestError(
        result.getError() ?? "Unable to delete chat",
      ).toResponse();
    }
    return c.json({ success: true }, 200);
  },
);

export default router;
