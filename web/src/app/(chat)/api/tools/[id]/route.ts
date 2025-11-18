import { toolRepo } from "@/db/repositories/tool-repo";
import { updateToolSchema } from "@/db/schema";
import { api, Errors, success } from "@/lib/server";
import { z } from "zod";

export const GET = api(
  {
    auth: true,
    params: z.object({ id: z.uuid() }),
  },
  async (req, ctx) => {
    const tool = await toolRepo.findById(ctx.params.id);
    if (!tool) {
      throw Errors.notFound("Tool not found");
    }

    // System tools are accessible to all
    if (!tool.isSystem && tool.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only access your own tools");
    }

    return success({ tool });
  },
);

export const PATCH = api(
  {
    auth: true,
    params: z.object({ id: z.uuid() }),
    body: updateToolSchema,
  },
  async (req, ctx) => {
    const existing = await toolRepo.findById(ctx.params.id);
    if (!existing) throw Errors.notFound("Tool not found");

    if (existing.isSystem) {
      throw Errors.forbidden("Cannot modify system tools");
    }

    if (existing.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only update your own tools");
    }

    const updated = await toolRepo.update(ctx.params.id, ctx.body);
    return success({ tool: updated });
  },
);

export const DELETE = api(
  {
    auth: true,
    params: z.object({ id: z.uuid() }),
  },
  async (req, ctx) => {
    const existing = await toolRepo.findById(ctx.params.id);
    if (!existing) throw Errors.notFound("Tool not found");

    if (existing.isSystem) {
      throw Errors.forbidden("Cannot delete system tools");
    }

    if (existing.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only delete your own tools");
    }

    await toolRepo.delete(ctx.params.id);
    return success({ deleted: true });
  },
);
