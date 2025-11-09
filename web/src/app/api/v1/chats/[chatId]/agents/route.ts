import { chatAgent as chatAgentTable, db } from "@/db";
import { chatRepo } from "@/db/repositories/chat-repo";
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { api, error, noContent, notFound, success } from "@/lib/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

// Add agent to chat
export const POST = api(
  {
    auth: true,
    params: z.object({ chatId: z.string() }),
    body: z.object({
      agentId: z.string(),
      speakOrder: z.number().int().min(0).optional(),
      customSystemPrompt: z.string().nullable().optional(),
      customTemperature: z.number().min(0).max(2).nullable().optional(),
    }),
  },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const { allowed, reason } = await UsageRateLimiter.canPerformAction(
      ctx.user.id,
      "add_chat_agent",
      { chatId: chatId },
    );
    if(!allowed) {
      return error(reason ?? "You can't add more agents to this chat based on your subscription plan", 403);
    }

    const { agentId, speakOrder, customSystemPrompt, customTemperature } =
      ctx.body;

    // Ensure chat exists and belongs to user
    const chat = await chatRepo.findById(chatId);
    if (!chat || chat.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    // Get next available speak order if not provided
    const actualSpeakOrder =
      speakOrder ?? (await chatRepo.getNextSpeakOrder(chatId));

    // If link already exists, update it instead of inserting to avoid unique constraint errors
    const existing = await db.query.chatAgent.findFirst({
      where: and(
        eq(chatAgentTable.chatId, chatId),
        eq(chatAgentTable.agentId, agentId),
      ),
    });

    if (existing) {
      await db
        .update(chatAgentTable)
        .set({
          speakOrder: actualSpeakOrder,
          customSystemPrompt: customSystemPrompt ?? null,
          customTemperature: customTemperature
            ? String(customTemperature)
            : null,
          enabled: true,
        })
        .where(
          and(
            eq(chatAgentTable.chatId, chatId),
            eq(chatAgentTable.agentId, agentId),
          ),
        );
    } else {
      // Create chat-agent link
      await db
        .insert(chatAgentTable)
        .values({
          id: nanoid(),
          chatId,
          agentId,
          speakOrder: actualSpeakOrder,
          customSystemPrompt: customSystemPrompt ?? null,
          customTemperature: customTemperature
            ? String(customTemperature)
            : null,
          enabled: true,
          createdAt: new Date(),
        })
        .returning();
    }

    // Get the actual agent details to return
    const agents = await chatRepo.findAgentsForChat(chatId);
    return success({ agents });
  },
);

// List agents attached to a chat
export const GET = api(
  {
    auth: true,
    params: z.object({ chatId: z.string() }),
  },
  async (req, ctx) => {
    const { chatId } = ctx.params;

    // Ensure chat exists and belongs to user
    const chat = await chatRepo.findById(chatId);
    if (!chat || chat.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    const agents = await chatRepo.findAgentsForChat(chatId);
    return success({ agents });
  },
);

// Update chat agents (reorder, enable/disable)
export const PATCH = api(
  {
    auth: true,
    params: z.object({ chatId: z.string() }),
    body: z.object({
      updates: z.array(
        z.object({
          agentId: z.string(),
          speakOrder: z.number().int().min(0).optional(),
          enabled: z.boolean().optional(),
          customSystemPrompt: z.string().nullable().optional(),
          customTemperature: z.number().min(0).max(2).nullable().optional(),
        })
      ),
    }),
  },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const { updates } = ctx.body;

    // Ensure chat exists and belongs to user
    const chat = await chatRepo.findById(chatId);
    if (!chat || chat.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    if (!updates.length) {
      const agents = await chatRepo.findAgentsForChat(chatId);
      return success({ agents });
    }

    await db.transaction(async (tx) => {
      // Two-step reorder to avoid unique (chat_id, speak_order) conflicts:
      // 1) Temporarily move targeted rows out of the way by adding an offset
      // 2) Set final speakOrder and other fields per update

      const agentIds = updates.map((u) => u.agentId);

      // Step 1: add large offset to avoid collisions
      await tx
        .update(chatAgentTable)
        .set({ speakOrder: sql`${chatAgentTable.speakOrder} + 1000` })
        .where(
          and(
            eq(chatAgentTable.chatId, chatId),
            inArray(chatAgentTable.agentId, agentIds),
          ),
        );

      // Step 2: apply final values individually
      for (const u of updates) {
        const setObj: Record<string, any> = { speakOrder: u.speakOrder };
        if (u.enabled !== undefined) setObj.enabled = u.enabled;
        if ("customSystemPrompt" in u) setObj.customSystemPrompt = u.customSystemPrompt ?? null;
        if ("customTemperature" in u)
          setObj.customTemperature = u.customTemperature != null ? String(u.customTemperature) : null;

        await tx
          .update(chatAgentTable)
          .set(setObj)
          .where(
            and(
              eq(chatAgentTable.chatId, chatId),
              eq(chatAgentTable.agentId, u.agentId),
            ),
          );
      }
    });

    // Return updated list
    const agents = await chatRepo.findAgentsForChat(chatId);
    return success({ agents });
  }
);

// Remove agent from chat
export const DELETE = api(
  {
    auth: true,
    params: z.object({ chatId: z.string() }),
    body: z.object({
      agentId: z.string(),
    }),
  },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const { agentId } = ctx.body;

    const chat = await chatRepo.findById(chatId);
    if (!chat || chat.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    await db
      .delete(chatAgentTable)
      .where(
        and(
          eq(chatAgentTable.chatId, chatId),
          eq(chatAgentTable.agentId, agentId)
        )
      );

    return noContent();
  }
);
