import { chat, type Chat, chatMember, db } from "@/db";
import { chatRepo } from "@/db/repositories";
import { getActiveOrganizationId } from "@/lib/auth";
import { createRouter } from "@/lib/create-app";
import { requireAuth } from "@/middleware/auth";
import { ValidationError } from "@circulo-ai/types";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

const getQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
  search: z.string().optional(),
  archived: z.enum(["true", "false"]).optional(),
});

const router = createRouter();

router.get(
  "/history",
  requireAuth,
  zValidator("query", getQuerySchema),
  async (c) => {
    const { user, activeOrgId } = c.var;
    const { limit, starting_after, ending_before, search, archived } =
      c.req.valid("query");

    if (starting_after && ending_before) {
      throw new ValidationError("query", [
        {
          message:
            "Only one of starting_after or ending_before can be provided.",
        },
      ]);
    }

    const organizationId =
      activeOrgId ?? (await getActiveOrganizationId(c.req.raw));

    const chatsPage = await chatRepo.getChatsByOrgId({
      id: organizationId,
      userId: user!.id,
      limit: limit ?? 10,
      startingAfter: starting_after,
      endingBefore: ending_before,
      search: search?.trim() || undefined,
      archived: archived === "true",
    });

    const chatIds = chatsPage.chats.map((chat) => chat.id);

    const pins = chatIds.length
      ? await db
          .select({
            chatId: chatMember.chatId,
            isPinned: chatMember.isPinned,
            pinOrder: chatMember.pinOrder,
          })
          .from(chatMember)
          .where(
            and(
              inArray(chatMember.chatId, chatIds),
              eq(chatMember.userId, user!.id),
            ),
          )
      : [];

    const pinMap = new Map<string, { isPinned: boolean; pinOrder?: number }>();
    for (const pin of pins) {
      pinMap.set(pin.chatId, {
        isPinned: Boolean(pin.isPinned),
        pinOrder: pin.pinOrder ?? undefined,
      });
    }

    const enriched: Array<Chat & { isPinned: boolean; pinOrder?: number }> =
      chatsPage.chats.map((chat) => ({
        ...chat,
        isPinned: pinMap.get(chat.id)?.isPinned ?? false,
        pinOrder: pinMap.get(chat.id)?.pinOrder ?? undefined,
      }));

    return c.json({ chats: enriched, hasMore: chatsPage.hasMore });
  },
);

router.delete("/history", requireAuth, async (c) => {
  const organizationId =
    c.var.activeOrgId ?? (await getActiveOrganizationId(c.req.raw));
  const userId = c.var.user!.id;
  const ownedChats = await db
    .select({ id: chat.id })
    .from(chat)
    .where(
      and(
        eq(chat.creatorId, userId),
        eq(chat.organizationId, organizationId),
        eq(chat.isDeleted, false),
      ),
    );

  if (ownedChats.length === 0) return c.json({ deletedCount: 0 });

  // Keep this operation scoped to the active workspace and use the existing
  // soft-delete semantics so shared workspace data cannot be removed by a
  // user clearing their personal history.
  const deleted = await db
    .update(chat)
    .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(chat.creatorId, userId),
        eq(chat.organizationId, organizationId),
        eq(chat.isDeleted, false),
      ),
    )
    .returning({ id: chat.id });

  return c.json({ deletedCount: deleted.length });
});

export default router;
