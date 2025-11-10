import { agent, chatAgent, chat as chatTable, db } from "@/db";
import { chatRepo, useChatRepo } from "@/db/repositories/chat-repo";
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { api, created, error, forbidden, success } from "@/lib/server";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

// List chats for the current user
export const GET = api({ auth: true }, async (req, ctx) => {
  const chats = await chatRepo.findForUser(ctx.user.id);
  console.log(chats)
  return success({ chats });
});

// Create a new chat
export const POST = api(
  {
    auth: true,
    body: z.object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      style: z
        .enum(chatTable.style.enumValues as [string, ...string[]])
        .optional(),
      visibility: z
        .enum(chatTable.visibility.enumValues as [string, ...string[]])
        .optional(),
      instructions: z.string().optional(),
      agents: z.array(z.string()).optional().default([]), // agent IDs
    }),
  },
  async (req, ctx) => {
    const { allowed, reason } = await UsageRateLimiter.canPerformAction(
      ctx.user.id,
      "create_chat",
    );
    if (!allowed) {
      return forbidden(reason);
    }

    const now = new Date();
    const chatData = {
      id: nanoid(),
      userId: ctx.user.id,
      title: ctx.body.title || "New Chat",
      description: ctx.body.description ?? null,
      style: (ctx.body.style as any) ?? "brainstorm",
      visibility: (ctx.body.visibility as any) ?? "private",
      shareLink: null,
      linkEnabled: false,
      instructions: ctx.body.instructions ?? null,
      messageCount: 0,
      totalTokens: 0,
      totalCost: "0.0000",
      createdAt: now,
      updatedAt: now,
    };

    const chat = await db.transaction(async (tx) => {
      const createdChat = await useChatRepo(tx).create(chatData);
      if (ctx.body.agents.length > 0) {
        // Fetch valid agents belonging to the same user
        const validAgents = await tx
          .select({ id: agent.id })
          .from(agent)
          .where(
            and(
              eq(agent.userId, ctx.user.id),
              inArray(agent.id, ctx.body.agents),
            ),
          );

        if (validAgents.length > 0) {
          const chatAgentsToInsert = validAgents.map((a, i) => ({
            id: nanoid(),
            chatId: createdChat.id,
            agentId: a.id,
            speakOrder: i,
            enabled: true,
            createdAt: now,
          }));

          await tx.insert(chatAgent).values(chatAgentsToInsert);
        }
      }
      return createdChat;
    });

    return created({ chat });
  },
);
