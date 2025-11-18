import { agentRepo } from "@/db/repositories/agent-repo";
import { toolRegistry } from "@/lib/ai/tools/registry";
import { api, Errors, success } from "@/lib/server";
import { z } from "zod";

// GET /api/agents/:id/tools - Get agent's tools
export const GET = api(
  {
    auth: true,
    params: z.object({ id: z.uuid() }),
    query: z.object({
      chatId: z.string().optional(),
    }),
  },
  async (req, ctx) => {
    const agent = await agentRepo.findById(ctx.params.id);
    if (!agent) throw Errors.notFound("Agent not found");

    if (agent.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only access your own agents");
    }

    const chatId = ctx.query.chatId || "default";
    const tools = await toolRegistry.getAgentTools(ctx.params.id, chatId);

    return success({ tools });
  },
);

// POST /api/agents/:id/tools - Add tools to agent
export const POST = api(
  {
    auth: true,
    params: z.object({ id: z.uuid() }),
    body: z.object({
      toolIds: z.array(z.string()).min(1),
    }),
  },
  async (req, ctx) => {
    const agent = await agentRepo.findById(ctx.params.id);
    if (!agent) throw Errors.notFound("Agent not found");

    if (agent.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only modify your own agents");
    }

    // Merge with existing tools (avoid duplicates)
    const currentToolIds = agent.toolIds || [];
    const newToolIds = Array.from(
      new Set([...currentToolIds, ...ctx.body.toolIds]),
    );

    const updated = await agentRepo.update(ctx.params.id, {
      toolIds: newToolIds,
    });

    return success({ agent: updated, toolsAdded: ctx.body.toolIds.length });
  },
);

// DELETE /api/agents/:id/tools - Remove tools from agent
export const DELETE = api(
  {
    auth: true,
    params: z.object({ id: z.uuid() }),
    body: z.object({
      toolIds: z.array(z.string()).min(1),
    }),
  },
  async (req, ctx) => {
    const agent = await agentRepo.findById(ctx.params.id);
    if (!agent) throw Errors.notFound("Agent not found");

    if (agent.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only modify your own agents");
    }

    const currentToolIds = agent.toolIds || [];
    const newToolIds = currentToolIds.filter(
      (id) => !ctx.body.toolIds.includes(id),
    );

    const updated = await agentRepo.update(ctx.params.id, {
      toolIds: newToolIds,
    });

    return success({ agent: updated, toolsRemoved: ctx.body.toolIds.length });
  },
);
