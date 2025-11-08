import { agentRepo } from "@/db/repositories/agent-repo";
import { api, notFound, noContent, success } from "@/lib/server";
import { z } from "zod";

export const GET = api(
  { auth: true, params: z.object({ agentId: z.string() }) },
  async (req, ctx) => {
    const { agentId } = ctx.params;
    const item = await agentRepo.findById(agentId);
    if (!item || item.userId !== ctx.user.id) {
      return notFound("Agent not found");
    }
    return success({ agent: item });
  }
);

export const PATCH = api(
  {
    auth: true,
    params: z.object({ agentId: z.string() }),
    body: z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(1000).optional(),
      systemPrompt: z.string().min(1).optional(),
      model: z.string().min(1).optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().min(1).optional(),
      avatar: z.string().url().optional(),
      color: z.string().optional(),
      tools: z.array(z.any()).optional(),
    }),
  },
  async (req, ctx) => {
    const { agentId } = ctx.params;
    const existing = await agentRepo.findById(agentId);
    if (!existing || existing.userId !== ctx.user.id) {
      return notFound("Agent not found");
    }
    const updated = await agentRepo.update(agentId, {
      name: ctx.body.name ?? undefined,
      description: ctx.body.description ?? undefined,
      systemPrompt: ctx.body.systemPrompt ?? undefined,
      model: ctx.body.model ?? undefined,
      temperature: (ctx.body.temperature != null
        ? String(ctx.body.temperature)
        : undefined) as any,
      maxTokens: ctx.body.maxTokens ?? undefined,
      avatar: ctx.body.avatar ?? undefined,
      color: ctx.body.color ?? undefined,
      tools: (ctx.body.tools as any) ?? undefined,
      updatedAt: new Date(),
    } as any);
    return success({ agent: updated });
  }
);

export const DELETE = api(
  { auth: true, params: z.object({ agentId: z.string() }) },
  async (req, ctx) => {
    const { agentId } = ctx.params;
    const existing = await agentRepo.findById(agentId);
    if (!existing || existing.userId !== ctx.user.id) {
      return notFound("Agent not found");
    }
    await agentRepo.delete(agentId);
    return noContent();
  }
);
