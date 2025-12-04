import { chatRepo } from "@/db/repositories/chat-repo";
import { getActiveOrganizationId } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { ForbiddenError, NotFoundError } from "@/lib/server/errors";
import { requireAuth } from "@/middleware/auth";
import { hasPermission, isMemberOf } from "@/lib/permissions";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const bodySchema = z.object({
  visibility: z.enum(["private", "public"]),
});

const router = createRouter();

router.patch(
  "/chat/:id/visibility",
  requireAuth,
  zValidator("param", paramsSchema),
  zValidator("json", bodySchema),
  async (c) => {
    const { user, activeOrgId, session } = c.var;
    const { id } = c.req.valid("param");
    const { visibility } = c.req.valid("json");

    const chat = await chatRepo.findById(id);
    if (!chat) {
      throw new NotFoundError("Chat not found");
    }

    const organizationId =
      activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

    if (chat.organizationId !== organizationId) {
      throw new ForbiddenError("Chat does not belong to your organization");
    }

    const isOrgMember = await isMemberOf(user!.id, chat.organizationId);
    if (!isOrgMember) {
      throw new ForbiddenError("You are not a member of this organization");
    }

    if (chat.creatorId !== user!.id) {
      const canUpdate = await hasPermission(
        "chat",
        "update",
        chat.organizationId,
        session as any,
      );
      if (!canUpdate) {
        throw new ForbiddenError("You don't have permission to update chats");
      }
    }

    const updated = await chatRepo.updateVisibilityById({
      chatId: chat.id,
      visibility,
    });

    return c.json({ success: true, chat: updated });
  },
);

export default router;
