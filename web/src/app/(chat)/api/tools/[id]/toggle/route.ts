import { toolRepo } from "@/db/repositories/tool-repo";
import { api, Errors, success } from "@/lib/server";
import { z } from "zod";

export const POST = api(
  {
    auth: true,
    params: z.object({ id: z.uuid() }),
    body: z.object({
      isActive: z.boolean(),
    }),
  },
  async (req, ctx) => {
    const tool = await toolRepo.findById(ctx.params.id);
    if (!tool) throw Errors.notFound("Tool not found");

    if (tool.isSystem) {
      throw Errors.forbidden("Cannot toggle system tools");
    }

    if (tool.userId !== ctx.user.id) {
      throw Errors.forbidden("You can only toggle your own tools");
    }

    const updated = await toolRepo.toggleActive(
      ctx.params.id,
      ctx.body.isActive,
    );

    return success({ tool: updated });
  },
);