import { chatAgent, db } from "@/db";
import { agentRepo } from "@/db/repositories/agent-repo";
import { chatRepo } from "@/db/repositories/chat-repo";
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { api, created, Errors, success } from "@/lib/server";
import { generateUUID } from "@/lib/utils";
import { z } from "zod";

// GET /api/chats/:id/agents - Get agents in chat
export const GET = api(
  {
    auth: true,
    params: z.object({ id: z.string() }),
    query: z.object({
      search: z.string().optional(),
      includeDisabled: z.boolean().optional(),
    }),
  },
  async (req, ctx) => {
    const chat = await chatRepo.findById(ctx.params.id);
    if (!chat) throw Errors.notFound("Chat not found");

    // Check if user is creator (for now, until member system is implemented)
    if (chat.creatorId !== ctx.user.id) {
      // TODO: Implement member check
      // const isMember = await chatRepo.isMember(ctx.params.id, ctx.user.id);
      // if (!isMember) {
      throw Errors.forbidden("You don't have access to this chat");
      // }
    }

    const agents = await chatRepo.findAgentsForChat(ctx.params.id, {
      includeDisabled: ctx.query.includeDisabled,
      search: ctx.query.search,
    });
    return success({ agents });
  },
);

// POST /api/chats/:id/agents - Add agent to chat
export const POST = api(
  {
    auth: true,
    params: z.object({ id: z.string() }),
    body: z.object({
      agentId: z.uuid(),
      enabled: z.boolean().default(true),
      customSystemPrompt: z.string().optional(),
      customTemperature: z.number().min(0).max(2).optional(),
    }),
  },
  async (req, ctx) => {
    const chat = await chatRepo.findById(ctx.params.id);
    if (!chat) throw Errors.notFound("Chat not found");

    // Check if user is creator
    if (chat.creatorId !== ctx.user.id) {
      throw Errors.forbidden("You don't have access to this chat");
    }

    // Verify agent exists and user owns it
    const agent = await agentRepo.findById(ctx.body.agentId);
    if (!agent) throw Errors.notFound("Agent not found");
    if (agent.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only add your own agents to chats");
    }

    const { allowed } = await UsageRateLimiter.canPerformAction(
      ctx.user.id,
      "add_chat_agent",
      { chatId: ctx.params.id },
    );
    if (!allowed) {
      throw Errors.tooManyRequests(
        "Usage limit exceeded for adding agents to chat",
      );
    }

    // Check if agent is already in chat
    const existingChatAgent = await db.query.chatAgent.findFirst({
      where: (ca, { eq, and }) =>
        and(eq(ca.chatId, ctx.params.id), eq(ca.agentId, ctx.body.agentId)),
    });

    if (existingChatAgent) {
      throw Errors.conflict("Agent is already in this chat");
    }

    // Add agent to chat
    const [newChatAgent] = await db
      .insert(chatAgent)
      .values({
        id: generateUUID(),
        chatId: ctx.params.id,
        agentId: ctx.body.agentId,
        enabled: ctx.body.enabled,
        customSystemPrompt: ctx.body.customSystemPrompt || null,
        customTemperature: ctx.body.customTemperature
          ? ctx.body.customTemperature.toString()
          : null,
        addedBy: ctx.user.id,
        createdAt: new Date(),
      })
      .returning();

    return created({ agent: newChatAgent });
  },
);
