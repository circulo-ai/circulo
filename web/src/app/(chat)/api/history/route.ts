import { Chat } from "@/db";
import { deleteAllChatsByUserId, getChatsByUserId } from "@/db/queries";
import { api, Errors, success } from "@/lib/server";
import z from "zod";

export const GetChatHistoryQueryParams = z.object({
  limit: z.number().min(1).max(100).optional(),
  starting_after: z.string().optional(),
  ending_before: z.string().optional(),
  search: z.string().optional(),
});

export type GetChatHistoryResponse = {
  chats: Chat[];
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

    const chats: GetChatHistoryResponse = await getChatsByUserId({
      id: ctx.user.id,
      limit,
      startingAfter,
      endingBefore,
      search,
    });

    return success(chats);
  },
);

// Delete all chats for a user
export const DELETE = api({ auth: true }, async (req, ctx) => {
  const result = await deleteAllChatsByUserId({ userId: ctx.user.id });
  return success(result);
});
