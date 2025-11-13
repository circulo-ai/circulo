import { updateAgentSchema } from "@/db";
import { agentRepo } from "@/db/repositories/agent-repo";
import { api, success, Errors } from "@/lib/server";
import z from "zod";

export const GET = api({
    auth: true,
    params: z.object({ id: z.uuid() }),
}, async (req, ctx) => {
    const agent = await agentRepo.findById(ctx.params.id);
    if (!agent) {
        throw Errors.notFound("Agent not found");
    }
    // Verify ownership
    if (agent.userId !== ctx.user.id) {
        throw Errors.forbidden("You can only access your own agents");
    }
    return success({ agent });
});

export const PATCH = api(
  {
    auth: true,
    params: z.object({ id: z.uuid() }),
    body: updateAgentSchema,
  },
  async (req, ctx) => {
    // Verify ownership
    const existing = await agentRepo.findById(ctx.params.id);
    if (!existing) throw Errors.notFound("Agent not found");
    if (existing.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only update your own agents");
    }

    const updated = await agentRepo.update(ctx.params.id, ctx.body);
    return success({ agent: updated });
  }
);

export const DELETE = api({
    auth: true,
    params: z.object({ id: z.uuid() }),
}, async (req, ctx) => {
    // Verify ownership
    const existing = await agentRepo.findById(ctx.params.id);
    if (!existing) throw Errors.notFound("Agent not found");
    if (existing.userId !== ctx.user.id) {
        throw Errors.forbidden("You can only delete your own agents");
    }
    const deleteResult = await agentRepo.delete(ctx.params.id);
    return success({ deleteResult });
});
