import { agentRepo } from "@/db/repositories/agent-repo";
import { toolRegistry } from "@/lib/ai/tools/registry";
import { api, Errors, success } from "@/lib/server";
import { z } from "zod";

// POST /api/agents/:id/tools/discover - Auto-configure agent tools
export const POST = api(
  {
    auth: true,
    params: z.object({ id: z.uuid() }),
    body: z.object({
      chatId: z.string(),
      categories: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      maxTools: z.number().int().min(1).max(50).default(10),
    }),
  },
  async (req, ctx) => {
    const agent = await agentRepo.findById(ctx.params.id);
    if (!agent) throw Errors.notFound("Agent not found");

    if (agent.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only modify your own agents");
    }

    const matchedTools = await toolRegistry.searchTools(
      ctx.user.id,
      ctx.body.chatId,
      {
        category: ctx.body.categories?.[0],
        tags: ctx.body.tags,
      },
    );

    const selectedToolIds = matchedTools
      .slice(0, ctx.body.maxTools)
      .map((t) => t.id);

    const updated = await agentRepo.update(ctx.params.id, {
      toolIds: selectedToolIds,
    });

    return success({
      agent: updated,
      toolsDiscovered: selectedToolIds.length,
      tools: matchedTools.slice(0, ctx.body.maxTools),
    });
  },
);
