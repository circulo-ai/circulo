import { agentRepo } from "@/db/repositories/agent-repo";
import { db } from "@/db";
import { agentTemplate } from "@/db/schema";
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
    body: z
      .object({
        // Either provide a templateId, or full custom agent fields
        templateId: z.string().optional(),
        name: z.string().min(1).max(50).optional(),
        description: z.string().max(500).optional(),
        systemPrompt: z.string().min(1).optional(),
        model: z.string().min(1).optional(),
        temperature: z
          .string()
          .regex(/^0(\.\d+)?$|^1(\.0+)?$|^2(\.0+)?$/)
          .optional(),
        maxTokens: z.number().min(1).max(32000).optional(),
        color: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
        tools: z.array(z.any()).optional(),
      })
      .refine(
        (b) =>
          !!b.templateId ||
          (b.name && b.systemPrompt && b.model && b.temperature && b.maxTokens && b.color),
        {
          message:
            "Provide either templateId or all required agent fields (name, systemPrompt, model, temperature, maxTokens, color).",
          path: ["templateId"],
        },
      ),
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

    // If a templateId is provided, load the template and use it as defaults
    let template: typeof agentTemplate.$inferSelect | undefined;
    if (ctx.body.templateId) {
      template = await db.query.agentTemplate.findFirst({
        where: (t, { and, eq, inArray }) =>
          and(
            eq(t.id, ctx.body.templateId!),
            eq(t.deleted, false),
            eq(t.status, "published"),
            inArray(t.visibility, ["public", "marketplace"]),
          ),
      });
      if (!template) {
        return error("Template not found or not available", 404);
      }
    }

    const agentData = {
      id,
      userId: ctx.user.id,
      templateId: template?.id ?? null,
      name: ctx.body.name ?? template?.name!,
      description: (ctx.body.description ?? template?.description) ?? null,
      systemPrompt: ctx.body.systemPrompt ?? template?.systemPrompt!,
      model: ctx.body.model ?? template?.model!,
      temperature: ctx.body.temperature ?? (template?.temperature as unknown as string) ?? "0.7",
      maxTokens: ctx.body.maxTokens ?? template?.maxTokens ?? 2000,
      color: ctx.body.color ?? template?.color ?? "#3B82F6",
      tools: ctx.body.tools ?? (template?.tools as any) ?? [],
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const agent = await agentRepo.create(agentData as any);
    return created({ agent });
  },
);
