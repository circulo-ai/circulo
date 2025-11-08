import { chatAgent as chatAgentTable, db } from "@/db";
import { and, eq } from "drizzle-orm";
import { chatRepo } from "@/db/repositories/chat-repo";
import { api, notFound, success, noContent } from "@/lib/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";

const addAgentSchema = z.object({
  agentId: z.string(),
  speakOrder: z.number().optional(),
  customSystemPrompt: z.string().nullable().optional(),
  customTemperature: z.number().min(0).max(2).nullable().optional(),
});

// Add agent to chat
export const POST = api(
  {
    auth: true,
    params: z.object({ chatId: z.string() }),
    body: z.object({
      agentId: z.string(),
      speakOrder: z.number().int().min(0).optional(),
        customSystemPrompt: z.string().nullable().optional(),
        customTemperature: z.number().min(0).max(2).nullable().optional()
    })
  },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const { agentId, speakOrder, customSystemPrompt, customTemperature } = ctx.body;

    // Ensure chat exists and belongs to user
    const chat = await chatRepo.findById(chatId);
    if (!chat || chat.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    // Get next available speak order if not provided
    const actualSpeakOrder = speakOrder ?? await chatRepo.getNextSpeakOrder(chatId);

    // If link already exists, update it instead of inserting to avoid unique constraint errors
    const existing = await db.query.chatAgent.findFirst({
      where: and(eq(chatAgentTable.chatId, chatId), eq(chatAgentTable.agentId, agentId)),
    });

    if (existing) {
      await db.update(chatAgentTable)
        .set({
          speakOrder: actualSpeakOrder,
          customSystemPrompt: customSystemPrompt ?? null,
          customTemperature: customTemperature ? String(customTemperature) : null,
          enabled: true,
        })
        .where(and(eq(chatAgentTable.chatId, chatId), eq(chatAgentTable.agentId, agentId)));
    } else {
      // Create chat-agent link
      await db.insert(chatAgentTable).values({
        id: nanoid(),
        chatId,
        agentId,
        speakOrder: actualSpeakOrder,
        customSystemPrompt: customSystemPrompt ?? null,
        customTemperature: customTemperature ? String(customTemperature) : null,
        enabled: true,
        createdAt: new Date(),
      }).returning();
    }

    // Get the actual agent details to return
    const agents = await chatRepo.findAgentsForChat(chatId);
    return success({ agents });
  }
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
  }
);

// Update chat agents (reorder, enable/disable)
export const PATCH = api(
  {
    auth: true,
    params: z.object({ chatId: z.string() }),
    body: z.object({
      updates: z.array(z.object({
        agentId: z.string(),
        speakOrder: z.number().int().min(0).optional(),
        enabled: z.boolean().optional(),
        customSystemPrompt: z.string().nullable().optional(),
        customTemperature: z.number().min(0).max(2).nullable().optional()
      }))
    })
  },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const { updates } = ctx.body;

    // Ensure chat exists and belongs to user
    const chat = await chatRepo.findById(chatId);
    if (!chat || chat.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    // Apply all updates in a single atomic operation to avoid unique constraint
    // conflicts on speak_order. We'll run a transaction and log the incoming
    // payload for easier debugging.
    console.log("[PATCH /agents] updates:", { chatId, updates });

    if (Array.isArray(updates) && updates.length > 0) {
      const BASE = 1000000; // base offset for desired values
      const STAGING = 1000000000; // staging offset to move all rows into a high range
      try {
        await db.transaction(async (tx) => {
          // move all speak_order into a staging range (add STAGING)
            // snapshot before
            const beforeRows = await tx.select({ agentId: chatAgentTable.agentId, speakOrder: chatAgentTable.speakOrder })
              .from(chatAgentTable)
              .where(eq(chatAgentTable.chatId, chatId));
            console.log("[PATCH /agents] beforeRows:", { chatId, beforeRows });

            await tx.update(chatAgentTable)
              .set({ speakOrder: sql`${chatAgentTable.speakOrder} + ${STAGING}` })
              .where(eq(chatAgentTable.chatId, chatId));

            const afterBump = await tx.select({ agentId: chatAgentTable.agentId, speakOrder: chatAgentTable.speakOrder })
              .from(chatAgentTable)
              .where(eq(chatAgentTable.chatId, chatId));
            console.log("[PATCH /agents] afterBump:", { chatId, afterBump });

          // apply speak_order updates in a single CASE-based UPDATE to avoid
          // transient unique constraint collisions (the per-row approach can
          // conflict when two rows swap values).
          const speakOrderUpdates = updates.filter((u: any) => u.speakOrder !== undefined && u.speakOrder !== null);
          if (speakOrderUpdates.length > 0) {
            // assign target values into the staging range as well: STAGING + BASE + newVal
            const cases = speakOrderUpdates.map((u: any) => sql`WHEN ${u.agentId} THEN ${ (u.speakOrder as number) + BASE + STAGING }`);
            const caseSql = sql`CASE ${chatAgentTable.agentId} ${sql.join(cases, sql` `)} ELSE ${chatAgentTable.speakOrder} END`;
            await tx.update(chatAgentTable)
              .set({ speakOrder: caseSql })
              .where(eq(chatAgentTable.chatId, chatId));
          }

          // apply non-order fields per-agent (enabled, prompts, temperature)
          for (const u of updates) {
            const setObj: Record<string, unknown> = {};
            if (u.enabled !== undefined) setObj.enabled = u.enabled;
            if (Object.prototype.hasOwnProperty.call(u, "customSystemPrompt")) {
              setObj.customSystemPrompt = u.customSystemPrompt ?? null;
            }
            if (Object.prototype.hasOwnProperty.call(u, "customTemperature")) {
              setObj.customTemperature = u.customTemperature ? String(u.customTemperature) : null;
            }

            if (Object.keys(setObj).length > 0) {
              await tx.update(chatAgentTable)
                .set(setObj)
                .where(and(eq(chatAgentTable.chatId, chatId), eq(chatAgentTable.agentId, u.agentId)));
            }
          }

          const afterUpdates = await tx.select({ agentId: chatAgentTable.agentId, speakOrder: chatAgentTable.speakOrder })
            .from(chatAgentTable)
            .where(eq(chatAgentTable.chatId, chatId));
          console.log("[PATCH /agents] afterUpdates:", { chatId, afterUpdates });

          // restore to final values by subtracting both offsets
          await tx.update(chatAgentTable)
            .set({ speakOrder: sql`${chatAgentTable.speakOrder} - ${STAGING + BASE}` })
            .where(eq(chatAgentTable.chatId, chatId));

          const afterRestore = await tx.select({ agentId: chatAgentTable.agentId, speakOrder: chatAgentTable.speakOrder })
            .from(chatAgentTable)
            .where(eq(chatAgentTable.chatId, chatId));
          console.log("[PATCH /agents] afterRestore:", { chatId, afterRestore });
        });
      } catch (err) {
        console.error("[PATCH /agents] transaction failed", err);
        throw err;
      }
    }

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
      agentId: z.string()
    })
  },
  async (req, ctx) => {
    const { chatId } = ctx.params;
    const { agentId } = ctx.body;

    // Ensure chat exists and belongs to user
    const chat = await chatRepo.findById(chatId);
    if (!chat || chat.userId !== ctx.user.id) {
      return notFound("Chat not found");
    }

    // Remove agent from chat
    await db.delete(chatAgentTable)
      .where(sql`chat_id = ${chatId} AND agent_id = ${agentId}`);

    return noContent();
  }
);
