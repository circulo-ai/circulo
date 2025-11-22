import { Chat, chatMember, db } from "@/db";
import { deleteAllChatsByUserId, getChatsByOrgId } from "@/db/queries";
import { getActiveOrganizationId } from "@/lib/auth";
import { createSafeRoute, ValidationError } from "@/lib/server";
import { authMiddleware } from "@/lib/server/middlewares";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

const getQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
  search: z.string().optional(),
});

export type GetChatHistoryResponse = {
  chats: Array<Chat & { isPinned: boolean; pinOrder?: number }>;
  hasMore: boolean;
};

// GET /api/chats - Get filtered chats for a user
export const GET = createSafeRoute()
  .methods("GET")
  .query(getQuerySchema)
  .use(authMiddleware())
  .handler(async (req, ctx) => {
    const { user } = ctx.data;
    const limit = ctx.query.limit ?? 10;
    const startingAfter = ctx.query.starting_after;
    const endingBefore = ctx.query.ending_before;
    const search = ctx.query.search?.trim() || undefined;

    if (startingAfter && endingBefore) {
      throw new ValidationError("query", [
        {
          message:
            "Only one of starting_after or ending_before can be provided.",
        },
      ]);
    }

    const chatsPage = await getChatsByOrgId({
      id: await getActiveOrganizationId(),
      limit,
      startingAfter,
      endingBefore,
      search,
    });

    const chatIds = chatsPage.chats.map((c) => c.id);

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
              eq(chatMember.userId, user.id),
            ),
          )
      : [];

    const pinMap = new Map<string, { isPinned: boolean; pinOrder?: number }>();
    for (const p of pins) {
      pinMap.set(p.chatId, {
        isPinned: Boolean(p.isPinned),
        pinOrder: p.pinOrder ?? undefined,
      });
    }

    const enriched = chatsPage.chats.map((c) => ({
      ...c,
      isPinned: pinMap.get(c.id)?.isPinned ?? false,
      pinOrder: pinMap.get(c.id)?.pinOrder ?? null,
    }));

    return Response.json({ chats: enriched, hasMore: chatsPage.hasMore });
  });

// DELETE /api/chats - Delete all chats for a user
export const DELETE = createSafeRoute()
  .methods("DELETE")
  .use(authMiddleware())
  .handler(async (req, ctx) => {
    const result = await deleteAllChatsByUserId({ userId: ctx.data.user.id });
    return Response.json(result);
  });
