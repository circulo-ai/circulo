import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { BadRequestError, ForbiddenError, NotFoundError } from "@/lib/server/errors";
import { getActiveOrganizationId } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { DI_TOKENS, type RequestContainer } from "@/di/container";

const router = createRouter();

const visibilitySchema = z.object({
  id: z.uuid(),
  visibility: z.enum(["private", "public"]),
});

router.patch(
  "/chat/visibility",
  requireAuth,
  zValidator("json", visibilitySchema),
  async (c) => {
    const { id, visibility } = c.req.valid("json");
    const { session, activeOrgId, di } = c.var as typeof c.var & { di: RequestContainer };
    const activeOrganizationId = activeOrgId ?? (await getActiveOrganizationId(c.req.raw));
    if (!activeOrganizationId) throw new ForbiddenError("No active organization");

    const canUpdate = await hasPermission("chat", "update", activeOrganizationId, session as any);
    if (!canUpdate) throw new ForbiddenError("You don't have permission to update chat visibility");

    const useCase = di.resolve(DI_TOKENS.ChangeChatVisibilityUseCase);
    const result = await useCase.execute({ id, visibility });
    if (result.isFailure) {
      const msg = result.getError() ?? "Unable to update chat visibility";
      if (/not found/i.test(msg)) throw new NotFoundError(msg);
      throw new BadRequestError(msg);
    }
    return c.json({ success: true }, 200);
  },
);

export default router;
