import { deleteAllChatsByUserId, getChatsByUserId } from "@/db/queries";
import { getSession } from "@/lib/auth";
import { ChatSDKError } from "@/lib/errors";
import { api, Errors, success } from "@/lib/server";
import z from "zod";

export const GET = api(
  {
    auth: true,
    query: z.object({
      limit: z.number().min(1).max(100).optional(),
      starting_after: z.string().optional(),
      ending_before: z.string().optional(),
      search: z.string().optional(),
    }),
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

    const chats = await getChatsByUserId({
      id: ctx.user.id,
      limit,
      startingAfter,
      endingBefore,
      search,
    });

    return success(chats);
  },
);

export async function DELETE() {
  const session = await getSession();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const result = await deleteAllChatsByUserId({ userId: session.user.id });

  return Response.json(result, { status: 200 });
}
