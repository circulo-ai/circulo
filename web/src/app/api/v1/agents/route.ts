import { agentRepo } from "@/db/repositories/agent-repo";
import { api, created, success } from "@/lib/server";
import { nanoid } from "nanoid";
import { z } from "zod";

export const GET = api({ auth: true }, async (req, ctx) => {
  const userAgents = await agentRepo.findForUser(ctx.user.id);
  return success({ agents: userAgents });
});

export const POST = api(
  {
    auth: true,
    body: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      systemPrompt: z.string().min(1),
      model: z.string().min(1).optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).optional(),
      avatar: z.string().url().optional(),
      color: z.string().optional(),
      tools: z.array(z.any()).optional(),
    }),
  },
  async (req, ctx) => {
    const id = nanoid();
    const now = new Date();
    const agent = await agentRepo.create({
      id,
      userId: ctx.user.id,
      templateId: null,
      name: ctx.body.name,
      description: ctx.body.description ?? null,
      systemPrompt: ctx.body.systemPrompt,
      model: ctx.body.model ?? "gpt-4",
      temperature: String(ctx.body.temperature ?? 0.7) as any,
      maxTokens: ctx.body.maxTokens ?? 2000,
      avatar: ctx.body.avatar ?? null,
      color: ctx.body.color ?? null,
      tools: (ctx.body.tools as any) ?? [],
      usageCount: 0,
      lastUsedAt: null,
      deleted: false,
      createdAt: now,
      updatedAt: now,
    } as any);
    return created({ agent });
  }
);
