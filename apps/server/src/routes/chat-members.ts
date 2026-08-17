import type { RequestServices } from "@/di/di-context";
import { getActiveOrganizationId } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { ForbiddenError, NotFoundError } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const router = createRouter();

router.get(
  "/chat/:id/members",
  requireAuth,
  zValidator("param", z.object({ id: z.uuid() })),
  async (c) => {
    const { id } = c.req.valid("param");
    const di: RequestServices = c.di;
    const organizationId =
      c.get("activeOrgId") ?? (await getActiveOrganizationId(c.req.raw));
    const chat = await di.ChatRepository.findById(id);

    if (!chat) throw new NotFoundError("Chat not found");
    if (chat.organizationId !== organizationId) {
      throw new ForbiddenError("Chat does not belong to your organization");
    }

    const isMember = await di.ChatMemberRepository.isMember(c.var.user!.id, id);
    if (!isMember)
      throw new ForbiddenError("You are not a member of this chat");

    const humanMemberCount =
      await di.ChatMemberRepository.countActiveForChat(id);

    return c.json({
      humanMemberCount,
      canEditMessages: humanMemberCount <= 1,
    });
  },
);

export default router;
