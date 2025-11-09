import { agentRepo } from "@/db/repositories/agent-repo";
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { createLogger } from "@/lib/logs/console/logger";
import { api, created, error, success } from "@/lib/server";
import { nanoid } from "nanoid";
import { z } from "zod";

export const GET = api({ auth: true }, async (req, ctx) => {
  const agents = await agentRepo.findForUser(ctx.user.id);
  return success({ agents });
});

export const POST = api(
  {
    auth: true,
    body: z.object({
      name: z.string().min(1).max(50),
      description: z.string().max(500).optional(),
      systemPrompt: z.string().min(1),
      model: z.string().min(1),
      temperature: z.string().regex(/^0(\.\d+)?$|^1(\.0+)?$|^2(\.0+)?$/),
      maxTokens: z.number().min(1).max(32000),
      color: z.string().regex(/^#[0-9A-F]{6}$/i),
      tools: z.array(z.any()).optional(),
    }),
  },
  async (req, ctx) => {
    const { allowed, reason } = await UsageRateLimiter.canPerformAction(
      ctx.user.id,
      "create_agent",
    );
    if (!allowed) {
      return error(reason ?? "You are not allowed to create a new Agent", 403);
    }

    const id = nanoid();
    const now = new Date();

    const agentData = {
      id,
      userId: ctx.user.id,
      name: ctx.body.name,
      description: ctx.body.description ?? null,
      systemPrompt: ctx.body.systemPrompt,
      model: ctx.body.model,
      temperature: ctx.body.temperature,
      maxTokens: ctx.body.maxTokens,
      color: ctx.body.color,
      tools: ctx.body.tools ?? [],
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const agent = await agentRepo.create(agentData);
    return created({ agent });
  },
);
