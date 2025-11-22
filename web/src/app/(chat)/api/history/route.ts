import { Chat, chatMember, db } from "@/db";
import { deleteAllChatsByUserId, getChatsByOrgId } from "@/db/queries";
import { getActiveOrganizationId } from "@/lib/auth";
import { api, Errors, success } from "@/lib/server";
import { and, eq, inArray } from "drizzle-orm";
import z from "zod";

export const GetChatHistoryQueryParams = z.object({
  limit: z.number().min(1).max(100).optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
  search: z.string().optional(),
});

export type GetChatHistoryResponse = {
  chats: Array<Chat & { isPinned: boolean; pinOrder?: number }>;
  hasMore: boolean;
};

// Get filtered chats for a user
export const GET = api(
  {
    auth: true,
    query: GetChatHistoryQueryParams,
  },
  async (_, ctx) => {
    const limit = ctx.query.limit ?? 10;
    const startingAfter = ctx.query.starting_after;
    const endingBefore = ctx.query.ending_before;
    const search = ctx.query.search?.trim() || undefined;

    if (startingAfter && endingBefore) {
      throw Errors.badRequest(
        "Only one of starting_after or ending_before can be provided.",
      );
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
              eq(chatMember.userId, ctx.user.id),
            ),
          )
      : [];

    const pinMap = new Map<string, { isPinned: boolean; pinOrder?: number }>();
    for (const p of pins)
      pinMap.set(p.chatId, {
        isPinned: Boolean(p.isPinned),
        pinOrder: p.pinOrder ?? undefined,
      });

    const enriched = chatsPage.chats.map((c) => ({
      ...c,
      isPinned: pinMap.get(c.id)?.isPinned ?? false,
      pinOrder: pinMap.get(c.id)?.pinOrder ?? null,
    }));

    return success({ chats: enriched, hasMore: chatsPage.hasMore });
  },
);

// Delete all chats for a user
export const DELETE = api({ auth: true }, async (req, ctx) => {
  const result = await deleteAllChatsByUserId({ userId: ctx.user.id });
  return success(result);
});
