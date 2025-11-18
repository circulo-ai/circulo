import { agentRepo } from "@/db/repositories/agent-repo";
import { createAgentSchema } from "@/db/schema";
import { UsageRateLimiter } from "@/lib/billing/rate-limiter";
import { api, success } from "@/lib/server";

export const GET = api(
  {
    auth: true,
  },
  async (req, ctx) => {
    const agents = await agentRepo.findForUser(ctx.user.id);
    return success({ agents });
  },
);

export const POST = api(
  {
    auth: true,
    body: createAgentSchema,
  },
  async (req, ctx) => {
    const { allowed } = await UsageRateLimiter.canPerformAction(
      ctx.user.id,
      "create_agent",
    );
    if (!allowed) {
      throw new Error("Usage limit exceeded for creating agents.");
    }

    const agent = await agentRepo.create({
      ...ctx.body,
      userId: ctx.user.id,
    });

    return success({ agent });
  },
);
