import { toolRepo } from "@/db/repositories/tool-repo";
import { createToolSchema } from "@/db/schema";
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { api, Errors, success } from "@/lib/server";
import { z } from "zod";

// GET /api/tools - List all tools for the user
export const GET = api(
  {
    auth: true,
    query: z.object({
      type: z.enum(["builtin", "mcp", "custom", "api"]).optional(),
      isActive: z.coerce.boolean().optional(),
      search: z.string().optional(),
    }),
  },
  async (req, ctx) => {
    let tools;

    if (ctx.query.search) {
      tools = await toolRepo.search(ctx.user.id, ctx.query.search);
    } else {
      tools = await toolRepo.findForUser(ctx.user.id, {
        type: ctx.query.type,
        isActive: ctx.query.isActive,
      });
    }

    return success({ tools });
  },
);

// POST /api/tools - Create a custom tool
export const POST = api(
  {
    auth: true,
    body: createToolSchema,
  },
  async (req, ctx) => {
    const { allowed } = await UsageRateLimiter.canPerformAction(
      ctx.user.id,
      "create_tool",
    );
    if (!allowed) {
      throw Errors.tooManyRequests("Usage limit exceeded for creating tools");
    }

    const tool = await toolRepo.create({
      ...ctx.body,
      userId: ctx.user.id,
    });

    return success({ tool }, 201);
  },
);