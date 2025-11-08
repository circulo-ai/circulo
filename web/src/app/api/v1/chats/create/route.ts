import { chat } from "@/db";
import { chatRepo } from "@/db/repositories/chat-repo";
import { api, created } from "@/lib/server";
import { nanoid } from "nanoid";
import { z } from "zod";

export const POST = api(
  {
    auth: true,
    body: z.object({
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      style: z.enum(chat.style.enumValues as [string, ...string[]]).optional(),
      visibility: z.enum(chat.visibility.enumValues as [string, ...string[]]).optional(),
    }),
  },
  async (req, ctx) => {
    const id = nanoid();
    const now = new Date();
    const newChat = await chatRepo.create({
      id,
      userId: ctx.user.id,
      title: ctx.body.title ?? "New Chat",
      description: ctx.body.description ?? null,
      style: (ctx.body.style as any) ?? "brainstorm",
      visibility: (ctx.body.visibility as any) ?? "private",
      shareLink: null,
      linkEnabled: false,
      instructions: null,
      messageCount: 0,
      totalTokens: 0,
      totalCost: "0.0000",
      createdAt: now,
      updatedAt: now,
    } as any);
    return created({ chat: newChat });
  }
);